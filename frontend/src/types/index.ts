export interface MetricsResponse {
  driftRate: number;
  driftBreakdown: {
    total: number;
    drifted: number;
    healthy: number;
    dropped: number;
    outOfOrder: number;
    duplicates: number;
  };
  healStats: {
    totalEvents: number;
    healedEvents: number;
    normalEvents: number;
    totalAgentInterventions: number;
    healed: number;
    suppressed: number;
    processed: number;
    recoveryRate: number;
  };
  healSuccessRate: number;
  totalWebhooks: number;
  openAnomalies: number;
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
