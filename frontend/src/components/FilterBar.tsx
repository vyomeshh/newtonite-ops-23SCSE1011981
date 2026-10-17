import React from 'react';
import { Filter, Plus, RotateCcw, Search, X } from 'lucide-react';
import { FilterParams, Team } from '../types';

interface FilterBarProps {
  filters: FilterParams;
  teams: Team[];
  onFilterChange: (newFilters: Partial<FilterParams>) => void;
  onResetFilters: () => void;
  onCreateItem: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  teams,
  onFilterChange,
  onResetFilters,
  onCreateItem,
}) => {
  const hasActiveFilters = Boolean(
    filters.team_id ||
      filters.status ||
      filters.priority ||
      filters.item_type ||
      filters.attention_filter ||
      filters.q
  );

  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl p-4 mb-6 shadow-sm">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search work items by title, description..."
            value={filters.q || ''}
            onChange={(e) => onFilterChange({ q: e.target.value, page: 1 })}
            className="input-field pl-9 pr-8 text-sm"
          />
          {filters.q && (
            <button
              onClick={() => onFilterChange({ q: '', page: 1 })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Team */}
          <select
            value={filters.team_id || ''}
            onChange={(e) =>
              onFilterChange({
                team_id: e.target.value ? Number(e.target.value) : '',
                page: 1,
              })
            }
            className="input-field text-xs py-2 w-auto min-w-[140px]"
          >
            <option value="">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Status */}
          <select
            value={filters.status || ''}
            onChange={(e) => onFilterChange({ status: e.target.value, page: 1 })}
            className="input-field text-xs py-2 w-auto"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="AWAITING_APPROVAL">Awaiting Approval</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>

          {/* Priority */}
          <select
            value={filters.priority || ''}
            onChange={(e) => onFilterChange({ priority: e.target.value, page: 1 })}
            className="input-field text-xs py-2 w-auto"
          >
            <option value="">All Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>

          {/* Item Type */}
          <select
            value={filters.item_type || ''}
            onChange={(e) => onFilterChange({ item_type: e.target.value, page: 1 })}
            className="input-field text-xs py-2 w-auto"
          >
            <option value="">All Types</option>
            <option value="INCIDENT">Incident</option>
            <option value="CUSTOMER_ISSUE">Customer Issue</option>
            <option value="PAYMENT">Payment</option>
            <option value="COMPLIANCE">Compliance</option>
            <option value="TASK">Task</option>
          </select>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="btn-secondary text-xs py-2 px-3 flex items-center space-x-1"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}

          {/* New Item Button */}
          <button
            onClick={onCreateItem}
            className="btn-primary text-xs py-2 px-3 flex items-center space-x-1 ml-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Item</span>
          </button>
        </div>
      </div>

      {/* Attention filter active indicator */}
      {filters.attention_filter && (
        <div className="mt-3 pt-3 border-t border-surface-border/60 flex items-center space-x-2">
          <span className="text-xs text-gray-400">Attention Filter:</span>
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-accent/20 border border-accent/40 text-accent text-xs font-mono">
            <span>{filters.attention_filter.replace(/_/g, ' ')}</span>
            <button
              onClick={() => onFilterChange({ attention_filter: undefined, page: 1 })}
              className="hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
};
