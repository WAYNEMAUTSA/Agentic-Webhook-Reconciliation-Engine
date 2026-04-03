import { supabase } from '../db/supabase.js';
import { applyEvent } from '../services/stateMachine.js';
import { NormalizedEvent, TransactionState } from '../types/index.js';

// ────────────────────────────────────────────────────────────────
// RAZORPAY CHAOS HEALER — Real-Time Self-Healing Pipeline
// ────────────────────────────────────────────────────────────────
//
// Handles Razorpay infrastructure chaos BEFORE the state machine:
//  • Out-of-order: "captured" arrives before "created" → synthesize bridge events
//  • Dropped: "created" never arrives → create synthetic bridge on next event
//  • Duplicates: same event twice → suppress silently
//  • Invalid payload: missing fields → recover from system state
//
// NO anomalies or heal jobs are created for these common chaos patterns.
// ────────────────────────────────────────────────────────────────

interface ChaosContext {
  gatewayTxnId: string;
  gateway: string;
  incomingEventType: TransactionState;
  amount: number;
  currency: string;
  rawPayload: unknown;
  idempotencyKey: string;
  gatewayTimestamp: Date;
}

interface HealResult {
  status: 'processed' | 'suppressed' | 'synthetic_bridge';
  events_processed: number;
  agent_log: string;
  suppressed: boolean;
}

/**
 * Canonical Razorpay lifecycle:
 *   created → authorized → captured → settled
 *
 * Refunded and failed can branch from captured.
 */
const RAZORPAY_LIFECYCLE: TransactionState[] = [
  'initiated',
  'created',
  'authorized',
  'captured',
  'settled',
];

const TERMINAL_STATES: TransactionState[] = ['failed', 'refunded'];

/**
 * Map Razorpay webhook event names to our internal state names.
 */
const RAZORPAY_EVENT_MAP: Record<string, TransactionState> = {
  'payment.created': 'created',
  'payment.authorized': 'authorized',
  'payment.captured': 'captured',
  'payment.failed': 'failed',
  'payment.refunded': 'refunded',
  'order.created': 'created',
  'order.paid': 'captured',
};

/**
 * Real-Time Chaos Healer.
 *
 * Called BEFORE the state machine. Analyzes the incoming event,
 * detects chaos patterns, synthesizes missing events if needed,
 * and ensures the state machine receives events in the correct order.
 */
