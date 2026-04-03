import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Transaction, Anomaly } from "@/lib/supabase";

interface UseRealtimeOptions {
  onTransactionUpdate?: (transaction: Transaction) => void;
  onAnomalyInsert?: (anomaly: Anomaly) => void;
  enabled?: boolean;
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const { onTransactionUpdate, onAnomalyInsert, enabled = true } = options;
  const [isConnected, setIsConnected] = useState(false);

  const handleTransactionChange = useCallback(
    (payload: any) => {
      onTransactionUpdate?.(payload.new as Transaction);
    },
    [onTransactionUpdate]
  );

  const handleAnomalyInsert = useCallback(
    (payload: any) => {
      onAnomalyInsert?.(payload.new as Anomaly);
    },
    [onAnomalyInsert]
  );

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel("realtime-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        handleTransactionChange
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "anomalies" },
        handleAnomalyInsert
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
      setIsConnected(false);
    };
  }, [enabled, handleTransactionChange, handleAnomalyInsert]);

  return { isConnected };
}
