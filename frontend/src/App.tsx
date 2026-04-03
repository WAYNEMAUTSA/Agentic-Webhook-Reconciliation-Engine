import { useState } from 'react';
import Overview from './pages/Overview';
import Transactions from './pages/Transactions';
import ReviewQueue from './pages/ReviewQueue';
import axios from 'axios';
import { BASE_URL } from './lib/api';

type Tab = 'overview' | 'transactions' | 'review';

const tabs: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'review', label: 'Review Queue' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [chaosLoading, setChaosLoading] = useState(false);

  const runChaosDemo = async () => {
    setChaosLoading(true);
    try {
      await axios.post(
        `${BASE_URL}/mock/simulate`,
        { scenario: 'dropped' }
      );
      await axios.post(
        `${BASE_URL}/mock/simulate`,
        { scenario: 'surge' }
      );
    } catch (err) {
      console.error('Chaos demo failed:', err);
    } finally {
      setChaosLoading(false);
    }
  };

  const renderPage = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview />;
      case 'transactions':
        return <Transactions />;
      case 'review':
        return <ReviewQueue />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              🔀 Webhook Reconciliation Engine
            </h1>
            <button
              onClick={runChaosDemo}
              disabled={chaosLoading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {chaosLoading ? 'Running chaos...' : '⚡ Run Chaos Demo'}
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                  activeTab === tab.key
                    ? 'border-red-500 text-red-600 dark:text-red-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {renderPage()}
      </main>
    </div>
  );
}
