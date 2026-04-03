import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface UseRealtimeOptions {
  onTransactionChange?: (payload: unknown) => void;
  onNewAnomaly?: (payload: unknown) => void;
}

export function useRealtime({ onTransactionChange, onNewAnomaly }: UseRealtimeOptions) {
  useEffect(() => {
    const channels: ReturnType<typeof supabase.channel>[] = [];

    if (onTransactionChange) {
      const txChannel = supabase
        .channel('transactions-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'transactions',
          },
          (payload) => {
            onTransactionChange(payload);
          }
        )
        .subscribe();
      channels.push(txChannel);
    }

    if (onNewAnomaly) {
      const anomalyChannel = supabase
        .channel('anomalies-inserts')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'anomalies',
          },
          (payload) => {
            onNewAnomaly(payload);
          }
        )
        .subscribe();
      channels.push(anomalyChannel);
    }

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [onTransactionChange, onNewAnomaly]);
}
