import { useState, useEffect } from 'react';
import axios from 'axios';
import { BASE_URL } from '../lib/api';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface Anomaly {
  id: string;
  transaction_id: string;
  type: string;
  severity: string;
  description: string;
  resolved_at: string | null;
  created_at: string;
}

export default function ManualReview() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [resolving, setResolving] = useState(false);

  const fetchAnomalies = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/anomalies`);
      setAnomalies(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch anomalies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnomalies();
    const interval = setInterval(fetchAnomalies, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleResolve = async (anomaly: Anomaly) => {
    setSelectedAnomaly(anomaly);
    setResolveModalOpen(true);
  };

  const submitResolve = async () => {
    if (!selectedAnomaly) return;

    setResolving(true);
    try {
      await axios.patch(`${BASE_URL}/anomalies/${selectedAnomaly.id}/resolve`, {
        note: resolveNote || 'Manually resolved',
      });

      // Refresh anomalies
      await fetchAnomalies();
      setResolveModalOpen(false);
      setResolveNote('');
      setSelectedAnomaly(null);
    } catch (err) {
      console.error('Failed to resolve anomaly:', err);
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading anomalies...</div>;
  }

  const unresolvedAnomalies = anomalies.filter((a) => !a.resolved_at);

  if (unresolvedAnomalies.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="flex justify-center mb-4">
          <CheckCircle className="h-16 w-16 text-green-600" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Anomalies</h2>
        <p className="text-gray-500">Your ledger is healthy. All transactions are reconciled.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Manual Review Queue</h2>
        <p className="text-sm text-gray-600">{unresolvedAnomalies.length} unresolved anomalies</p>
      </div>

      {/* Anomaly Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {unresolvedAnomalies.map((anomaly) => (
          <div key={anomaly.id} className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden hover:shadow-md transition">
            {/* Red left border */}
            <div className="h-1 bg-red-500"></div>

            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span className="text-xs font-semibold text-red-600 uppercase">{anomaly.severity}</span>
                  </div>
                  <p className="text-xs font-mono text-gray-600 truncate">{anomaly.transaction_id.substring(0, 12)}...</p>
                </div>
                <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  {anomaly.type}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-700 mb-4 leading-relaxed">{anomaly.description}</p>

              {/* Metadata */}
              <div className="text-xs text-gray-500 mb-4 space-y-1">
                <p>Created: {new Date(anomaly.created_at).toLocaleString()}</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleResolve(anomaly)}
                  className="flex-1 px-3 py-2 rounded border border-blue-300 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition"
                >
                  Resolve Manually
                </button>
                <button className="flex-1 px-3 py-2 rounded border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition">
                  Re-fetch
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Resolve Modal */}
      {resolveModalOpen && selectedAnomaly && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Resolve Anomaly</h3>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Transaction ID:</p>
              <p className="text-xs font-mono text-gray-900 mb-4">{selectedAnomaly.transaction_id}</p>

              <p className="text-sm text-gray-600 mb-2">Issue:</p>
              <p className="text-sm text-gray-900 mb-4">{selectedAnomaly.description}</p>

              <label className="block text-sm font-medium text-gray-700 mb-2">Resolution Note</label>
              <textarea
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                placeholder="Document the resolution action..."
                className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              ></textarea>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setResolveModalOpen(false)}
                disabled={resolving}
                className="flex-1 px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitResolve}
                disabled={resolving}
                className="flex-1 px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {resolving ? 'Resolving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

