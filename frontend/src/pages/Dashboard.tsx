import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MetricCards } from "@/components/MetricCards";
import { DriftChart } from "@/components/DriftChart";
import { TransactionList } from "@/components/TransactionList";
import { AnomalyQueue } from "@/components/AnomalyQueue";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Activity, Webhook, AlertTriangle } from "lucide-react";
import type {
  MetricsResponse,
  AnomalyResponse,
  TransactionResponse,
  DriftDataPoint,
  WebhookVolumeData,
} from "@/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function Dashboard() {
  const { toast } = useToast();
  const [driftData, setDriftData] = useState<DriftDataPoint[]>([]);
  const [webhookVolume, setWebhookVolume] = useState<WebhookVolumeData[]>([]);

  const { data: metrics } = useQuery<MetricsResponse>({
    queryKey: ["metrics"],
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const { data: anomalies, isLoading: anomaliesLoading } = useQuery<AnomalyResponse[]>({
    queryKey: ["anomalies"],
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<
    TransactionResponse[]
  >({
    queryKey: ["transactions"],
  });

  // Real-time updates
  useRealtime({
    onTransactionUpdate: (transaction) => {
      console.log("Transaction updated:", transaction);
    },
    onAnomalyInsert: (anomaly) => {
      toast({
        title: "New Anomaly Detected",
        description: anomaly.description,
        variant: "destructive",
      });
    },
  });

  // Generate placeholder chart data
  useEffect(() => {
    if (metrics) {
      const now = new Date();
      const newDriftData: DriftDataPoint[] = Array.from({ length: 12 }).map((_, i) => ({
        timestamp: new Date(now.getTime() - (11 - i) * 5 * 60 * 1000).toISOString(),
        value: metrics.drift_rate * (0.5 + Math.random()),
      }));
      setDriftData(newDriftData);

      const gateways = ["stripe", "paypal", "square", "adyen"];
      const newWebhookVolume: WebhookVolumeData[] = gateways.map((gateway) => ({
        gateway,
        count: Math.round(metrics.webhooks_60min / gateways.length * (0.5 + Math.random())),
      }));
      setWebhookVolume(newWebhookVolume);
    }
  }, [metrics]);

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <MetricCards
        metrics={[
          {
            title: "Drift Rate",
            value: metrics?.drift_rate ?? "—",
            threshold: { warning: 0.05, critical: 0.1 },
            icon: <Activity className="h-5 w-5" />,
          },
          {
            title: "Heal Success Rate",
            value: metrics?.heal_success_rate != null ? `${metrics.heal_success_rate}%` : "—",
            threshold: { warning: 90, critical: 80, inverted: true },
            icon: <BarChart3 className="h-5 w-5" />,
          },
          {
            title: "Webhooks (60min)",
            value: metrics?.webhooks_60min ?? "—",
            icon: <Webhook className="h-5 w-5" />,
          },
          {
            title: "Open Anomalies",
            value: metrics?.open_anomalies ?? "—",
            threshold: { warning: 5, critical: 10 },
            icon: <AlertTriangle className="h-5 w-5" />,
          },
        ]}
      />

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <DriftChart data={driftData} />
        <Card>
          <CardHeader>
            <CardTitle>Webhook Volume by Gateway</CardTitle>
          </CardHeader>
          <CardContent>
            {webhookVolume.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                No webhook data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={webhookVolume}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="gateway" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-4 md:grid-cols-2">
        <TransactionList
          transactions={transactions ?? []}
          isLoading={transactionsLoading}
        />
        <AnomalyQueue
          anomalies={(anomalies ?? []).filter((a) => a.status === "open")}
          isLoading={anomaliesLoading}
        />
      </div>
    </div>
  );
}
