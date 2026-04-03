import { useState, useEffect, useMemo } from 'react';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import ManualReview from './pages/ManualReview';
import DashboardShell from './components/DashboardShell';
import HeaderBanner from './components/HeaderBanner';
import { Activity, Database, Brain } from 'lucide-react';

type Tab = 'dashboard' | 'transactions' | 'manual-review';

const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Live Overview', icon: <Activity style={{ width: 20, height: 20 }} /> },
  { key: 'transactions', label: 'Transactions', icon: <Database style={{ width: 20, height: 20 }} /> },
  { key: 'manual-review', label: 'AI Review', icon: <Brain style={{ width: 20, height: 20 }} /> },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [liveTime, setLiveTime] = useState(new Date());
  const [headerStats, setHeaderStats] = useState<any[]>([]);

  useEffect(() => {
    const interval = setInterval(() => setLiveTime(new Date()), 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch header stats from dashboard metrics
  useEffect(() => {
    import('axios').then(async ({ default: axios }) => {
      try {
        const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
        const res = await axios.get(`${BASE_URL}/metrics`);
        const d = res.data;
        setHeaderStats([
          {
            label: 'Drift Rate',
            value: `${d.driftRate.toFixed(1)}%`,
            delta: d.driftRate > 5 ? 'critical' : d.driftRate > 2 ? 'warning' : 'healthy',
            deltaDirection: d.driftRate > 2 ? 'down' : 'up',
          },
          {
            label: 'Heal Rate',
            value: `${d.healSuccessRate.toFixed(0)}%`,
            delta: d.healSuccessRate >= 90 ? '+excellent' : 'monitor',
            deltaDirection: d.healSuccessRate >= 90 ? 'up' : 'down',
          },
          {
            label: 'Webhooks (60m)',
            value: (d.totalWebhooks ?? 0).toLocaleString(),
          },
          {
            label: 'Open Anomalies',
            value: d.openAnomalies ?? 0,
            delta: (d.openAnomalies ?? 0) > 0 ? 'needs review' : 'all clear',
            deltaDirection: (d.openAnomalies ?? 0) > 0 ? 'down' : 'up',
          },
          {
            label: 'AI Recovery',
            value: `${(d.healStats?.recoveryRate ?? 0).toFixed(0)}%`,
            delta: `${d.healStats?.totalAgentInterventions ?? 0} interventions`,
          },
        ]);
      } catch (err) {
        console.error('Failed to fetch header stats:', err);
      }
    });
  }, []);

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'transactions':
        return <Transactions />;
      case 'manual-review':
        return <ManualReview />;
    }
  };

  const headerBanner = useMemo(
    () => <HeaderBanner brand="QuantumView" stats={headerStats} />,
    [headerStats]
  );

  return (
    <DashboardShell
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as Tab)}
      tabs={tabs}
      liveTime={liveTime}
      headerBanner={headerBanner}
    >
      {renderPage()}
    </DashboardShell>
  );
}
