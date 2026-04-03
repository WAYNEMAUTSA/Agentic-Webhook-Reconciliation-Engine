import { useState, useEffect } from 'react';
import axios from 'axios';
import { BASE_URL } from '../lib/api';

interface Anomaly {
  id: string;
  transaction_id: string;
  type: string;
  description: string;
  amount: number;
  gateway: string;
  created_at: string;
}

export default function AnomalyQueue() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    fetchAnomalies();
  }, []);

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

  const handleResolve = async (id: string) => {
    setResolving(id);
    try {
      await axios.patch(
        `${BASE_URL}/anomalies/${id}/resolve`,
        { note: 'Manually resolved via dashboard' }
      );
      setAnomalies((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to resolve anomaly:', err);
    } finally {
      setResolving(null);
    }
  };

  const typeBadgeColors: Record<string, string> = {
    conflict: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    gateway_outage: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    timeout: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    duplicate: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400">Loading anomalies...</div>;
  }

  if (anomalies.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 border border-gray-200 dark:border-gray-700 text-center">
        <p className="text-green-500 text-lg font-medium">All clear! No anomalies to review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {anomalies.map((anomaly) => (
        <div
          key={anomaly.id}
          className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded font-mono">
                  {anomaly.transaction_id}
                </code>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeBadgeColors[anomaly.type] || 'bg-gray-100 text-gray-800'}`}>
                  {anomaly.type}
                </span>
              </div>
              <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">{anomaly.description}</p>
              <div className="flex gap-6 text-sm text-gray-500 dark:text-gray-400">
                <span>Amount: <strong className="text-gray-700 dark:text-gray-200">${anomaly.amount?.toFixed(2)}</strong></span>
                <span>Gateway: <strong className="text-gray-700 dark:text-gray-200">{anomaly.gateway}</strong></span>
                <span>
                  Detected:{' '}
                  <strong className="text-gray-700 dark:text-gray-200">
                    {new Date(anomaly.created_at).toLocaleString()}
                  </strong>
                </span>
              </div>
            </div>
            <button
              onClick={() => handleResolve(anomaly.id)}
              disabled={resolving === anomaly.id}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resolving === anomaly.id ? 'Resolving...' : 'Mark Resolved'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
