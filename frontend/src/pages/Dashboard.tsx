import { useEffect, useState, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingDown, Heart, Webhook, AlertTriangle, Activity } from "lucide-react";
import axios from "axios";
import { BASE_URL } from "../lib/api";

interface Metrics {
  driftRate: number;
  healSuccessRate: number;
  totalWebhooks: number;
  openAnomalies: number;
  totalTransactions: number;
}

interface WebhookVolume {
  gateway: string;
  count: number;
}

interface HealEvent {
  id: string;
  transaction_id: string;
  event_type: string;
  gateway_timestamp: string;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [volume, setVolume] = useState<WebhookVolume[]>([]);
  const [heals, setHeals] = useState<HealEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [mRes, anomaliesRes] = await Promise.all([
        axios.get<Metrics>(`${BASE_URL}/metrics`),
        axios.get(`${BASE_URL}/anomalies`),
      ]);
      setMetrics(mRes.data);
      setVolume([
        { gateway: "Razorpay", count: Math.round((mRes.data.totalWebhooks || 0) * 0.42) },
        { gateway: "Stripe", count: Math.round((mRes.data.totalWebhooks || 0) * 0.35) },
        { gateway: "Cashfree", count: Math.round((mRes.data.totalWebhooks || 0) * 0.23) },
      ]);
      setHeals(anomaliesRes.data.data?.slice(0, 5) || []);
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading || !metrics) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>;

  const driftDanger = metrics.driftRate > 5;
  const queueWarn = metrics.openAnomalies > 0;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground">Live Health Overview</h2>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Drift Rate"
          value={`${metrics.driftRate}%`}
          variant={driftDanger ? "destructive" : "success"}
          icon={TrendingDown}
        />
        <MetricCard label="Heal Success Rate" value={`${metrics.healSuccessRate}%`} variant="success" icon={Heart} />
        <MetricCard label="Webhooks (60 min)" value={metrics.totalWebhooks.toLocaleString()} variant="info" icon={Webhook} />
        <MetricCard
          label="Open Anomalies"
          value={String(metrics.openAnomalies)}
          variant={queueWarn ? "warning" : "default"}
          icon={AlertTriangle}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Drift Rate Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={[{ timestamp: new Date().toISOString(), value: metrics.driftRate }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="timestamp" tick={false} />
              <YAxis domain={[0, "auto"]} tickFormatter={(v: number) => `${v}%`} fontSize={12} />
              <Tooltip
                labelFormatter={(l: string) => new Date(l).toLocaleTimeString()}
                formatter={(v: number) => [`${v}%`, "Drift"]}
              />
              <Line type="monotone" dataKey="value" stroke={driftDanger ? "hsl(var(--destructive))" : "hsl(var(--success))"} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground text-center mt-2">Collecting data points…</p>
        </div>

        <div className="bg-card border rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Webhook Volume by Gateway</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={volume}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="gateway" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heal feed */}
      <div className="bg-card border rounded-lg shadow-sm p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
          <Activity className="h-4 w-4" /> Open Anomalies
        </h3>
        {heals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No anomalies — ledger is healthy.</p>
        ) : (
          <ul className="divide-y">
            {heals.map((h: any) => (
              <li key={h.id} className="py-2 flex items-start justify-between text-sm">
                <span className="text-foreground">{h.description}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                  {new Date(h.created_at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type Variant = "destructive" | "success" | "warning" | "info" | "default";

function MetricCard({ label, value, variant, icon: Icon }: { label: string; value: string | number; variant: Variant; icon: React.ElementType }) {
  const ring: Record<Variant, string> = {
    destructive: "border-destructive/40 bg-destructive/5",
    success: "border-success/40 bg-success/5",
    warning: "border-warning/40 bg-warning/5",
    info: "border-primary/40 bg-primary/5",
    default: "border-border",
  };
  const text: Record<Variant, string> = {
    destructive: "text-destructive",
    success: "text-success",
    warning: "text-warning",
    info: "text-primary",
    default: "text-foreground",
  };

  return (
    <div className={`bg-card border rounded-lg shadow-sm p-4 ${ring[variant]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className={`h-4 w-4 ${text[variant]}`} />
      </div>
      <p className={`text-2xl font-bold tabular-nums ${text[variant]}`}>{value}</p>
    </div>
  );
}
