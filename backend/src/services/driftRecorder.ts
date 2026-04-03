import { supabase } from '../db/supabase.js';

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * Compute a drift snapshot from the last 5 minutes of transactions
 * and persist it to drift_snapshots table for charting.
 */
export async function recordDriftSnapshot(): Promise<void> {
  const fiveMinutesAgo = new Date(Date.now() - FIVE_MINUTES).toISOString();

  const { count: totalTransactions } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', fiveMinutesAgo);

  const total = totalTransactions ?? 0;
  if (total === 0) return;

  const { data: recentTxns } = await supabase
    .from('transactions')
    .select('id')
    .gte('created_at', fiveMinutesAgo);

  if (!recentTxns || recentTxns.length === 0) return;

  const txnIds = recentTxns.map((t) => t.id);

  const { data: allEvents } = await supabase
    .from('webhook_events')
    .select('transaction_id, event_type, gateway_timestamp, source')
    .in('transaction_id', txnIds)
    .order('gateway_timestamp', { ascending: true });

  let drifted = 0;
  let dropped = 0;
  let outOfOrder = 0;
  let duplicates = 0;

  if (allEvents) {
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

      let isDrifted = false;

      // Dropped: captured without all expected predecessors — count ONCE per transaction
      const missingPredecessors =
        hasCaptured && (!hasCreated || !hasAuthorized);
      if (missingPredecessors) {
        isDrifted = true;
        dropped++;
      }

      // Out of order (only check if not already flagged as dropped)
      if (!missingPredecessors) {
        for (let i = 1; i < events.length; i++) {
          const prev = events[i - 1].event_type;
          const curr = events[i].event_type;
          if (
            (prev === 'captured' && (curr === 'created' || curr === 'authorized')) ||
            (prev === 'authorized' && curr === 'created')
          ) {
            isDrifted = true;
            outOfOrder++;
            break;
          }
        }
      }

      // Duplicates
      const typeCount: Record<string, number> = {};
      events.forEach((evt) => {
        const key = `${evt.event_type}:${evt.source}`;
        typeCount[key] = (typeCount[key] || 0) + 1;
      });
      if (Object.values(typeCount).some((c) => c > 1)) {
        duplicates++;
      }

      if (isDrifted) drifted++;
    }
  }

  const driftRate = total > 0 ? (drifted / total) * 100 : 0;
  const healthy = total - drifted;

  await supabase.from('drift_snapshots').insert({
    total_recent_txns: total,
    healthy_txns: healthy,
    drifted_txns: drifted,
    drift_rate: parseFloat(driftRate.toFixed(2)),
    dropped_events_count: dropped,
    out_of_order_count: outOfOrder,
    duplicate_count: duplicates,
    window_seconds: 300,
  });
}
