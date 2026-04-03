export type TransactionState =
  | 'created'
  | 'authorized'
  | 'captured'
  | 'settled'
  | 'refunded'
  | 'failed'
  | 'unknown'
  | 'initiated'
  | 'processing';

export type EventSource = 'webhook' | 'gateway_poll' | 'manual';

export type HealStatus = 'pending' | 'in_progress' | 'resolved' | 'failed';

export type AnomalyType =
  | 'conflict'
  | 'gateway_outage'
  | 'timeout'
  | 'duplicate'
  | 'missing_event';

export interface NormalizedEvent {
  gatewayTxnId: string;
  gateway: string;
  eventType: TransactionState;
  gatewayTimestamp: Date;
  amount: number;
  currency: string;
  idempotencyKey: string;
  rawPayload: unknown;
}

export interface HealJobData {
  transactionId: string;
  missingStates: string[];
  gateway: string;
  healJobId: string;
}

export interface Transaction {
  id: string;
  gateway: string;
  gateway_txn_id: string;
  current_state: TransactionState;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookEvent {
  id: string;
  transaction_id: string;
  idempotency_key: string;
  event_type: TransactionState;
  gateway_timestamp: Date;
  source: EventSource;
  raw_payload: unknown;
  created_at: string;
}

export interface HealJob {
  id: string;
  transaction_id: string;
  status: HealStatus;
  missing_states: string[] | null;
  attempts: number;
  last_attempted_at: string | null;
  resolution_notes: string | null;
  created_at: string;
}

export interface Anomaly {
  id: string;
  transaction_id: string;
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
}
