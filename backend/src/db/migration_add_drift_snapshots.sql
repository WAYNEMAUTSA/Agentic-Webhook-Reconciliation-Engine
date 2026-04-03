-- Migration: Add drift_snapshots table for tracking real-time ledger health
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS drift_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Snapshot metrics
  total_recent_txns INT NOT NULL DEFAULT 0,
  healthy_txns INT NOT NULL DEFAULT 0,
  drifted_txns INT NOT NULL DEFAULT 0,
  
  -- Drift rate = (drifted / total) * 100
  drift_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  
  -- Breakdown by chaos scenario
  dropped_events_count INT NOT NULL DEFAULT 0,
  out_of_order_count INT NOT NULL DEFAULT 0,
  duplicate_count INT NOT NULL DEFAULT 0,
  
  -- Metadata
  window_seconds INT NOT NULL DEFAULT 300
);

CREATE INDEX idx_drift_snapshots_recorded_at
  ON drift_snapshots(recorded_at DESC);

-- Helper function: compute and insert a drift snapshot
CREATE OR REPLACE FUNCTION record_drift_snapshot(window_sec INT DEFAULT 300)
RETURNS VOID AS $$
DECLARE
  recent_cutoff TIMESTAMPTZ := NOW() - (window_sec || ' seconds')::INTERVAL;
  
  -- Count of transactions created in the window
  v_total INT;
  
  -- Transactions that have state gaps (missing expected predecessor states)
  v_drifted INT;
  
  -- Healthy transactions (no gaps detected)
  v_healthy INT;
  
  -- Counts of specific chaos patterns
  v_dropped INT;
  v_ooo INT;
  v_dupes INT;
BEGIN
  -- Total transactions in window
  SELECT COUNT(*) INTO v_total
  FROM transactions
  WHERE created_at >= recent_cutoff;
  
  -- Dropped: transactions where 'captured' exists but 'created' or 'authorized' is missing
  SELECT COUNT(DISTINCT t.id) INTO v_dropped
  FROM transactions t
  LEFT JOIN webhook_events we_created
    ON we_created.transaction_id = t.id AND we_created.event_type = 'created'
  LEFT JOIN webhook_events we_authorized
    ON we_authorized.transaction_id = t.id AND we_created.event_type = 'authorized'
  WHERE t.created_at >= recent_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM webhook_events we
      WHERE we.transaction_id = t.id AND we.event_type = 'created'
    );
  
  -- Out of order: transactions where gateway_timestamp order != lifecycle order
  SELECT COUNT(DISTINCT t.id) INTO v_ooo
  FROM transactions t
  WHERE t.created_at >= recent_cutoff
    AND EXISTS (
      SELECT 1 FROM (
        SELECT event_type,
               LAG(event_type) OVER (ORDER BY gateway_timestamp) AS prev_event
        FROM webhook_events
        WHERE transaction_id = t.id
      ) seq
      WHERE (seq.prev_event = 'captured' AND seq.event_type IN ('created', 'authorized'))
         OR (seq.prev_event = 'authorized' AND seq.event_type = 'created')
    );
  
  -- Duplicates: transactions with more than one event of the same type from same source
  SELECT COUNT(DISTINCT t.id) INTO v_dupes
  FROM transactions t
  WHERE t.created_at >= recent_cutoff
    AND EXISTS (
      SELECT 1 FROM webhook_events we
      WHERE we.transaction_id = t.id
      GROUP BY we.event_type, we.source
      HAVING COUNT(*) > 1
    );
  
  -- Drifted = transactions with ANY gap or anomaly
  v_drifted := GREATEST(v_dropped, 0);
  v_healthy := v_total - v_drifted;
  
  -- Insert snapshot
  INSERT INTO drift_snapshots (
    total_recent_txns, healthy_txns, drifted_txns,
    drift_rate, dropped_events_count, out_of_order_count, duplicate_count,
    window_seconds
  ) VALUES (
    v_total, v_healthy, v_drifted,
    CASE WHEN v_total > 0 THEN ROUND((v_drifted::NUMERIC / v_total) * 100, 2) ELSE 0 END,
    v_dropped, v_ooo, v_dupes,
    window_sec
  );
END;
$$ LANGUAGE plpgsql;
