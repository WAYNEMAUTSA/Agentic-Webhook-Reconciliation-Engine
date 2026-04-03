import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import axios from 'axios';
import { BASE_URL } from '../lib/api';

interface MetricSnapshot {
  timestamp: string;
  driftRate: number;
}

export default function DriftChart() {
  const [data, setData] = useState<MetricSnapshot[]>([]);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/metrics`);
      const now = new Date();
      const snapshot: MetricSnapshot = {
        timestamp: now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        driftRate: res.data.driftRate,
      };
      setData((prev) => {
        const updated = [...prev, snapshot];
        return updated.slice(-20);
      });
    } catch (err) {
      console.error('Failed to fetch metrics for chart:', err);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10_000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Drift Rate Over Time</h3>
      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="timestamp"
              tick={{ fontSize: 12 }}
              tickFormatter={(value: string) => value}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              label={{ value: 'Drift Rate %', angle: -90, position: 'insideLeft', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Line
              type="monotone"
              dataKey="driftRate"
              stroke="#f87171"
              strokeWidth={2}
              dot={false}
              name="Drift Rate %"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {data.length === 0 && (
        <p className="text-center text-gray-400 mt-4">Collecting data...</p>
      )}
    </div>
  );
}
