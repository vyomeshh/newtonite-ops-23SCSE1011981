import React from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  User as UserIcon,
  Zap,
} from 'lucide-react';
import { ItemType, Priority, Status, WorkItemBrief } from '../types';

interface WorkItemListProps {
  items: WorkItemBrief[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  isLoading: boolean;
  onPageChange: (newPage: number) => void;
  onLimitChange: (newLimit: number) => void;
  onSelectItem: (item: WorkItemBrief) => void;
  onClaimItem: (itemId: number, e: React.MouseEvent) => void;
}

const PRIORITY_STYLES: Record<Priority, { label: string; badge: string }> = {
  URGENT: { label: 'URGENT', badge: 'bg-red-500/20 text-red-400 border-red-500/30' },
  HIGH: { label: 'HIGH', badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  MEDIUM: { label: 'MED', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  LOW: { label: 'LOW', badge: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

const STATUS_STYLES: Record<Status, { label: string; badge: string }> = {
  OPEN: { label: 'Open', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  IN_PROGRESS: { label: 'In Progress', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  AWAITING_APPROVAL: {
    label: 'Awaiting Approval',
    badge: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  },
  RESOLVED: { label: 'Resolved', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  CLOSED: { label: 'Closed', badge: 'bg-gray-600/10 text-gray-400 border-gray-600/30' },
};

const TYPE_STYLES: Record<ItemType, string> = {
  INCIDENT: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  CUSTOMER_ISSUE: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  PAYMENT: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  COMPLIANCE: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  TASK: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
};

export const WorkItemList: React.FC<WorkItemListProps> = ({
  items,
  total,
  page,
  limit,
  pages,
  isLoading,
  onPageChange,
  onLimitChange,
  onSelectItem,
  onClaimItem,
}) => {
  const isOverdue = (dueDateStr: string | null, status: Status) => {
    if (!dueDateStr) return false;
    if (status === 'RESOLVED' || status === 'CLOSED') return false;
    return new Date(dueDateStr) < new Date();
  };

  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl shadow-sm overflow-hidden">
      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-surface-border bg-surface-bg/40 text-[11px] font-mono uppercase text-gray-400 tracking-wider">
              <th className="py-3 px-4 w-16">ID / Ver</th>
              <th className="py-3 px-4 min-w-[280px]">Work Item & Type</th>
              <th className="py-3 px-3 w-24">Priority</th>
              <th className="py-3 px-3 w-36">Status</th>
              <th className="py-3 px-3 min-w-[140px]">Team</th>
              <th className="py-3 px-3 min-w-[140px]">Assignee</th>
              <th className="py-3 px-3 w-32">Due Date</th>
              <th className="py-3 px-4 w-28 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border/50 text-xs">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={8} className="py-4 px-4">
                    <div className="h-4 bg-surface-border/50 rounded w-full" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-gray-500">
                  <Layers className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                  <p className="text-sm font-medium">No work items found</p>
                  <p className="text-xs text-gray-600 mt-1">
                    Try adjusting your filter or search query.
                  </p>
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const pStyle = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.LOW;
                const sStyle = STATUS_STYLES[item.status] || STATUS_STYLES.OPEN;
                const overdue = isOverdue(item.due_date, item.status);

                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelectItem(item)}
                    className="hover:bg-surface-hover/80 transition-colors cursor-pointer group"
                  >
                    {/* ID & Version */}
                    <td className="py-3.5 px-4 font-mono">
                      <div className="flex items-center space-x-1">
                        <span className="text-accent font-semibold">#{item.id}</span>
                        <span className="text-[10px] text-gray-500 bg-surface-bg px-1 py-0.5 rounded border border-surface-border">
                          v{item.version}
                        </span>
                      </div>
                    </td>

                    {/* Title & Type */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            TYPE_STYLES[item.item_type] || TYPE_STYLES.TASK
                          }`}
                        >
                          {item.item_type}
                        </span>
                        <span className="font-medium text-gray-200 group-hover:text-white line-clamp-1">
                          {item.title}
                        </span>
                      </div>
                    </td>

                    {/* Priority */}
                    <td className="py-3.5 px-3">
                      <span
                        className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border inline-block ${pStyle.badge}`}
                      >
                        {pStyle.label}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-3">
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded border inline-flex items-center space-x-1 ${sStyle.badge}`}
                      >
                        <span>{sStyle.label}</span>
                      </span>
                    </td>

                    {/* Team */}
                    <td className="py-3.5 px-3 text-gray-400 truncate max-w-[150px]">
                      {item.team_name || `Team ${item.team_id}`}
                    </td>

                    {/* Assignee */}
                    <td className="py-3.5 px-3">
                      {item.assignee_name ? (
                        <div className="flex items-center space-x-1.5 text-gray-300">
                          <div className="w-5 h-5 rounded-full bg-surface-border flex items-center justify-center text-[10px] font-mono text-accent">
                            {item.assignee_name.charAt(0)}
                          </div>
                          <span className="truncate max-w-[120px]">{item.assignee_name}</span>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => onClaimItem(item.id, e)}
                          className="text-[11px] text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 px-2 py-0.5 rounded transition-all active:scale-95 font-medium flex items-center space-x-1"
                          title="Claim this work item immediately"
                        >
                          <Zap className="w-3 h-3 fill-amber-400" />
                          <span>Claim</span>
                        </button>
                      )}
                    </td>

                    {/* Due Date */}
                    <td className="py-3.5 px-3 font-mono text-[11px]">
                      {item.due_date ? (
                        <div
                          className={`flex items-center space-x-1 ${
                            overdue ? 'text-red-400 font-semibold' : 'text-gray-400'
                          }`}
                        >
                          {overdue && <AlertCircle className="w-3 h-3 text-red-400 animate-pulse" />}
                          <span>{new Date(item.due_date).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <span className="text-xs text-accent font-medium group-hover:underline">
                        View Details →
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-4 border-t border-surface-border bg-surface-bg/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2 text-gray-400">
          <span>Showing</span>
          <span className="font-mono text-gray-200">
            {total > 0 ? (page - 1) * limit + 1 : 0} -{' '}
            {Math.min(page * limit, total)}
          </span>
          <span>of</span>
          <span className="font-mono text-gray-200 font-semibold">{total}</span>
          <span>items</span>

          <div className="ml-4 flex items-center space-x-1">
            <span className="text-gray-500">Per page:</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="bg-surface-panel border border-surface-border rounded px-1.5 py-0.5 text-xs text-gray-300 font-mono"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || isLoading}
            className="btn-secondary py-1 px-2.5 text-xs flex items-center space-x-1 disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          <span className="font-mono text-gray-400 px-2">
            Page <span className="text-accent font-semibold">{page}</span> of{' '}
            <span className="text-gray-200">{pages || 1}</span>
          </span>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages || isLoading}
            className="btn-secondary py-1 px-2.5 text-xs flex items-center space-x-1 disabled:opacity-40"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
