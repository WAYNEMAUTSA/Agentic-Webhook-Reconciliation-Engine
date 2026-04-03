import { useQuery } from "@tanstack/react-query";
import { AnomalyQueue } from "@/components/AnomalyQueue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import type { AnomalyResponse } from "@/types";

export function ManualReview() {
  const { data: anomalies, isLoading, refetch } = useQuery<AnomalyResponse[]>({
    queryKey: ["anomalies"],
  });

  const openAnomalies = (anomalies ?? []).filter((a) => a.status === "open");
  const resolvedAnomalies = (anomalies ?? []).filter(
    (a) => a.status === "resolved" || a.status === "rejected"
  );

  const handleResolve = (_id: string) => {
    refetch();
  };

  const handleReject = (_id: string) => {
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Manual Review Queue</h2>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-warning" />
              <div>
                <p className="text-sm text-muted-foreground">Open</p>
                <p className="text-2xl font-bold">{openAnomalies.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <div>
                <p className="text-sm text-muted-foreground">Resolved</p>
                <p className="text-2xl font-bold">
                  {resolvedAnomalies.filter((a) => a.status === "resolved").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-destructive" />
              <div>
                <p className="text-sm text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold">
                  {resolvedAnomalies.filter((a) => a.status === "rejected").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Anomaly Queue */}
      <AnomalyQueue
        anomalies={openAnomalies}
        isLoading={isLoading}
        onResolve={handleResolve}
        onReject={handleReject}
      />

      {/* Recent Activity */}
      {resolvedAnomalies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {resolvedAnomalies.slice(0, 5).map((anomaly) => (
                <div
                  key={anomaly.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {anomaly.status === "resolved" ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{anomaly.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {anomaly.description.slice(0, 50)}...
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {anomaly.resolved_at
                      ? new Date(anomaly.resolved_at).toLocaleString()
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
