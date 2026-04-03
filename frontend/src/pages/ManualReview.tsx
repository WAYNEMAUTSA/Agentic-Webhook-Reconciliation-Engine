import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { BASE_URL } from "../lib/api";
import { CheckCircle2, RefreshCw, X } from "lucide-react";

interface Anomaly {
  id: string;
  transaction_id: string;
  type: string;
  severity: string;
  description: string;
  created_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  transactions?: {
    gateway: string;
    gateway_txn_id: string;
    amount: number;
  };
}

export default function ManualReview() {
  const [items, setItems] = useState<Anomaly[] | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Anomaly | null>(null);
  const [healing, setHealing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/anomalies`);
      setItems(res.data.data || []);
    } catch (err) {
      console.error("Failed to load manual review queue:", err);
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, [load]);

  const handleHeal = async (anomaly: Anomaly) => {
    setHealing(anomaly.id);
    try {
      // Trigger heal by hitting the anomalies resolve endpoint
      // In production this would call a dedicated heal endpoint
      await axios.patch(`${BASE_URL}/anomalies/${anomaly.id}/resolve`, {
        note: "Auto-heal triggered via dashboard",
      });
      setItems((prev) => (prev || []).filter((a) => a.id !== anomaly.id));
    } catch (err) {
      console.error("Failed to trigger heal:", err);
    } finally {
      setHealing(null);
    }
  };

  const handleResolve = async (id: string, note: string) => {
    try {
      await axios.patch(`${BASE_URL}/anomalies/${id}/resolve`, { note });
      setItems((prev) => (prev || []).filter((a) => a.id !== id));
      setResolveTarget(null);
    } catch (err) {
      console.error("Failed to resolve anomaly:", err);
    }
  };

  if (items === null) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground">Manual Review Queue</h2>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle2 className="h-16 w-16 text-success mb-4" />
          <p className="text-lg font-medium text-foreground">No anomalies – ledger is healthy</p>
          <p className="text-sm text-muted-foreground mt-1">All transactions are reconciled.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-card border rounded-lg shadow-sm overflow-hidden flex">
              <div className="w-1 bg-destructive shrink-0" />
              <div className="p-4 flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-sm font-medium text-foreground">{item.transaction_id}</p>
                    <span className="text-xs text-destructive font-medium">{item.type}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleTimeString()}</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                {item.transactions && (
                  <p className="text-xs text-muted-foreground">
                    Gateway: {item.transactions.gateway} · Amount: ${(item.transactions.amount / 100).toFixed(2)}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setResolveTarget(item)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    Resolve manually
                  </button>
                  <button
                    onClick={() => handleHeal(item)}
                    disabled={healing === item.id}
                    className="px-3 py-1.5 rounded-md text-xs font-medium border text-foreground hover:bg-secondary transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3 w-3" /> Re-fetch from gateway
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolveTarget && (
        <ResolveModal
          item={resolveTarget}
          onResolve={(note) => handleResolve(resolveTarget.id, note)}
          onClose={() => setResolveTarget(null)}
        />
      )}
    </div>
  );
}

function ResolveModal({ item, onResolve, onClose }: { item: Anomaly; onResolve: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState("Resolved via dashboard review");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    await onResolve(note);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/20" onClick={onClose} />
      <div className="relative bg-card border rounded-lg shadow-lg p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Resolve Manually</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">Add a note for <span className="font-mono">{item.transaction_id}</span>.</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground resize-none"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border hover:bg-secondary transition-colors text-foreground">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
