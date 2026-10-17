import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ChevronDown,
  Cpu,
  Flame,
  LogOut,
  Shield,
  User as UserIcon,
  Zap,
} from 'lucide-react';
import { notificationsApi } from '../api/client';
import { DEMO_ACCOUNTS, useAuth } from '../context/AuthContext';
import { NotificationDropdown } from './NotificationDropdown';

interface NavbarProps {
  onOpenSimulator: () => void;
  onSelectItem?: (itemId: number) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSimulator, onSelectItem }) => {
  const { user, logout, switchUser } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const { data: outboxStats } = useQuery({
    queryKey: ['outboxStats'],
    queryFn: notificationsApi.getOutboxStats,
    refetchInterval: 5000,
  });

  return (
    <header className="sticky top-0 z-40 bg-surface-panel/95 backdrop-blur-md border-b border-surface-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 text-black font-black text-lg font-mono">
            N
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-gray-100 tracking-wide font-mono text-base">
                NEWTONITE<span className="text-accent">OPS</span>
              </span>
              <span className="text-[10px] bg-accent/20 border border-accent/40 text-accent font-mono px-1.5 py-0.5 rounded">
                v1.0
              </span>
            </div>
            <p className="text-[11px] text-gray-400 -mt-0.5 hidden sm:block">
              Operations Under Pressure • High-Concurrency Control Room
            </p>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Outbox Status Pill */}
          <div
            className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-surface-bg border border-surface-border text-xs font-mono"
            title="Transactional Outbox Worker status"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-gray-400">Outbox:</span>
            <span className="text-emerald-400 font-semibold">
              {outboxStats?.completed ?? 0} sent
            </span>
            {outboxStats && outboxStats.pending > 0 && (
              <span className="text-amber-400">({outboxStats.pending} pending)</span>
            )}
          </div>

          {/* Simulator Button */}
          <button
            onClick={onOpenSimulator}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent text-xs font-semibold transition-all duration-200 active:scale-95 shadow-sm shadow-accent/10"
          >
            <Zap className="w-4 h-4 fill-accent" />
            <span className="hidden sm:inline">Stress Test Lab</span>
            <span className="sm:hidden">Lab</span>
          </button>

          {/* Notifications */}
          <NotificationDropdown onSelectItem={onSelectItem} />

          {/* User Quick Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-surface-bg hover:bg-surface-hover border border-surface-border transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-full bg-surface-border flex items-center justify-center text-accent font-semibold text-xs font-mono">
                {user?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="hidden lg:block text-xs">
                <p className="font-medium text-gray-200 leading-tight">{user?.full_name}</p>
                <p className="text-[10px] text-gray-400 truncate max-w-[120px]">
                  {user?.memberships?.[0]?.role || 'User'}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>

            {userMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-72 bg-surface-panel border border-surface-border rounded-xl shadow-2xl z-50 overflow-hidden animate-slide-up"
                onMouseLeave={() => setUserMenuOpen(false)}
              >
                <div className="p-3 border-b border-surface-border bg-surface-bg/50">
                  <p className="text-xs font-semibold text-gray-300">Signed in as</p>
                  <p className="text-xs font-mono text-accent truncate">{user?.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {user?.memberships?.map((m) => (
                      <span
                        key={m.id}
                        className="text-[10px] bg-surface-panel border border-surface-border px-1.5 py-0.5 rounded text-gray-300 font-mono"
                      >
                        Team {m.team_id}: {m.role}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-2 border-b border-surface-border">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold px-2 py-1">
                    Quick-Switch User (RBAC Test)
                  </p>
                  <div className="space-y-1">
                    {DEMO_ACCOUNTS.map((acc) => (
                      <button
                        key={acc.email}
                        onClick={() => {
                          switchUser(acc.email);
                          setUserMenuOpen(false);
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
                          user?.email === acc.email
                            ? 'bg-accent/20 text-accent font-semibold'
                            : 'text-gray-300 hover:bg-surface-hover'
                        }`}
                      >
                        <span className="truncate">{acc.name}</span>
                        <span className="text-[10px] font-mono text-gray-500">{acc.role}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-1">
                  <button
                    onClick={() => {
                      logout();
                      setUserMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
