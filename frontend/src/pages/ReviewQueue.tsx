import { useQuery } from "@tanstack/react-query";
import { AnomalyQueue } from "@/components/AnomalyQueue";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { AnomalyResponse } from "@/types";

export function ReviewQueue() {
  const {
    data: anomalies,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<AnomalyResponse[]>({
    queryKey: ["anomalies"],
  });

  const handleResolve = (_id: string) => {
    refetch();
  };

  const handleReject = (_id: string) => {
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Review Queue</h2>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <AnomalyQueue
        anomalies={anomalies ?? []}
        isLoading={isLoading}
        onResolve={handleResolve}
        onReject={handleReject}
      />
    </div>
  );
}
