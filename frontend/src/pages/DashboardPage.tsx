import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { itemsApi, teamsApi } from '../api/client';
import { CreateItemModal } from '../components/CreateItemModal';
import { FilterBar } from '../components/FilterBar';
import { Navbar } from '../components/Navbar';
import { SimulatorModal } from '../components/SimulatorModal';
import { SummaryCards } from '../components/SummaryCards';
import { WorkItemDetailModal } from '../components/WorkItemDetailModal';
import { WorkItemList } from '../components/WorkItemList';
import { FilterParams, WorkItemBrief, WorkItemListResponse } from '../types';

export const DashboardPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Selected item modal state
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  // Filters state
  const [filters, setFilters] = useState<FilterParams>({
    page: 1,
    limit: 25,
  });

  // Query: Teams
  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: teamsApi.list,
  });

  // Query: Dashboard Summary counts
  const { data: summary } = useQuery({
    queryKey: ['summary'],
    queryFn: itemsApi.getSummary,
    refetchInterval: 10000,
  });

  // Query: Work Items list
  const { data: itemsData, isLoading: isLoadingItems } = useQuery<WorkItemListResponse>({
    queryKey: ['items', filters],
    queryFn: () => itemsApi.list(filters),
    placeholderData: (previousData: WorkItemListResponse | undefined) => previousData,
  });

  // Mutation: Quick Claim from list table
  const claimMutation = useMutation({
    mutationFn: (itemId: number) => itemsApi.claim(itemId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      setSelectedItemId(data.id);
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Failed to claim item. It may have already been claimed.');
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });

  const handleFilterChange = (newFilters: Partial<FilterParams>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters({
      page: 1,
      limit: 25,
    });
  };

  const handleSelectSummaryCard = (attentionFilter?: string) => {
    setFilters((prev) => ({
      ...prev,
      attention_filter: attentionFilter,
      page: 1,
    }));
  };

  const handleQuickClaim = (itemId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    claimMutation.mutate(itemId);
  };

  return (
    <div className="min-h-screen bg-surface-bg text-gray-200 flex flex-col font-sans">
      {/* Navbar */}
      <Navbar
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        onSelectItem={(itemId) => setSelectedItemId(itemId)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Operational Header / Breadcrumbs */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-mono text-gray-100 flex items-center space-x-2">
              <span>Mission Overview</span>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-normal">
                Live Operations
              </span>
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Work item management with row locking, optimistic concurrency, and outbox event streaming.
            </p>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <SummaryCards
          summary={summary}
          activeFilter={filters.attention_filter}
          onSelectFilter={handleSelectSummaryCard}
        />

        {/* Filter & Action Controls */}
        <FilterBar
          filters={filters}
          teams={teams}
          onFilterChange={handleFilterChange}
          onResetFilters={handleResetFilters}
          onCreateItem={() => setIsCreateOpen(true)}
        />

        {/* Work Items Table */}
        <WorkItemList
          items={itemsData?.items || []}
          total={itemsData?.total || 0}
          page={filters.page}
          limit={filters.limit}
          pages={itemsData?.pages || 0}
          isLoading={isLoadingItems}
          onPageChange={(page) => handleFilterChange({ page })}
          onLimitChange={(limit) => handleFilterChange({ limit, page: 1 })}
          onSelectItem={(item) => setSelectedItemId(item.id)}
          onClaimItem={handleQuickClaim}
        />
      </main>

      {/* Work Item Detail Modal */}
      {selectedItemId !== null && (
        <WorkItemDetailModal
          itemId={selectedItemId}
          onClose={() => setSelectedItemId(null)}
        />
      )}

      {/* Create Item Modal */}
      {isCreateOpen && (
        <CreateItemModal
          teams={teams}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={(newItemId) => {
            setIsCreateOpen(false);
            setSelectedItemId(newItemId);
          }}
        />
      )}

      {/* Simulator Modal */}
      {isSimulatorOpen && (
        <SimulatorModal
          onClose={() => setIsSimulatorOpen(false)}
          onViewItem={(id) => {
            setIsSimulatorOpen(false);
            setSelectedItemId(id);
          }}
        />
      )}
    </div>
  );
};
