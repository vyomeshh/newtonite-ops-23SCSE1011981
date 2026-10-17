import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, UserCheck } from 'lucide-react';
import { SummaryCounts } from '../types';

interface SummaryCardsProps {
  summary?: SummaryCounts;
  activeFilter?: string;
  onSelectFilter: (filterName?: string) => void;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  summary,
  activeFilter,
  onSelectFilter,
}) => {
  const cards = [
    {
      id: 'assigned_to_me',
      title: 'Assigned to Me',
      count: summary?.assigned_to_me ?? 0,
      icon: UserCheck,
      color: 'text-blue-400',
      bgGlow: 'hover:border-blue-500/50',
      activeBorder: 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10',
      description: 'Active items in your queue',
    },
    {
      id: 'unassigned_urgent',
      title: 'Unassigned Urgent',
      count: summary?.unassigned_urgent ?? 0,
      icon: AlertTriangle,
      color: 'text-amber-400',
      bgGlow: 'hover:border-amber-500/50',
      activeBorder: 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10',
      description: 'Needs immediate claim by team',
    },
    {
      id: 'awaiting_my_approval',
      title: 'Awaiting My Approval',
      count: summary?.awaiting_my_approval ?? 0,
      icon: AlertCircle,
      color: 'text-purple-400',
      bgGlow: 'hover:border-purple-500/50',
      activeBorder: 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10',
      description: 'Requires LEAD sign-off',
    },
    {
      id: 'overdue',
      title: 'Overdue Items',
      count: summary?.overdue ?? 0,
      icon: Clock,
      color: 'text-rose-400',
      bgGlow: 'hover:border-rose-500/50',
      activeBorder: 'border-rose-500 bg-rose-500/10 shadow-lg shadow-rose-500/10',
      description: 'Breached SLA due date',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
      {cards.map((c) => {
        const Icon = c.icon;
        const isActive = activeFilter === c.id;

        return (
          <div
            key={c.id}
            onClick={() => onSelectFilter(isActive ? undefined : c.id)}
            className={`cursor-pointer rounded-xl p-4 border transition-all duration-200 select-none ${
              isActive
                ? c.activeBorder
                : `bg-surface-panel border-surface-border ${c.bgGlow}`
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {c.title}
              </span>
              <Icon className={`w-5 h-5 ${c.color}`} />
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold font-mono text-gray-100">
                {c.count}
              </span>
              {isActive && (
                <span className="text-[10px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded bg-surface-border text-gray-300">
                  Filtering
                </span>
              )}
            </div>

            <p className="mt-1 text-xs text-gray-500">{c.description}</p>
          </div>
        );
      })}
    </div>
  );
};
