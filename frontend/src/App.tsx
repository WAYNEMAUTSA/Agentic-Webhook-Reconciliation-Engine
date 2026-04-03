import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import ManualReview from './pages/ManualReview';
import { Clock, Activity, Database, Brain } from 'lucide-react';

type Tab = 'dashboard' | 'transactions' | 'manual-review';

const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Live Overview', icon: <Activity className="h-4 w-4" /> },
  { key: 'transactions', label: 'Transactions', icon: <Database className="h-4 w-4" /> },
  { key: 'manual-review', label: 'AI Review', icon: <Brain className="h-4 w-4" /> },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [liveTime, setLiveTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setLiveTime(new Date()), 5000);
    return () => clearInterval(interval);
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

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E7EB]" style={{ height: 70 }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex items-center justify-between h-full">
            <div>
              <h1 className="text-2xl font-semibold text-[#111827]">
                Quantum<span style={{ color: '#4A5BFF' }}>View</span>
              </h1>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Webhook Events & Payment Gateway Reconciliation
              </p>
            </div>
            <div className="flex items-center gap-2 text-[#6B7280] text-sm">
              <Clock className="h-4 w-4" />
              <span className="font-medium tabular-nums">
                {liveTime.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-8">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`tab-item flex items-center gap-2 ${
                  activeTab === tab.key ? 'tab-item-active' : 'tab-item-inactive'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderPage()}
      </main>
    </div>
  );
}
