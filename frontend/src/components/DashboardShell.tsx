import { ReactNode } from 'react';
import { User } from 'lucide-react';

interface DashboardShellProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { key: string; label: string; icon: ReactNode }[];
  liveTime?: Date;
  headerBanner?: ReactNode;
}

export default function DashboardShell({
  children,
  activeTab,
  onTabChange,
  tabs,
  liveTime,
  headerBanner,
}: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-[var(--color-bg-secondary)] font-sans" style={{ fontFamily: 'var(--font-body)' }}>
      {/* ── Fixed Sidebar ── */}
      <aside className="shell-sidebar">
        <div className="shell-sidebar__logo">Q</div>
        <nav className="shell-sidebar__nav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`shell-sidebar__nav-item ${
                activeTab === tab.key ? 'shell-sidebar__nav-item--active' : ''
              }`}
              title={tab.label}
            >
              {tab.icon}
            </button>
          ))}
        </nav>
        {/* Bottom nav items */}
        <div style={{ paddingBottom: '24px' }}>
          <div className="shell-sidebar__nav-item">
            <User style={{ width: 20, height: 20 }} />
          </div>
        </div>
      </aside>

      {/* ── Main Content Wrapper ── */}
      <div>
        {/* ── Top Navigation ── */}
        <nav className="shell-topnav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`shell-topnav__item ${
                activeTab === tab.key ? 'shell-topnav__item--active' : ''
              }`}
            >
              {tab.label}
            </button>
          ))}
          {liveTime && (
            <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {liveTime.toLocaleTimeString()}
            </div>
          )}
        </nav>

        {/* ── Header Banner (optional) ── */}
        {headerBanner}

        {/* ── Main Content ── */}
        <main className="shell-main">
          {children}
        </main>
      </div>
    </div>
  );
}
