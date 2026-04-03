import { Router, Request, Response } from 'express';
import { applyEvent } from '../services/stateMachine.js';
import { NormalizedEvent } from '../types/index.js';
import { healWebhook, webhookEventSchema } from '../agents/webhookHealerAgent.js';
import { supabase } from '../db/supabase.js';

const router = Router();

// POST /webhook/razorpay — incoming Razorpay webhook with AI healing
router.post('/razorpay', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const eventType = body.event;

    // Extract entity — handle nested or flat payloads
    let entity = body.payload?.payment?.entity;

    // Fallback: try direct entity extraction for schema drift
    if (!entity && body.id) {
      entity = body;
    }

    if (!entity?.id) {
      return res.status(400).json({ error: 'Invalid webhook payload — no transaction ID found' });
    }

    // Fetch last known system state for this transaction (out-of-order detection)
    const { data: existingTxn } = await supabase
      .from('transactions')
      .select('current_state, amount, currency, gateway, gateway_txn_id')
      .eq('gateway_txn_id', entity.id)
      .single();

    // Build the raw payload for the healer agent
    const rawPayload: Record<string, unknown> = {
      transaction_id: entity.id,
      amount: entity.amount,
      currency: entity.currency,
      status: eventType,
      timestamp: entity.created_at,
      customer_id: entity.customer_id ?? entity.contact,
      email: entity.email ?? entity.contact_details,
      description: entity.description ?? entity.notes,
      gateway: 'razorpay',
      metadata: entity,
    };

    // Run through the Autonomous Healer Agent
    const healResult = healWebhook({
      payload: rawPayload,
      systemState: existingTxn
        ? {
            current_state: existingTxn.current_state,
            amount: existingTxn.amount,
            currency: existingTxn.currency,
            gateway: existingTxn.gateway,
            transaction_id: existingTxn.gateway_txn_id,
          }
        : undefined,
      provider: 'razorpay',
      schema: webhookEventSchema,
    });

    // Handle fatal errors
    if (healResult.status === 'fatal_error') {
      console.error('[HealerAgent] FATAL:', healResult.agent_log);

      // Log as anomaly
      await supabase.from('anomalies').insert({
        transaction_id: entity.id,
        type: 'missing_event',
        severity: 'high',
        description: `Healer agent could not repair payload: ${healResult.agent_log}`,
      });

      return res.status(422).json({
        received: false,
        error: healResult.agent_log,
        agent_log: healResult.actions_taken,
        status: 'fatal_error',
      });
    }

    // Build normalized event from healed payload
    const healed = healResult.healed_payload!;
    const normalizedEvent: NormalizedEvent = {
      gatewayTxnId: String(healed.transaction_id),
      gateway: 'razorpay',
      eventType: healed.status as NormalizedEvent['eventType'],
      gatewayTimestamp: new Date(healed.timestamp as string),
      amount: typeof healed.amount === 'string' ? parseFloat(healed.amount) : (healed.amount as number),
      currency: String(healed.currency),
      idempotencyKey: `razorpay:${healed.transaction_id}:${eventType}`,
      rawPayload: {
        original: body,
        healed: healResult.healed_payload,
        agent_log: healResult.agent_log,
        confidence_score: healResult.confidence_score,
        actions_taken: healResult.actions_taken,
        violations_remaining: healResult.schema_violations_remaining,
      },
    };

    // Process the healed event through the state machine
    await applyEvent(normalizedEvent);

    // Log agent activity for audit trail
    if (healResult.actions_taken.length > 0) {
      console.log('[HealerAgent]', healResult.agent_log);
      console.log('[HealerAgent] Confidence:', healResult.confidence_score);
    }

    return res.status(200).json({
      received: true,
      eventId: entity.id,
      healed: healResult.actions_taken.length > 0,
      agent_log: healResult.actions_taken.length > 0 ? healResult.agent_log : null,
      confidence_score: healResult.confidence_score,
    });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /webhook/heal-log/:txnId — Retrieve healer agent audit log for a transaction
router.get('/heal-log/:txnId', async (req: Request, res: Response) => {
  try {
    const { txnId } = req.params;

    const { data: events } = await supabase
      .from('webhook_events')
      .select('raw_payload')
      .eq('transaction_id', txnId)
      .order('gateway_timestamp', { ascending: false })
      .limit(1);

    if (!events || events.length === 0) {
      return res.status(404).json({ error: 'No events found for this transaction' });
    }

    const rawPayload = events[0].raw_payload as any;
    const agentInfo = {
      agent_log: rawPayload?.agent_log,
      confidence_score: rawPayload?.confidence_score,
      actions_taken: rawPayload?.actions_taken,
      schema_violations_remaining: rawPayload?.violations_remaining,
      original_payload: rawPayload?.original,
      healed_payload: rawPayload?.healed,
    };

    return res.json(agentInfo);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
