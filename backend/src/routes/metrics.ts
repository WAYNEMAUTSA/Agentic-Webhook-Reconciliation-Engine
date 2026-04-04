import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase.js';

const router = Router();

// ─── Demo metrics — returned when DB is empty ───
function getDemoMetrics() {
  const now = Date.now();
  const healerHistory = [
    { txn: 'pay_INJ_481X2K', outcome: 'healed', bridge: 2, confidence: 0.95, missing: ['created', 'authorized'] },
    { txn: 'pay_INJ_480W9R', outcome: 'suppressed', bridge: 0, confidence: 1.0, missing: [] },
    { txn: 'pay_INJ_479V4M', outcome: 'healed', bridge: 1, confidence: 0.92, missing: ['authorized'] },
    { txn: 'pay_INJ_478U1H', outcome: 'processed', bridge: 0, confidence: 1.0, missing: [] },
    { txn: 'pay_INJ_477T7C', outcome: 'healed', bridge: 2, confidence: 0.94, missing: ['created', 'authorized'] },
    { txn: 'pay_INJ_476S3X', outcome: 'healed', bridge: 1, confidence: 0.91, missing: ['authorized'] },
    { txn: 'pay_INJ_475R8N', outcome: 'suppressed', bridge: 0, confidence: 1.0, missing: [] },
    { txn: 'pay_INJ_474Q5J', outcome: 'healed', bridge: 2, confidence: 0.93, missing: ['created', 'authorized'] },
  ];

  const driftData: { ts: Date; drift: number; dropped: number; ooo: number; dup: number; total: number; drifted: number }[] = [];
  for (let i = 60; i >= 0; i -= 1) {
    const t = new Date(now - i * 10000);
    const base = 2 + Math.sin(i * 0.3) * 3;
    driftData.push({
      ts: t,
      drift: Math.max(0, parseFloat(base.toFixed(1))),
      dropped: Math.floor(Math.random() * 3),
      ooo: Math.floor(Math.random() * 2),
      dup: Math.floor(Math.random() * 2),
      total: 15 + Math.floor(Math.random() * 10),
      drifted: Math.floor(Math.random() * 4),
    });
  }

  return {
    metrics: {
      driftRate: 5.2,
      driftBreakdown: { total: 23, drifted: 1, healthy: 22, dropped: 1, outOfOrder: 0, duplicates: 0 },
      healStats: {
        totalEvents: 147,
        healedEvents: 38,
        normalEvents: 109,
        totalAgentInterventions: 22,
        healed: 14,
        suppressed: 8,
        processed: 125,
        recoveryRate: 84.6,
      },
      healSuccessRate: 92.3,
      totalWebhooks: 186,
      openAnomalies: 3,
    },
    driftHistory: driftData.map(d => ({
      timestamp: d.ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      driftRate: d.drift,
      dropped: d.dropped,
      outOfOrder: d.ooo,
      duplicates: d.dup,
      total: d.total,
      drifted: d.drifted,
    })),
    healerHistory: healerHistory.map((h, i) => ({
      id: `demo-${i}`,
      gateway_txn_id: h.txn.substring(0, 20) + '...',
      outcome: h.outcome,
      bridge_events: h.bridge,
      confidence: h.confidence,
      actions: h.missing.length > 0 ? [`Detected missing [${h.missing.join(', ')}] — deferred to heal worker`] : [h.outcome === 'suppressed' ? 'Suppressed stale event' : 'Normal processing'],
      reasoning: h.missing.length > 0
        ? `Gap detected. Missing states: [${h.missing.join(', ')}]. Async heal worker will poll gateway.`
        : h.outcome === 'suppressed'
        ? 'Out-of-order delivery — event already progressed past this state.'
        : 'No chaos patterns detected. Clean event.',
      created_at: new Date(now - i * 8000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    })),
  };
}

// GET /metrics — dashboard metrics with real-world drift calculation
router.get('/', async (_req: Request, res: Response) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // ── Total transactions in recent window ──
    const { count: totalTransactions } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', fiveMinutesAgo);

    // ── Drift: transactions with state gaps ──
    const { data: recentTxns, error: txnsErr } = await supabase
      .from('transactions')
      .select('id')
      .gte('created_at', fiveMinutesAgo);

    if (txnsErr) throw new Error(txnsErr.message);

    let driftedCount = 0;
    let droppedCount = 0;
    let outOfOrderCount = 0;
    let duplicateCount = 0;

    if (recentTxns && recentTxns.length > 0) {
      const txnIds = recentTxns.map((t) => t.id);

      const { data: allEvents, error: eventsErr } = await supabase
        .from('webhook_events')
        .select('transaction_id, event_type, gateway_timestamp, source')
        .in('transaction_id', txnIds)
        .order('gateway_timestamp', { ascending: true });

      if (!eventsErr && allEvents) {
        const eventsByTxn: Record<string, typeof allEvents> = {};
        allEvents.forEach((evt) => {
          if (!eventsByTxn[evt.transaction_id]) eventsByTxn[evt.transaction_id] = [];
          eventsByTxn[evt.transaction_id].push(evt);
        });

        for (const txnId of txnIds) {
          const events = eventsByTxn[txnId] || [];
          const eventTypes = events.map((e) => e.event_type);
          const hasCreated = eventTypes.includes('created');
          const hasAuthorized = eventTypes.includes('authorized');
          const hasCaptured = eventTypes.includes('captured');

          // Dropped: captured without all predecessors — count ONCE per transaction
          const missingPredecessors =
            hasCaptured && (!hasCreated || !hasAuthorized);
          if (missingPredecessors) {
            driftedCount++;
            droppedCount++;
            continue;
          }

          // Check for out-of-order events
          let flaggedOoo = false;
          for (let i = 1; i < events.length; i++) {
            const prev = events[i - 1].event_type;
            const curr = events[i].event_type;
            if (
              (prev === 'captured' && (curr === 'created' || curr === 'authorized')) ||
              (prev === 'authorized' && curr === 'created')
            ) {
              outOfOrderCount++;
              if (!flaggedOoo) {
                driftedCount++;
                flaggedOoo = true;
              }
              break;
            }
          }

          // Duplicates
          const typeCount: Record<string, number> = {};
          events.forEach((evt) => {
            const key = `${evt.event_type}:${evt.source}`;
            typeCount[key] = (typeCount[key] || 0) + 1;
          });
          const hasDuplicates = Object.values(typeCount).some((c) => c > 1);
          if (hasDuplicates) {
            duplicateCount++;
          }
        }
      }
    }

    const total = totalTransactions ?? 0;
    const driftRate = total > 0 ? (driftedCount / total) * 100 : 0;

    // ── Heal job stats ──
    const { count: resolvedHealJobs } = await supabase
      .from('heal_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'resolved');

    const { count: failedHealJobs } = await supabase
      .from('heal_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');

    const healSuccessDenominator = (resolvedHealJobs ?? 0) + (failedHealJobs ?? 0);
    const healSuccessRate =
      healSuccessDenominator > 0
        ? ((resolvedHealJobs ?? 0) / healSuccessDenominator) * 100
        : 100;

    // ── Webhooks in last 60 minutes ──
    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: totalWebhooks } = await supabase
      .from('webhook_events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sixtyMinutesAgo);

    // ── Unresolved anomalies ──
    const { count: openAnomalies } = await supabase
      .from('anomalies')
      .select('*', { count: 'exact', head: true })
      .is('resolved_at', null);

    // ── Healer stats: count from healer_audit_log for accurate numbers ──
    // Using healer_audit_log is more reliable than filtering raw_payload JSONB
    // because bridge/synthetic events store a different payload structure.
    const { count: healedEvents } = await supabase
      .from('healer_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('outcome', 'healed');

    const { count: totalEvents } = await supabase
      .from('webhook_events')
      .select('*', { count: 'exact', head: true });

    // ── Healer audit log summary ──
    const { count: totalHealed } = await supabase
      .from('healer_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('outcome', 'healed');

    const { count: totalSuppressed } = await supabase
      .from('healer_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('outcome', 'suppressed');

    const { count: totalProcessed } = await supabase
      .from('healer_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('outcome', 'processed');

    const totalInterventions = (totalHealed ?? 0) + (totalSuppressed ?? 0);
    const totalAgentActions = (totalProcessed ?? 0) + totalInterventions;
    const recoveryRate = totalAgentActions > 0
      ? (totalInterventions / totalAgentActions) * 100
      : 0;

    // ── If DB is empty, return realistic demo data ──
    if ((totalWebhooks ?? 0) === 0 && (totalHealed ?? 0) === 0 && (openAnomalies ?? 0) === 0) {
      const demo = getDemoMetrics();
      return res.json(demo.metrics);
    }

    return res.json({
      driftRate: parseFloat(driftRate.toFixed(1)),
      driftBreakdown: {
        total,
        drifted: driftedCount,
        healthy: total - driftedCount,
        dropped: droppedCount,
        outOfOrder: outOfOrderCount,
        duplicates: duplicateCount,
      },
      healStats: {
        totalEvents: totalEvents ?? 0,
        healedEvents: healedEvents ?? 0,
        normalEvents: (totalEvents ?? 0) - (healedEvents ?? 0),
        totalAgentInterventions: totalInterventions,
        healed: totalHealed ?? 0,
        suppressed: totalSuppressed ?? 0,
        processed: totalProcessed ?? 0,
        recoveryRate: parseFloat(recoveryRate.toFixed(1)),
      },
      healSuccessRate: parseFloat(healSuccessRate.toFixed(1)),
      totalWebhooks: totalWebhooks ?? 0,
      openAnomalies: openAnomalies ?? 0,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /metrics/drift-history — last 60 drift snapshots for charting
router.get('/drift-history', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('drift_snapshots')
      .select('recorded_at, drift_rate, dropped_events_count, out_of_order_count, duplicate_count, total_recent_txns, drifted_txns')
      .order('recorded_at', { ascending: true })
      .limit(120);

    if (error) throw new Error(error.message);

    const formatted = (data || []).map((s) => ({
      timestamp: new Date(s.recorded_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      driftRate: parseFloat(s.drift_rate),
      dropped: s.dropped_events_count,
      outOfOrder: s.out_of_order_count,
      duplicates: s.duplicate_count,
      total: s.total_recent_txns,
      drifted: s.drifted_txns,
    }));

    if (formatted.length === 0) {
      const demo = getDemoMetrics();
      return res.json({ data: demo.driftHistory });
    }

    return res.json({ data: formatted });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /metrics/healer-history — last 50 healer agent interventions
router.get('/healer-history', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('healer_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);

    const formatted = (data || []).map((s) => ({
      id: s.id,
      gateway_txn_id: s.gateway_txn_id?.substring(0, 20) + '...',
      outcome: s.outcome,
      bridge_events: s.bridge_events_synthesized,
      confidence: s.confidence_score,
      actions: s.actions_taken,
      reasoning: s.reasoning_trail,
      created_at: new Date(s.created_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    }));

    if (formatted.length === 0) {
      const demo = getDemoMetrics();
      return res.json({ data: demo.healerHistory });
    }

    return res.json({ data: formatted });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
