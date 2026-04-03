-- Migration: Add resolution_notes column to anomalies table
-- Date: 2026-04-03

ALTER TABLE anomalies
ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
