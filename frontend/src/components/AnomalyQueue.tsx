import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import type { AnomalyResponse } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { Loader2, AlertTriangle } from "lucide-react";

interface AnomalyQueueProps {
  anomalies: AnomalyResponse[];
  isLoading?: boolean;
  onResolve?: (id: string) => void;
  onReject?: (id: string) => void;
}

export function AnomalyQueue({
  anomalies,
  isLoading,
  onResolve,
  onReject,
}: AnomalyQueueProps) {
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyResponse | null>(null);

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, "default" | "warning" | "destructive"> = {
      low: "default",
      medium: "warning",
      high: "destructive",
      critical: "destructive",
    };
    return variants[severity] || "default";
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "success" | "warning" | "secondary"> = {
      open: "warning",
      reviewing: "default",
      resolved: "success",
      rejected: "secondary",
    };
    return variants[status] || "default";
  };

  const handleResolve = async (id: string) => {
    setActionLoading(id);
    try {
      await api.post(`/anomalies/${id}/resolve`);
      toast({
        title: "Anomaly resolved",
        description: "The anomaly has been marked as resolved.",
        variant: "success",
      });
      onResolve?.(id);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to resolve anomaly. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setSelectedAnomaly(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      await api.post(`/anomalies/${id}/reject`);
      toast({
        title: "Anomaly rejected",
        description: "The anomaly has been rejected.",
        variant: "destructive",
      });
      onReject?.(id);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reject anomaly. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setSelectedAnomaly(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Anomaly Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (anomalies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Anomaly Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            No anomalies requiring review
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Anomaly Queue ({anomalies.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anomalies.slice(0, 10).map((anomaly) => (
                <TableRow key={anomaly.id}>
                  <TableCell className="capitalize">{anomaly.type}</TableCell>
                  <TableCell>
                    <Badge variant={getSeverityBadge(anomaly.severity)}>
                      {anomaly.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    <button
                      className="text-left hover:underline"
                      onClick={() => setSelectedAnomaly(anomaly)}
                    >
                      {anomaly.description}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadge(anomaly.status)}>
                      {anomaly.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(anomaly.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="success"
                        disabled={actionLoading === anomaly.id || anomaly.status !== "open"}
                        onClick={() => handleResolve(anomaly.id)}
                      >
                        {actionLoading === anomaly.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Resolve"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actionLoading === anomaly.id || anomaly.status !== "open"}
                        onClick={() => handleReject(anomaly.id)}
                      >
                        {actionLoading === anomaly.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Reject"
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedAnomaly} onOpenChange={() => setSelectedAnomaly(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anomaly Details</DialogTitle>
            <DialogDescription>
              Review the anomaly details before taking action.
            </DialogDescription>
          </DialogHeader>
          {selectedAnomaly && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="capitalize">{selectedAnomaly.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Severity</span>
                  <Badge variant={getSeverityBadge(selectedAnomaly.severity)}>
                    {selectedAnomaly.severity}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={getStatusBadge(selectedAnomaly.status)}>
                    {selectedAnomaly.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Description</span>
                  <p className="mt-1">{selectedAnomaly.description}</p>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>
                    {formatDistanceToNow(new Date(selectedAnomaly.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelectedAnomaly(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={actionLoading === selectedAnomaly.id}
                  onClick={() => handleReject(selectedAnomaly.id)}
                >
                  Reject
                </Button>
                <Button
                  variant="success"
                  disabled={actionLoading === selectedAnomaly.id}
                  onClick={() => handleResolve(selectedAnomaly.id)}
                >
                  Resolve
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