export async function chaosHealer(ctx: ChaosContext): Promise<HealResult> {
  const { gatewayTxnId, gateway, incomingEventType, amount, currency, rawPayload, idempotencyKey, gatewayTimestamp } = ctx;

  // ── Step 1: Detect duplicate suppression ──
  const { data: existingEvents } = await supabase
    .from('webhook_events')
    .select('event_type, idempotency_key')
    .eq('transaction_id', gatewayTxnId); // We'll match by gateway_txn_id below

  // More precise duplicate check by idempotency key
  const { count: existingCount } = await supabase
    .from('webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('idempotency_key', idempotencyKey);

  if (existingCount && existingCount > 0) {
    return {
      status: 'suppressed',
      events_processed: 0,
      agent_log: `Duplicate suppressed: ${incomingEventType} for ${gatewayTxnId}`,
      suppressed: true,
    };
  }

  // ── Step 2: Get current state of this transaction ──
  const { data: existingTxn } = await supabase
    .from('transactions')
    .select('id, current_state, gateway_txn_id')
    .eq('gateway_txn_id', gatewayTxnId)
    .single();

  // ── Step 3: Get all events for this transaction ──
  const { data: txnEvents } = await supabase
    .from('webhook_events')
    .select('event_type, gateway_timestamp')
    .eq('transaction_id', existingTxn?.id || '')
    .order('gateway_timestamp', { ascending: true })
    .returns<{ event_type: string; gateway_timestamp: string }[]>();

  const presentStates = new Set((txnEvents || []).map((e) => e.event_type));
  const currentState = existingTxn?.current_state as TransactionState | undefined;

  // ── Step 4: Detect chaos patterns and heal ──
  const actions: string[] = [];
  let eventsProcessed = 0;

  // If transaction doesn't exist yet, create it with the first event
  if (!existingTxn) {
    // For out-of-order: if the first event we see is "captured" but we're missing
    // "created" and "authorized", synthesize bridge events first
    if (incomingEventType === 'captured' && !presentStates.has('created')) {
      actions.push('SYNTHETIC BRIDGE: created → authorized → captured (out-of-order recovery)');
      await synthesizeBridgeEvent(gatewayTxnId, gateway, 'created', amount, currency, rawPayload, gatewayTimestamp);
      await synthesizeBridgeEvent(gatewayTxnId, gateway, 'authorized', amount, currency, rawPayload, gatewayTimestamp);
      eventsProcessed = 2;
    } else if (incomingEventType === 'authorized' && !presentStates.has('created')) {
      actions.push('SYNTHETIC BRIDGE: created → authorized (out-of-order recovery)');
      await synthesizeBridgeEvent(gatewayTxnId, gateway, 'created', amount, currency, rawPayload, gatewayTimestamp);
      eventsProcessed = 1;
    }
    // Terminal states on first event: just process them (no bridge needed for failed/refunded on new txn)
  } else {
    // Transaction exists — check for out-of-order or dropped events
    const currentIdx = RAZORPAY_LIFECYCLE.indexOf(currentState);
    const incomingIdx = RAZORPAY_LIFECYCLE.indexOf(incomingEventType);

    // Out-of-order: incoming event is earlier in lifecycle than current state
    if (currentIdx !== -1 && incomingIdx !== -1 && incomingIdx < currentIdx) {
      actions.push(`OUT-OF-ORDER suppressed: ${incomingEventType} arrived after ${currentState}`);
      return {
        status: 'suppressed',
        events_processed: 0,
        agent_log: actions.join('; '),
        suppressed: true,
      };
    }

    // Dropped: incoming event skips intermediate states
    // e.g. current=created, incoming=captured (missing authorized)
    if (currentIdx !== -1 && incomingIdx !== -1 && incomingIdx > currentIdx + 1) {
      const missingStates = RAZORPAY_LIFECYCLE.slice(currentIdx + 1, incomingIdx);
      actions.push(`DROPPED EVENT BRIDGE: synthesizing ${missingStates.join(' → ')} before ${incomingEventType}`);

      for (const missingState of missingStates) {
        await synthesizeBridgeEvent(gatewayTxnId, gateway, missingState, amount, currency, rawPayload, gatewayTimestamp);
        eventsProcessed++;
      }
    }

    // Same state arrived again (duplicate at state level)
    if (currentState === incomingEventType) {
      actions.push(`Duplicate state suppressed: ${incomingEventType} (already ${currentState})`);
      return {
        status: 'suppressed',
        events_processed: 0,
        agent_log: actions.join('; '),
        suppressed: true,
      };
    }
  }

  // ── Step 5: Now process the main event ──
  const mainEvent: NormalizedEvent = {
    gatewayTxnId,
    gateway,
    eventType: incomingEventType,
    gatewayTimestamp,
    amount,
    currency,
    idempotencyKey,
    rawPayload: {
      original: rawPayload,
      healed: true,
      chaos_actions: actions,
      events_synthesized: eventsProcessed,
    },
  };

  await applyEvent(mainEvent);
  eventsProcessed++;

  const totalProcessed = eventsProcessed;
  const status = eventsProcessed > 1 ? 'synthetic_bridge' : 'processed';

  return {
    status,
    events_processed: totalProcessed,
    agent_log: actions.length > 0
      ? `Chaos healed: ${actions.join('; ')}. Processed ${totalProcessed} event(s).`
      : `Normal processing: ${incomingEventType} for ${gatewayTxnId}`,
    suppressed: false,
  };
}

/**
 * Synthesize a bridge event to fill a gap in the transaction lifecycle.
 * This allows the state machine to process events in the correct order.
 */
async function synthesizeBridgeEvent(
  gatewayTxnId: string,
  gateway: string,
  eventType: TransactionState,
  amount: number,
  currency: string,
  rawPayload: unknown,
  mainEventTimestamp: Date,
): Promise<void> {
  // Create a synthetic event with a timestamp slightly before the main event
  const syntheticTimestamp = new Date(mainEventTimestamp.getTime() - 1000);

  const syntheticEvent: NormalizedEvent = {
    gatewayTxnId,
    gateway,
    eventType,
    gatewayTimestamp: syntheticTimestamp,
    amount,
    currency,
    idempotencyKey: `${gateway}:${gatewayTxnId}:${eventType}:synthetic_bridge`,
    rawPayload: {
      synthetic: true,
      reason: `Bridge event synthesized for out-of-order/dropped recovery before ${mainEventTimestamp.toISOString()}`,
      original_payload: rawPayload,
    },
  };

  await applyEvent(syntheticEvent);
  console.log(`  [ChaosHealer] Synthesized bridge event: ${eventType} for ${gatewayTxnId}`);
}

/**
 * Extract and normalize a Razorpay webhook payload into chaos context.
 * Returns null if the payload is fundamentally broken.
 */
export function extractRazorpayContext(body: unknown): ChaosContext | null {
  if (!body || typeof body !== 'object') return null;

  const b = body as Record<string, unknown>;
  const eventType = String(b.event || '');

  // Try nested payload first, then flat
  const entity = (b.payload as any)?.payment?.entity ?? b;

  if (!entity?.id) return null;

  const stateMap = RAZORPAY_EVENT_MAP;
  const normalizedState = stateMap[eventType] || 'unknown';

  const rawAmount = entity.amount ?? 0;
  const amountInRupees = typeof rawAmount === 'number' && rawAmount > 100 ? rawAmount / 100 : Number(rawAmount);

  const created_at = entity.created_at ?? Math.floor(Date.now() / 1000);
  const timestamp = new Date(created_at > 1e12 ? created_at : created_at * 1000);

  return {
    gatewayTxnId: entity.id,
    gateway: 'razorpay',
    incomingEventType: normalizedState as TransactionState,
    amount: amountInRupees,
    currency: entity.currency || 'INR',
    rawPayload: body,
    idempotencyKey: `razorpay:${entity.id}:${eventType}`,
    gatewayTimestamp: timestamp,
  };
}
