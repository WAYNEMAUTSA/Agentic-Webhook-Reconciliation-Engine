-- Migration: Add healer_audit_log table for AI agent traceability
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS healer_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id),
  gateway_txn_id TEXT,
  gateway TEXT NOT NULL DEFAULT 'razorpay',

  -- Agent decision metadata
  agent_log TEXT NOT NULL,
  confidence_score NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  actions_taken JSONB NOT NULL DEFAULT '[]',
  schema_violations_remaining JSONB NOT NULL DEFAULT '[]',
  original_payload JSONB,
  healed_payload JSONB,

  -- Outcome
  outcome TEXT NOT NULL DEFAULT 'processed', -- processed, rejected, flagged
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_healer_audit_gateway_txn_id
  ON healer_audit_log(gateway_txn_id);

CREATE INDEX idx_healer_audit_created_at
  ON healer_audit_log(created_at DESC);
