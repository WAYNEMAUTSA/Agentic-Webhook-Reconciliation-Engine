import { useState, useEffect } from 'react';
import MetricCards from '../components/MetricCards';
import DriftChart from '../components/DriftChart';
import axios from 'axios';
import { BASE_URL } from '../lib/api';

interface Transaction {
  id: string;
  webhook_events: { event_type: string; gateway_timestamp: string }[];
  amount: number;
  gateway: string;
  current_state: string;
}

export default function Overview() {
  const [healingTransactions, setHealingTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealingTransactions = async () => {
      try {
        const res = await axios.get(
          `${BASE_URL}/transactions`,
          { params: { state: 'unknown', limit: 5 } }
        );
        setHealingTransactions(res.data.data || []);
      } catch (err) {
        console.error('Failed to fetch healing transactions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHealingTransactions();
  }, []);

  return (
    <div className="space-y-6">
      <MetricCards />
      <DriftChart />

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recent Heal Activity</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Transactions in unknown/healing state</p>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-400">Loading...</div>
        ) : healingTransactions.length === 0 ? (
          <div className="p-6 text-center text-gray-400">No transactions in healing state.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Transaction ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Gateway</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Current State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {healingTransactions.map((tx) => {
                  const events = tx.webhook_events || [];
                  const currentState = events[events.length - 1]?.event_type || tx.current_state;
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{tx.id}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">${(tx.amount / 100)?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{tx.gateway}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          {currentState}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
