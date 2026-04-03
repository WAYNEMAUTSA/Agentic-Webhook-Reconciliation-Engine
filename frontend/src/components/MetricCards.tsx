import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BASE_URL } from '../lib/api';

interface Metrics {
  driftRate: number;
  healSuccessRate: number;
  totalWebhooks: number;
  openAnomalies: number;
  totalTransactions: number;
}

export default function MetricCards() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/metrics`);
      setMetrics(res.data);
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10_000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (loading || !metrics) {
    return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">Loading...</div>;
  }

  const cards = [
    {
      label: 'Drift Rate',
      value: `${metrics.driftRate.toFixed(2)}%`,
      textColor: metrics.driftRate > 5 ? 'text-red-500' : 'text-green-500',
    },
    {
      label: 'Heal Success Rate',
      value: `${metrics.healSuccessRate.toFixed(2)}%`,
      textColor: metrics.healSuccessRate >= 90 ? 'text-green-500' : 'text-amber-500',
    },
    {
      label: 'Total Webhooks',
      value: metrics.totalWebhooks.toLocaleString(),
      textColor: 'text-gray-900 dark:text-gray-100',
    },
    {
      label: 'Open Anomalies',
      value: metrics.openAnomalies.toLocaleString(),
      textColor: metrics.openAnomalies > 0 ? 'text-red-500' : 'text-green-500',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700"
        >
          <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
          <p className={`text-3xl font-bold mt-1 ${card.textColor}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}
