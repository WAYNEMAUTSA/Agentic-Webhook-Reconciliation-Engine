import { supabase } from '../db/supabase.js';
import { healQueue } from '../queues/index.js';
import { NormalizedEvent } from '../types/index.js';
import { getMissingStates } from './gapDetector.js';

// Canonical lifecycle order for state-advancement guard
// Note: 'initiated' excluded — not emitted by webhooks
const LIFECYCLE_ORDER = [
  'created',
  'authorized',
  'captured',
  'settled',
];

function lifecycleIndex(state: string): number {
  return LIFECYCLE_ORDER.indexOf(state);
}

/**
 * Apply an event to the state machine.
 *
 * @param event         - The normalized event to apply.
 * @param skipGapDetect - When true (bridge events only) we skip gap-detection
 *                        and heal-job creation so bridge events don't
 *                        recursively spawn more heal jobs for themselves.
 */
export async function applyEvent(
  event: NormalizedEvent,
  skipGapDetect = false,
): Promise<void> {
  // Step 1: Upsert into transactions table
  // We only advance current_state if the incoming event is at the same or
  // later position in the lifecycle than the existing state.
  const { data: existingTxn } = await supabase
    .from('transactions')
    .select('id, current_state, amount')
    .eq('gateway', event.gateway)
    .eq('gateway_txn_id', event.gatewayTxnId)
    .maybeSingle();

  let transactionId: string;

  if (!existingTxn) {
    // Brand new transaction — insert
    const { data: inserted, error: insertError } = await supabase
      .from('transactions')
      .insert({
        gateway: event.gateway,
        gateway_txn_id: event.gatewayTxnId,
        current_state: event.eventType,
        amount: event.amount,
        currency: event.currency,
      })
      .select('id')
      .single();

    if (insertError) {
      // Race condition: another request inserted first — re-fetch
      const { data: reFetched } = await supabase
        .from('transactions')
        .select('id, current_state')
        .eq('gateway', event.gateway)
        .eq('gateway_txn_id', event.gatewayTxnId)
        .single();

      if (!reFetched) {
        throw new Error(`Failed to insert or find transaction: ${insertError.message}`);
      }
      transactionId = reFetched.id;
    } else {
      transactionId = inserted!.id;
    }
  } else {
    transactionId = existingTxn.id;

    // Only advance state if incoming event is ≥ current state in lifecycle
    const currentIdx = lifecycleIndex(existingTxn.current_state);
    const incomingIdx = lifecycleIndex(event.eventType);

    const shouldAdvance =
      // Unknown / terminal states always update
      currentIdx === -1 ||
      incomingIdx === -1 ||
      incomingIdx >= currentIdx;

    if (shouldAdvance) {
      await supabase
        .from('transactions')
        .update({
          current_state: event.eventType,
          amount: event.amount > 0 ? event.amount : existingTxn.amount ?? event.amount,
          currency: event.currency,
        })
        .eq('id', transactionId);
    }
  }

  // Step 2: Insert into webhook_events (idempotent)
  const { error: eventError } = await supabase
    .from('webhook_events')
    .insert({
      transaction_id: transactionId,
      idempotency_key: event.idempotencyKey,
      event_type: event.eventType,
      gateway_timestamp: event.gatewayTimestamp,
      source: 'webhook',
      raw_payload: event.rawPayload,
    });

  if (eventError) {
    // If this is a conflict on idempotency_key, the event was already processed
    if (eventError.code === '23505') {
      console.log('Duplicate event detected, skipping:', event.idempotencyKey);
      return;
    }
    throw new Error(`Failed to insert webhook_event: ${eventError.message}`);
  }

  // Step 3: Skip gap detection for bridge / synthetic events
  if (skipGapDetect) return;

  // Step 4: Check for missing predecessor states
  const missingStates = await getMissingStates(transactionId, event.eventType);

  // Step 4a: No missing states — ledger is up to date
  if (missingStates.length === 0) return;

  // Step 4b: Missing states detected — create a heal job
  const { data: healData, error: healError } = await supabase
    .from('heal_jobs')
    .insert({
      transaction_id: transactionId,
      status: 'pending',
      missing_states: missingStates,
    })
    .select('id')
    .single();

  if (healError) {
    throw new Error(`Failed to insert heal_job: ${healError.message}`);
  }

  await healQueue.add(`heal-${transactionId}`, {
    transactionId,
    missingStates,
    gateway: event.gateway,
    healJobId: healData.id,
  });

  // NOTE: We intentionally do NOT set the transaction to 'unknown' here.
  // The transaction keeps its current best-known state in the lifecycle.
  // When the heal worker injects missing events, applyEvent will properly
  // advance the state through the canonical lifecycle order.
  // Setting 'unknown' caused UI issues where healed transactions stayed
  // labeled as "Unknown" even after being fully reconciled.
}
