import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { BASE_URL } from '../lib/api';

interface TransactionEvent {
  event_type: string;
  gateway_timestamp: string;
  source: string;
  id: string;
}

interface Transaction {
  id: string;
  webhook_events: TransactionEvent[];
  amount: number;
  gateway: string;
  current_state: string;
  gateway_txn_id: string;
  currency: string;
}

const stateColors: Record<string, string> = {
  initiated: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  processing: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  unknown: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  healing: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  settled: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  refunded: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

const statusBadgeColors: Record<string, string> = {
  settled: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  unknown: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  healing: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  refunded: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export default function TransactionList() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<string>('');
  const [gatewayFilter, setGatewayFilter] = useState<string>('');

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const params: Record<string, string> = {};
        if (stateFilter) params.state = stateFilter;
        if (gatewayFilter) params.gateway = gatewayFilter;
        const res = await axios.get(
          `${BASE_URL}/transactions`,
          { params }
        );
        setTransactions(res.data.data || []);
      } catch (err) {
        console.error('Failed to fetch transactions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [stateFilter, gatewayFilter]);

  const gateways = useMemo(() => {
    const unique = new Set(transactions.map((t) => t.gateway));
    return Array.from(unique);
  }, [transactions]);

  if (loading) {
    return <div className="text-center py-8 text-gray-400">Loading transactions...</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-3 items-center">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters:</label>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm"
        >
          <option value="">All States</option>
          {['initiated', 'processing', 'unknown', 'healing', 'settled', 'failed', 'refunded'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={gatewayFilter}
          onChange={(e) => setGatewayFilter(e.target.value)}
          className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm"
        >
          <option value="">All Gateways</option>
          {gateways.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Transaction ID</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">State Timeline</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Amount</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Gateway</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {transactions.map((tx) => {
              const events = tx.webhook_events || [];
              const status = events[events.length - 1]?.event_type || tx.current_state;
              return (
                <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{tx.id}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {events.map((evt, i) => (
                        <span
                          key={i}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${stateColors[evt.event_type] || 'bg-gray-100 text-gray-800'}`}
                        >
                          {evt.event_type}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">${(tx.amount / 100)?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{tx.gateway}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadgeColors[status] || 'bg-gray-100 text-gray-800'}`}>
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {transactions.length === 0 && (
        <div className="text-center py-8 text-gray-400">No transactions found.</div>
      )}
    </div>
  );
}
