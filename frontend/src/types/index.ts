export interface MetricsResponse {
  drift_rate: number;
  heal_success_rate: number;
  webhooks_60min: number;
  open_anomalies: number;
  timestamp: string;
}

export interface AnomalyResponse {
  id: string;
  transaction_id?: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  status: "open" | "reviewing" | "resolved" | "rejected";
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
}

export interface TransactionResponse {
  id: string;
  gateway: string;
  event_type: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface DriftDataPoint {
  timestamp: string;
  value: number;
}

export interface WebhookVolumeData {
  gateway: string;
  count: number;
}
