-- Migration: Fix healer_audit_log schema to match code expectations
-- This migration replaces the old table structure with the one the code actually uses
-- Run this in Supabase SQL Editor

-- Drop the old table and recreate with correct schema
DROP TABLE IF EXISTS healer_audit_log CASCADE;

CREATE TABLE healer_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_txn_id TEXT NOT NULL,
  gateway TEXT NOT NULL DEFAULT 'razorpay',
  original_event_type TEXT,
  healed_event_type TEXT NOT NULL,
  outcome TEXT NOT NULL, -- 'healed', 'suppressed', 'processed'
  actions_taken JSONB NOT NULL DEFAULT '[]',
  bridge_events_synthesized INT NOT NULL DEFAULT 0,
  confidence_score NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  reasoning_trail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_healer_audit_gateway_txn
  ON healer_audit_log(gateway_txn_id);

CREATE INDEX IF NOT EXISTS idx_healer_audit_created_at
  ON healer_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_healer_audit_outcome
  ON healer_audit_log(outcome);

-- Add comment for clarity
COMMENT ON TABLE healer_audit_log IS 'AI agent audit trail for healing, suppression, and processing decisions';
COMMENT ON COLUMN healer_audit_log.outcome IS 'healed=auto-fixed, suppressed=ignored duplicate/stale, processed=normal flow';
