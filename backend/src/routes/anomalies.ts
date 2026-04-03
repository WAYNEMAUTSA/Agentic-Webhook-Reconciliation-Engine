import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase.js';
import { applyEvent } from '../services/stateMachine.js';
import axios from 'axios';

const router = Router();

// Helper function to record healer audit trail
async function recordAuditTrail(entry: {
  gatewayTxnId: string;
  gateway: string;
  original_event_type: string;
  healed_event_type: string;
  outcome: string;
  actions_taken: string[];
  bridge_events_synthesized: number;
  confidence_score: number;
  reasoning_trail: string;
}): Promise<void> {
  try {
    await supabase.from('healer_audit_log').insert({
      gateway_txn_id: entry.gatewayTxnId,
      gateway: entry.gateway,
      original_event_type: entry.original_event_type,
      healed_event_type: entry.healed_event_type,
      outcome: entry.outcome,
      actions_taken: entry.actions_taken,
      bridge_events_synthesized: entry.bridge_events_synthesized,
      confidence_score: entry.confidence_score,
      reasoning_trail: entry.reasoning_trail,
    });
  } catch (err: any) {
    console.error('[AnomalyAudit] Failed to record audit trail:', err.message);
  }
}

// GET /anomalies — unresolved anomalies with transaction data (or all if include_resolved=true)
router.get('/', async (req: Request, res: Response) => {
  try {
    const includeResolved = req.query.include_resolved === 'true';

    let query = supabase
      .from('anomalies')
      .select(
        `
        *,
        transactions (
          gateway,
          gateway_txn_id,
          amount
        )
      `
      )
      .order('created_at', { ascending: false });

    if (!includeResolved) {
      query = query.is('resolved_at', null);
    }

    const { data: anomalies, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Compute a 'status' field from resolved_at so frontend components that
    // expect status: 'open' | 'resolved' get a consistent shape.
    const enriched = (anomalies || []).map((a: any) => ({
      ...a,
      status: a.resolved_at ? 'resolved' : 'open',
    }));

    return res.json({ data: enriched });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /anomalies/:id/resolve — mark anomaly as resolved and update transaction state
router.patch('/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note, targetState } = req.body;

    // First, get the anomaly with its transaction
    const { data: anomaly, error: anomalyErr } = await supabase
      .from('anomalies')
      .select('*, transactions(gateway, gateway_txn_id, amount, current_state)')
      .eq('id', id)
      .single();

    if (anomalyErr || !anomaly) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    // If targetState is provided, update the transaction's current_state
    if (targetState && anomaly.transactions) {
      await supabase
        .from('transactions')
        .update({ current_state: targetState })
        .eq('gateway_txn_id', anomaly.transactions.gateway_txn_id);
    }

    // Mark the anomaly as resolved
    const { data, error } = await supabase
      .from('anomalies')
      .update({
        resolved_at: new Date().toISOString(),
        resolution_notes: note || 'Manually resolved',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Record in healer_audit_log for AI Recovery Rate tracking
    if (anomaly.transactions) {
      await recordAuditTrail({
        gatewayTxnId: anomaly.transactions.gateway_txn_id || 'unknown',
        gateway: anomaly.transactions.gateway || 'unknown',
        original_event_type: anomaly.type,
        healed_event_type: targetState || anomaly.transactions.current_state || 'unknown',
        outcome: 'healed',
        actions_taken: [`Manual resolution: ${note || 'Manually resolved'}`],
        bridge_events_synthesized: 0,
        confidence_score: 1.0,
        reasoning_trail: 'Anomaly manually resolved by operator',
      });
    }

    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /anomalies/:id/reject — mark anomaly as rejected (won't auto-heal)
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    // First, get the anomaly with its transaction
    const { data: anomaly, error: anomalyErr } = await supabase
      .from('anomalies')
      .select('*, transactions(gateway, gateway_txn_id, amount, current_state)')
      .eq('id', id)
      .single();

    if (anomalyErr || !anomaly) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    const { data, error } = await supabase
      .from('anomalies')
      .update({
        resolved_at: new Date().toISOString(),
        resolution_notes: note || 'Rejected — no auto-heal action taken',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Record in healer_audit_log for AI Recovery Rate tracking
    if (anomaly.transactions) {
      await recordAuditTrail({
        gatewayTxnId: anomaly.transactions.gateway_txn_id || 'unknown',
        gateway: anomaly.transactions.gateway || 'unknown',
        original_event_type: anomaly.type,
        healed_event_type: anomaly.type,
        outcome: 'suppressed',
        actions_taken: [`Anomaly rejected: ${note || 'Rejected — no auto-heal action taken'}`],
        bridge_events_synthesized: 0,
        confidence_score: 0.5,
        reasoning_trail: 'Anomaly rejected by operator — no healing required',
      });
    }

    return res.json({ data: { ...data, status: 'rejected' } });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /anomalies/:id/refetch — retry fetching from gateway and replay events
router.post('/:id/refetch', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get the anomaly with its transaction
    const { data: anomaly, error: anomalyErr } = await supabase
      .from('anomalies')
      .select('*, transactions(gateway, gateway_txn_id, amount, current_state)')
      .eq('id', id)
      .single();

    if (anomalyErr || !anomaly) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    if (!anomaly.transactions?.gateway_txn_id) {
      return res.status(400).json({ error: 'No gateway_txn_id found for this transaction' });
    }

    const gatewayTxnId = anomaly.transactions.gateway_txn_id;
    const selfUrl = process.env.SELF_URL ?? 'http://localhost:3000';
    const fetchUrl = `${selfUrl}/mock/razorpay/${gatewayTxnId}/fetch`;

    // Call the mock gateway to fetch current state
    const response = await axios.get(fetchUrl, { validateStatus: () => true });

    if (response.status === 503) {
      return res.status(503).json({ error: 'Gateway is currently unavailable. Try again later.' });
    }

    if (response.status === 200 && response.data.status === 'conflict') {
      return res.status(409).json({
        error: 'State conflict detected. Manual review still required.',
        conflict: response.data.transaction,
      });
    }

    // Replay the events from the gateway
    const events = response.data.transaction?.events ?? [];
    const sortedEvents = events.sort(
      (a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let replayed = 0;
    for (const evt of sortedEvents) {
      const idempotencyKey = `razorpay:${gatewayTxnId}:${evt.event_type}`;

      // Insert the recovered event into webhook_events (ignore duplicates)
      const { error: eventError } = await supabase
        .from('webhook_events')
        .insert({
          transaction_id: anomaly.transactions.id,
          idempotency_key: idempotencyKey,
          event_type: evt.event_type,
          gateway_timestamp: new Date(evt.timestamp),
          source: 'gateway_poll',
          raw_payload: evt,
        });

      // Skip if duplicate (idempotency conflict)
      if (eventError && eventError.code !== '23505') {
        console.error('Failed to insert recovered event:', eventError.message);
        continue;
      }

      if (!eventError) {
        replayed++;
      }
    }

    // Update the transaction state
    if (sortedEvents.length > 0) {
      const latestState = sortedEvents[sortedEvents.length - 1].event_type;
      await supabase
        .from('transactions')
        .update({ current_state: latestState })
        .eq('gateway_txn_id', gatewayTxnId);
    }

    // Mark the anomaly as resolved since we successfully refetched and replayed
    await supabase
      .from('anomalies')
      .update({
        resolved_at: new Date().toISOString(),
        resolution_notes: `Auto-resolved: Re-fetched and replayed ${replayed} events from gateway`,
      })
      .eq('id', id);

    // Record in healer_audit_log for AI Recovery Rate tracking
    await recordAuditTrail({
      gatewayTxnId: anomaly.transactions.gateway_txn_id,
      gateway: anomaly.transactions.gateway,
      original_event_type: anomaly.type,
      healed_event_type: sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1].event_type : 'unknown',
      outcome: 'healed',
      actions_taken: [`Re-fetched from gateway`, `Replayed ${replayed}/${sortedEvents.length} events`],
      bridge_events_synthesized: 0,
      confidence_score: 0.95,
      reasoning_trail: `Anomaly auto-resolved by gateway refetch. ${replayed} events successfully replayed.`,
    });

    return res.json({
      message: `Re-fetched and replayed ${replayed} events from gateway. Anomaly resolved.`,
      replayed,
      total: sortedEvents.length,
      newState: sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1].event_type : null,
    });
  } catch (err: any) {
    console.error('Re-fetch error:', err.message);
    return res.status(500).json({ error: `Failed to re-fetch: ${err.message}` });
  }
});

// POST /anomalies/auto-handle — AI auto-handles all unresolved anomalies
router.post('/auto-handle', async (_req: Request, res: Response) => {
  try {
    // Fetch all unresolved anomalies
    const { data: anomalies, error: fetchError } = await supabase
      .from('anomalies')
      .select('*, transactions(gateway, gateway_txn_id, amount, current_state, id)')
      .is('resolved_at', null)
      .order('created_at', { ascending: false });

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    if (!anomalies || anomalies.length === 0) {
      return res.json({ message: 'No anomalies to auto-handle', handled: 0, results: [] });
    }

    const results: Array<{ id: string; transactionId: string; status: string; message: string }> = [];

    // Process each anomaly through AI auto-healing
    for (const anomaly of anomalies) {
      try {
        if (!anomaly.transactions || !anomaly.transactions.gateway_txn_id) {
          // No gateway txn ID — mark as suppressed
          await supabase
            .from('anomalies')
            .update({
              resolved_at: new Date().toISOString(),
              resolution_notes: 'AI Auto-handled: No gateway transaction ID found. Anomaly suppressed.',
            })
            .eq('id', anomaly.id);

          await recordAuditTrail({
            gatewayTxnId: 'unknown',
            gateway: anomaly.transactions?.gateway || 'unknown',
            original_event_type: anomaly.type,
            healed_event_type: 'suppressed',
            outcome: 'suppressed',
            actions_taken: ['AI auto-handled: No gateway transaction ID found'],
            bridge_events_synthesized: 0,
            confidence_score: 0.8,
            reasoning_trail: 'AI decided to suppress anomaly due to missing gateway transaction reference.',
          });

          results.push({
            id: anomaly.id,
            transactionId: anomaly.transaction_id,
            status: 'suppressed',
            message: 'AI suppressed: No gateway transaction ID',
          });
          continue;
        }

        const gatewayTxnId = anomaly.transactions.gateway_txn_id;
        const selfUrl = process.env.SELF_URL ?? 'http://localhost:3000';
        const fetchUrl = `${selfUrl}/mock/razorpay/${gatewayTxnId}/fetch`;

        // Call the mock gateway
        const response = await axios.get(fetchUrl, { validateStatus: () => true });

        if (response.status === 503) {
          // Gateway unavailable — anomaly persists, will retry
          results.push({
            id: anomaly.id,
            transactionId: anomaly.transaction_id,
            status: 'retrying',
            message: 'Gateway unavailable — AI will retry shortly',
          });
          console.log(`[AI Auto-Handle] ⏳ Anomaly ${anomaly.id} — gateway 503, retrying`);
          continue;
        }

        if (response.status === 200 && response.data.status === 'conflict') {
          // Conflict — resolve the anomaly by accepting gateway state
          const conflictData = response.data.transaction;
          const gatewayState = conflictData?.gateway_state ?? 'failed';
          const validStates = ['created', 'authorized', 'captured', 'settled', 'failed', 'refunded'];
          const authoritativeState = validStates.includes(gatewayState) ? gatewayState : 'failed';

          await supabase
            .from('transactions')
            .update({ current_state: authoritativeState })
            .eq('gateway_txn_id', gatewayTxnId);

          await supabase
            .from('anomalies')
            .update({
              resolved_at: new Date().toISOString(),
              resolution_notes: `AI auto-resolved: Conflict evaluated. Transaction state set to '${authoritativeState}'.`,
            })
            .eq('id', anomaly.id);

          await recordAuditTrail({
            gatewayTxnId,
            gateway: anomaly.transactions.gateway,
            original_event_type: anomaly.type,
            healed_event_type: authoritativeState,
            outcome: 'suppressed',
            actions_taken: [`AI evaluated conflict: set state to '${authoritativeState}'`],
            bridge_events_synthesized: 0,
            confidence_score: 0.75,
            reasoning_trail: `AI resolved conflict by accepting gateway authoritative state '${authoritativeState}'.`,
          });

          results.push({
            id: anomaly.id,
            transactionId: anomaly.transaction_id,
            status: 'healed',
            message: `AI resolved conflict — state set to '${authoritativeState}'`,
          });
          console.log(`[AI Auto-Handle] ✅ Anomaly ${anomaly.id} conflict resolved → ${authoritativeState}`);
          continue;
        }

        // Success — replay events from gateway
        const events = response.data.transaction?.events ?? [];
        const sortedEvents = events.sort(
          (a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        let replayed = 0;
        for (const evt of sortedEvents) {
          const idempotencyKey = `razorpay:${gatewayTxnId}:${evt.event_type}:ai_auto`;

          const { error: eventError } = await supabase
            .from('webhook_events')
            .insert({
              transaction_id: anomaly.transactions.id,
              idempotency_key: idempotencyKey,
              event_type: evt.event_type,
              gateway_timestamp: new Date(evt.timestamp),
              source: 'gateway_poll',
              raw_payload: evt,
            });

          if (eventError && eventError.code !== '23505') {
            console.error('Failed to insert recovered event:', eventError.message);
            continue;
          }

          if (!eventError) {
            replayed++;
            // Also update transaction state
            await supabase
              .from('transactions')
              .update({ current_state: evt.event_type })
              .eq('gateway_txn_id', gatewayTxnId);
          }
        }

        // Resolve the anomaly
        await supabase
          .from('anomalies')
          .update({
            resolved_at: new Date().toISOString(),
            resolution_notes: `AI auto-resolved: Replayed ${replayed} events from gateway`,
          })
          .eq('id', anomaly.id);

        await recordAuditTrail({
          gatewayTxnId,
          gateway: anomaly.transactions.gateway,
          original_event_type: anomaly.type,
          healed_event_type: sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1].event_type : 'unknown',
          outcome: 'healed',
          actions_taken: [`AI re-fetched from gateway`, `Replayed ${replayed} events`],
          bridge_events_synthesized: 0,
          confidence_score: 0.95,
          reasoning_trail: `AI auto-resolved by gateway refetch. ${replayed} events replayed successfully.`,
        });

        results.push({
          id: anomaly.id,
          transactionId: anomaly.transaction_id,
          status: 'healed',
          message: `AI healed — replayed ${replayed} events from gateway`,
        });
        console.log(`[AI Auto-Handle] ✅ Anomaly ${anomaly.id} healed (${replayed} events replayed)`);
      } catch (err: any) {
        console.error(`[AI Auto-Handle] Failed for anomaly ${anomaly.id}:`, err.message);
        results.push({
          id: anomaly.id,
          transactionId: anomaly.transaction_id,
          status: 'failed',
          message: `AI auto-handle error: ${err.message}`,
        });
      }
    }

    const healed = results.filter((r) => r.status === 'healed').length;
    const suppressed = results.filter((r) => r.status === 'suppressed').length;
    const retrying = results.filter((r) => r.status === 'retrying').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    return res.json({
      message: `AI processed ${results.length} anomalies: ${healed} healed, ${suppressed} suppressed, ${retrying} retrying, ${failed} failed`,
      handled: results.length,
      results,
    });
  } catch (err: any) {
    console.error('[AI Auto-Handle] Error:', err.message);
    return res.status(500).json({ error: `AI auto-handle failed: ${err.message}` });
  }
});

export default router;
