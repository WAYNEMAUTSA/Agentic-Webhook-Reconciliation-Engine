import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, AlertTriangle } from "lucide-react";
import type { MetricsResponse, AnomalyResponse } from "@/types";

export function Overview() {
  const { data: metrics, isLoading: metricsLoading } = useQuery<MetricsResponse>({
    queryKey: ["metrics"],
  });

  const { data: anomalies, isLoading: anomaliesLoading } = useQuery<AnomalyResponse[]>({
    queryKey: ["anomalies"],
  });

  if (metricsLoading || anomaliesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-24 animate-pulse rounded-md bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">System Overview</h2>
        <p className="text-muted-foreground">
          Summary of webhook events and payment gateway reconciliation
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Drift Rate</CardTitle>
            <CardDescription>Current system drift</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">
                {metrics?.driftRate != null ? `${metrics.driftRate}%` : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Heal Success Rate</CardTitle>
            <CardDescription>Auto-recovery rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-success" />
              <span className="text-2xl font-bold">
                {metrics?.healSuccessRate != null
                  ? `${metrics.healSuccessRate}%`
                  : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Webhooks (60min)</CardTitle>
            <CardDescription>Events processed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {metrics?.totalWebhooks?.toLocaleString() ?? "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open Anomalies</CardTitle>
            <CardDescription>Requires attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <span className="text-2xl font-bold">
                {metrics?.openAnomalies ?? "—"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Anomalies */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Anomalies</CardTitle>
          <CardDescription>Last 10 anomalies detected</CardDescription>
        </CardHeader>
        <CardContent>
          {(anomalies ?? []).length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-muted-foreground">
              No anomalies detected
            </div>
          ) : (
            <div className="space-y-3">
              {(anomalies ?? []).slice(0, 10).map((anomaly) => (
                <div
                  key={anomaly.id}
                  className="flex items-start justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          anomaly.severity === "critical"
                            ? "destructive"
                            : anomaly.severity === "high"
                            ? "destructive"
                            : anomaly.severity === "medium"
                            ? "warning"
                            : "default"
                        }
                      >
                        {anomaly.severity}
                      </Badge>
                      <span className="text-sm font-medium">{anomaly.type}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {anomaly.description}
                    </p>
                  </div>
                  <Badge
                    variant={
                      anomaly.status === "open"
                        ? "warning"
                        : anomaly.status === "resolved"
                        ? "success"
                        : "secondary"
                    }
                  >
                    {anomaly.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
