import { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import axios from 'axios';
import { BASE_URL } from '../lib/api';
import { TrendingDown, Heart, Webhook, AlertTriangle, Shield, ShieldCheck } from 'lucide-react';


interface Metrics {
  driftRate: number;
  healSuccessRate: number;
  totalWebhooks: number;
  openAnomalies: number;
  healStats: {
    totalEvents: number;
    healedEvents: number;
    normalEvents: number;
    totalAgentInterventions: number;
    healed: number;
    suppressed: number;
    processed: number;
    recoveryRate: number;
  };
}

interface DriftDataPoint {
  timestamp: string;
  driftRate: number;
  dropped?: number;
  outOfOrder?: number;
  duplicates?: number;
}

interface WebhookVolumeData {
  state: string;
  count: number;
  fill: string;
}

interface HealActivity {
  id: string;
  description: string;
  created_at: string;
  transaction_id: string;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [driftHistory, setDriftHistory] = useState<DriftDataPoint[]>([]);
  const [webhookVolume, setWebhookVolume] = useState<WebhookVolumeData[]>([]);
  const [healActivity, setHealActivity] = useState<HealActivity[]>([]);
  const [healerHistory, setHealerHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      const [metricsRes, anomaliesRes, transactionsRes, driftHistoryRes, healerHistoryRes] = await Promise.all([
        axios.get<Metrics>(`${BASE_URL}/metrics`),
        axios.get(`${BASE_URL}/anomalies`),
        axios.get(`${BASE_URL}/transactions?limit=1000`),
        axios.get(`${BASE_URL}/metrics/drift-history`),
        axios.get(`${BASE_URL}/metrics/healer-history`),
      ]);

      const data = metricsRes.data;
      setMetrics(data);

      // Real drift history from drift_snapshots
      const driftData = driftHistoryRes.data.data || [];
      setDriftHistory(driftData);

      // Healer agent history
      setHealerHistory(healerHistoryRes.data.data || []);

      // Real transaction states breakdown from transactions data
      const transactions = transactionsRes.data.data || [];
      const stateMap: Record<string, number> = {};
      transactions.forEach((tx: any) => {
        const state = tx.current_state || 'unknown';
        stateMap[state] = (stateMap[state] || 0) + 1;
      });

      const stateColors: Record<string, string> = {
        initiated: '#3b82f6',
        created: '#6366f1',
        authorized: '#8b5cf6',
        captured: '#10b981',
        settled: '#22c55e',
        failed: '#ef4444',
        refunded: '#6366f1',
        unknown: '#f59e0b',
      };

      const realVolume = Object.entries(stateMap)
        .map(([state, count]) => ({
          state: state.charAt(0).toUpperCase() + state.slice(1),
          count,
          fill: stateColors[state] || '#94a3b8',
        }))
        .sort((a, b) => b.count - a.count);

      setWebhookVolume(realVolume.length > 0 ? realVolume : []);

      // Heal activity from anomalies
      const anomalies = anomaliesRes.data.data || [];
      setHealActivity(
        anomalies.slice(0, 5).map((a: any) => ({
          id: a.id,
          description: a.description || `Resolved anomaly in tx ${a.transaction_id?.substring(0, 8)}`,
          created_at: a.created_at,
          transaction_id: a.transaction_id,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate placeholder chart data
  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !metrics) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="metric-card">
            <div className="skeleton h-4 w-24 rounded mb-3"></div>
            <div className="skeleton h-10 w-32 rounded mb-2"></div>
            <div className="skeleton h-3 w-20 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  const isDriftCritical = metrics.driftRate > 5;
  const hasManualQueue = metrics.openAnomalies > 0;

  const getDriftStatus = () => {
    if (metrics.driftRate > 5) return { text: 'Critical - Review needed', color: '#EF4444', bg: '#FEF2F2', border: '#EF4444' };
    if (metrics.driftRate > 2) return { text: 'Warning - Monitor closely', color: '#F59E0B', bg: '#FFFBEB', border: '#F59E0B' };
    return { text: 'Healthy', color: '#22C55E', bg: '#F0FDF4', border: '#22C55E' };
  };

  const driftStatus = getDriftStatus();

  return (
    <div className="space-y-6">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Drift Rate */}
        <div className="metric-card" style={{ background: driftStatus.bg, borderColor: driftStatus.border }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[#111827]">Drift Rate</span>
            <TrendingDown style={{ color: driftStatus.color }} className="h-5 w-5" />
          </div>
          <p className="metric-value mb-2" style={{ color: driftStatus.color }}>
            {metrics.driftRate.toFixed(2)}%
          </p>
          <p className="text-xs font-medium" style={{ color: driftStatus.color }}>
            {driftStatus.text}
          </p>
        </div>

        {/* Heal Success Rate */}
        <div className="metric-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[#111827]">Heal Success Rate</span>
            <Heart className="h-5 w-5" style={{ color: '#22C55E' }} />
          </div>
          <p className="metric-value mb-2" style={{ color: '#22C55E' }}>
            {metrics.healSuccessRate.toFixed(2)}%
          </p>
          <p className="text-xs font-medium text-[#6B7280]">
            {metrics.healSuccessRate >= 90 ? 'Excellent' : 'Monitor'}
          </p>
        </div>

        {/* Webhooks */}
        <div className="metric-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[#111827]">Webhooks (60 min)</span>
            <Webhook className="h-5 w-5" style={{ color: '#0EA5E9' }} />
          </div>
          <p className="metric-value mb-2" style={{ color: '#111827' }}>
            {(metrics.totalWebhooks || 0).toLocaleString()}
          </p>
          <p className="text-xs font-medium text-[#6B7280]">Events received</p>
        </div>

        {/* Open Anomalies */}
        <div className="metric-card" style={{ background: hasManualQueue ? '#FFFBEB' : '#F0FDF4', borderColor: hasManualQueue ? '#F59E0B' : '#22C55E' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[#111827]">Open Anomalies</span>
            <AlertTriangle className="h-5 w-5" style={{ color: hasManualQueue ? '#F59E0B' : '#22C55E' }} />
          </div>
          <p className="metric-value mb-2" style={{ color: hasManualQueue ? '#F59E0B' : '#22C55E' }}>
            {metrics.openAnomalies}
          </p>
          <p className="text-xs font-medium" style={{ color: hasManualQueue ? '#F59E0B' : '#22C55E' }}>
            {hasManualQueue ? 'Needs review' : 'All resolved'}
          </p>
        </div>

        {/* AI Recovery Rate */}
        <div className="metric-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[#111827]">AI Recovery Rate</span>
            <ShieldCheck className="h-5 w-5" style={{ color: '#6366F1' }} />
          </div>
          <p className="metric-value mb-2" style={{ color: '#6366F1' }}>
            {metrics.healStats?.recoveryRate.toFixed(1) ?? 0}%
          </p>
          <p className="text-xs font-medium text-[#6B7280]">
            {metrics.healStats?.totalAgentInterventions ?? 0} interventions
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Drift Rate Trend */}
        <div className="chart-card">
          <h3 className="text-base font-semibold text-[#111827] mb-4">Drift Rate Trend</h3>
          {driftHistory.length === 0 ? (
            <div className="flex items-center justify-center h-[250px] text-[#6B7280] text-sm">
              Collecting drift data... snapshots recorded every 10 seconds.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={driftHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} stroke="#9CA3AF" angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" label={{ value: 'Drift %', position: 'insideLeft', offset: -5 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', boxShadow: '0 4px 25px rgba(0,0,0,0.12)' }}
                  labelStyle={{ color: '#111827', fontWeight: 600 }}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Drift Rate']}
                />
                <Line
                  type="monotone"
                  dataKey="driftRate"
                  stroke={isDriftCritical ? '#EF4444' : '#22C55E'}
                  strokeWidth={2}
                  dot={false}
                  name="Drift %"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Transaction States */}
        <div className="chart-card">
          <h3 className="text-base font-semibold text-[#111827] mb-4">Transaction States</h3>
          {webhookVolume.length === 0 ? (
            <div className="flex items-center justify-center h-[250px] text-[#6B7280] text-sm">
              No transaction data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={webhookVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="state" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', boxShadow: '0 4px 25px rgba(0,0,0,0.12)' }}
                  labelStyle={{ color: '#111827', fontWeight: 600 }}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} name="Transactions">
                  {webhookVolume.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Audit Log + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AI Agent Audit Log */}
        <div className="log-panel">
          <h3 className="text-base font-semibold text-[#111827] mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5" style={{ color: '#6366F1' }} />
            AI Agent Audit Log
          </h3>
          {healerHistory.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-[#6B7280] text-sm">
              No agent interventions yet.
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {healerHistory.slice(0, 15).map((entry: any) => (
                <div key={entry.id} className="text-xs border-b border-[#E5E7EB] pb-3 last:border-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block px-2.5 py-1 rounded-full font-semibold text-[10px] tracking-wide"
                        style={{
                          background: entry.outcome === 'healed' ? '#DCFCE7' : entry.outcome === 'suppressed' ? '#FEF3C7' : '#DBEAFE',
                          color: entry.outcome === 'healed' ? '#166534' : entry.outcome === 'suppressed' ? '#92400E' : '#1E40AF',
                        }}
                      >
                        {entry.outcome === 'healed' ? 'HEALED_BY_AI' :
                         entry.outcome === 'suppressed' ? 'SUPPRESSED' : 'PROCESSED'}
                      </span>
                      <span className="font-mono text-[#6B7280]">{entry.gateway_txn_id}</span>
                    </div>
                    <span className="text-[#6B7280] tabular-nums">{entry.created_at}</span>
                  </div>
                  {entry.actions && entry.actions.length > 0 && (
                    <p className="text-[#111827] mt-1.5 leading-relaxed">{entry.actions.join(' → ')}</p>
                  )}
                  {entry.bridge_events > 0 && (
                    <p className="text-[#6B7280] mt-1">{entry.bridge_events} bridge event(s) synthesized</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="log-panel">
          <h3 className="text-base font-semibold text-[#111827] mb-4 flex items-center gap-2">
            <TrendingDown className="h-5 w-5" style={{ color: '#0EA5E9' }} />
            Recent Activity
          </h3>
          {healActivity.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-[#6B7280] text-sm">
              No recent activity. Ledger is healthy.
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {healActivity.map((activity) => (
                <div key={activity.id} className="py-3 flex items-start justify-between">
                  <div className="flex-1 pr-4">
                    <p className="text-sm font-medium text-[#111827]">{activity.description}</p>
                    <p className="text-xs text-[#6B7280] mt-1 font-mono">{activity.transaction_id}</p>
                  </div>
                  <span className="text-xs text-[#6B7280] whitespace-nowrap tabular-nums">
                    {new Date(activity.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

