import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Edit2,
  GitCommit,
  History,
  MessageSquare,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  User as UserIcon,
  X,
  Zap,
} from 'lucide-react';
import { itemsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  ActivityEvent,
  ConflictResponse,
  ItemType,
  Priority,
  Status,
  WorkItemDetail,
} from '../types';

interface WorkItemDetailModalProps {
  itemId: number;
  onClose: () => void;
}

export const WorkItemDetailModal: React.FC<WorkItemDetailModalProps> = ({ itemId, onClose }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [transitionComment, setTransitionComment] = useState('');
  const [pendingTransition, setPendingTransition] = useState<string | null>(null);
  const [conflictData, setConflictData] = useState<ConflictResponse | null>(null);

  // Form state
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('MEDIUM');
  const [editType, setEditType] = useState<ItemType>('TASK');
  const [simulateStaleVersion, setSimulateStaleVersion] = useState(false);

  // Fetch Item Details
  const {
    data: item,
    isLoading: isLoadingItem,
    refetch: refetchItem,
  } = useQuery<WorkItemDetail>({
    queryKey: ['item', itemId],
    queryFn: () => itemsApi.get(itemId),
  });

  React.useEffect(() => {
    if (item) {
      setEditTitle(item.title);
      setEditDesc(item.description || '');
      setEditPriority(item.priority);
      setEditType(item.item_type);
      setConflictData(null);
    }
  }, [item]);

  // Fetch Activity Timeline
  const { data: activity = [], refetch: refetchActivity } = useQuery<ActivityEvent[]>({
    queryKey: ['itemActivity', itemId],
    queryFn: () => itemsApi.getActivity(itemId),
  });

  // Mutation: Claim
  const claimMutation = useMutation({
    mutationFn: () => itemsApi.claim(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item', itemId] });
      queryClient.invalidateQueries({ queryKey: ['itemActivity', itemId] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  // Mutation: Transition
  const transitionMutation = useMutation({
    mutationFn: ({ targetStatus, comment }: { targetStatus: string; comment?: string }) =>
      itemsApi.transition(itemId, targetStatus, comment),
    onSuccess: () => {
      setPendingTransition(null);
      setTransitionComment('');
      queryClient.invalidateQueries({ queryKey: ['item', itemId] });
      queryClient.invalidateQueries({ queryKey: ['itemActivity', itemId] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  // Mutation: Update (Optimistic Locking)
  const updateMutation = useMutation({
    mutationFn: (payload: {
      version: number;
      title?: string;
      description?: string;
      priority?: string;
      item_type?: string;
    }) => itemsApi.update(itemId, payload),
    onSuccess: () => {
      setIsEditing(false);
      setConflictData(null);
      queryClient.invalidateQueries({ queryKey: ['item', itemId] });
      queryClient.invalidateQueries({ queryKey: ['itemActivity', itemId] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
    onError: (err: any) => {
      if (err.response?.status === 409 && err.response?.data?.current_item) {
        setConflictData(err.response.data as ConflictResponse);
      }
    },
  });

  // Mutation: Add Comment
  const commentMutation = useMutation({
    mutationFn: (text: string) => itemsApi.addComment(itemId, text),
    onSuccess: () => {
      setCommentText('');
      refetchActivity();
    },
  });

  if (isLoadingItem || !item) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-surface-panel border border-surface-border rounded-xl p-8 max-w-md w-full text-center">
          <RefreshCw className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
          <p className="text-gray-300 font-mono text-sm">Loading work item #{itemId}...</p>
        </div>
      </div>
    );
  }

  // Determine user's role in this item's team
  const userTeamMembership = user?.memberships?.find((m) => m.team_id === item.team_id);
  const userRole = userTeamMembership?.role;
  const isLeadOrAdmin = userRole === 'LEAD' || userRole === 'ADMIN';

  // Allowed transitions
  const getAvailableTransitions = (currentStatus: Status) => {
    switch (currentStatus) {
      case 'OPEN':
        return [{ target: 'IN_PROGRESS', label: 'Start Progress', leadOnly: false }];
      case 'IN_PROGRESS':
        return [
          { target: 'AWAITING_APPROVAL', label: 'Submit for Approval', leadOnly: false },
          { target: 'RESOLVED', label: 'Resolve Directly', leadOnly: false },
        ];
      case 'AWAITING_APPROVAL':
        return [
          { target: 'RESOLVED', label: 'Approve & Resolve', leadOnly: true },
          { target: 'IN_PROGRESS', label: 'Reject back to In Progress', leadOnly: true },
        ];
      case 'RESOLVED':
        return [
          { target: 'CLOSED', label: 'Close Item', leadOnly: false },
          { target: 'OPEN', label: 'Reopen Item', leadOnly: false },
        ];
      case 'CLOSED':
        return [{ target: 'OPEN', label: 'Reopen Item', leadOnly: false }];
      default:
        return [];
    }
  };

  const transitions = getAvailableTransitions(item.status);

  const handleSaveEdit = () => {
    // If simulateStaleVersion is toggled, intentionally send version - 1 or stale version 0
    const versionToSend = simulateStaleVersion ? item.version - 1 : item.version;
    updateMutation.mutate({
      version: versionToSend,
      title: editTitle,
      description: editDesc,
      priority: editPriority,
      item_type: editType,
    });
  };

  const handleResolveConflictReload = () => {
    if (conflictData?.current_item) {
      setEditTitle(conflictData.current_item.title);
      setEditDesc(conflictData.current_item.description || '');
      setEditPriority(conflictData.current_item.priority);
      setEditType(conflictData.current_item.item_type);
      setSimulateStaleVersion(false);
      setConflictData(null);
      refetchItem();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-surface-panel border border-surface-border rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-border bg-surface-bg/60 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="font-mono font-bold text-accent text-sm sm:text-base">
                #{item.id}
              </span>
              <span className="text-xs font-mono bg-surface-panel border border-surface-border px-2 py-0.5 rounded text-gray-300">
                v{item.version}
              </span>
              <span className="text-xs font-mono uppercase bg-accent/10 border border-accent/30 text-accent px-2 py-0.5 rounded">
                {item.item_type}
              </span>
              <span className="text-xs font-mono font-semibold bg-surface-panel border border-surface-border px-2 py-0.5 rounded text-gray-300">
                {item.priority}
              </span>
              <span className="text-xs font-mono font-semibold bg-surface-panel border border-surface-border px-2 py-0.5 rounded text-amber-400">
                {item.status.replace(/_/g, ' ')}
              </span>
            </div>

            {isEditing ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="input-field font-semibold text-base"
                placeholder="Item title"
              />
            ) : (
              <h2 className="text-lg sm:text-xl font-bold text-gray-100 leading-snug">
                {item.title}
              </h2>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="btn-secondary py-1.5 px-3 text-xs flex items-center space-x-1"
                title="Edit item details"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-surface-bg hover:bg-surface-hover border border-surface-border text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Optimistic Locking Conflict Alert */}
        {conflictData && (
          <div className="m-4 p-4 rounded-xl bg-red-950/40 border border-red-500/50 text-red-200">
            <div className="flex items-start space-x-3">
              <ShieldAlert className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-bold text-sm text-red-300">
                  HTTP 409 Conflict: Concurrent Modification Detected!
                </h4>
                <p className="text-xs text-red-300/80 mt-1">
                  Another user updated this record while you were editing (Your edit was based on{' '}
                  <span className="font-mono font-semibold text-red-200">
                    v{conflictData.your_version}
                  </span>
                  , but database is already at{' '}
                  <span className="font-mono font-semibold text-red-200">
                    v{conflictData.current_version}
                  </span>
                  ).
                </p>

                <div className="mt-3 p-3 rounded-lg bg-surface-bg/80 border border-surface-border text-xs font-mono space-y-1">
                  <p className="text-gray-400">
                    Current Server Title:{' '}
                    <span className="text-gray-200">{conflictData.current_item.title}</span>
                  </p>
                  <p className="text-gray-400">
                    Current Server Status:{' '}
                    <span className="text-amber-400">{conflictData.current_item.status}</span>
                  </p>
                </div>

                <div className="mt-3 flex items-center space-x-3">
                  <button
                    onClick={handleResolveConflictReload}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Load Server Version & Re-apply</span>
                  </button>
                  <button
                    onClick={() => setConflictData(null)}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top Operational Action Bar */}
          <div className="p-4 rounded-xl bg-surface-bg/70 border border-surface-border">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {/* Claim section */}
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wider block font-mono">
                  Assignee
                </span>
                <div className="flex items-center space-x-2 mt-1">
                  {item.assignee_name ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-accent text-xs font-bold font-mono">
                        {item.assignee_name.charAt(0)}
                      </div>
                      <span className="text-sm font-semibold text-gray-200">
                        {item.assignee_name}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-3">
                      <span className="text-xs text-amber-400 italic">Unassigned</span>
                      <button
                        onClick={() => claimMutation.mutate()}
                        disabled={claimMutation.isPending}
                        className="btn-primary text-xs py-1 px-3 flex items-center space-x-1"
                      >
                        <Zap className="w-3 h-3 fill-black" />
                        <span>{claimMutation.isPending ? 'Claiming...' : 'Claim (Atomic)'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Workflow transitions */}
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wider block font-mono">
                  Workflow Next Steps
                </span>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {transitions.length === 0 ? (
                    <span className="text-xs text-gray-500">No transitions available</span>
                  ) : (
                    transitions.map((t) => {
                      const disabled = t.leadOnly && !isLeadOrAdmin;
                      return (
                        <button
                          key={t.target}
                          onClick={() => setPendingTransition(t.target)}
                          disabled={disabled || transitionMutation.isPending}
                          className={`text-xs py-1 px-3 rounded-lg border font-medium flex items-center space-x-1.5 transition-all ${
                            disabled
                              ? 'bg-surface-panel/40 border-surface-border text-gray-600 cursor-not-allowed'
                              : 'bg-accent/15 hover:bg-accent/25 border-accent/40 text-accent active:scale-95'
                          }`}
                          title={disabled ? 'Requires LEAD role on this team' : undefined}
                        >
                          {t.leadOnly && <Shield className="w-3 h-3 text-purple-400" />}
                          <span>{t.label}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Pending transition comment modal */}
            {pendingTransition && (
              <div className="mt-4 pt-4 border-t border-surface-border/70 flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  placeholder={`Optional comment for transition to ${pendingTransition}...`}
                  value={transitionComment}
                  onChange={(e) => setTransitionComment(e.target.value)}
                  className="input-field text-xs py-1.5 flex-1"
                />
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() =>
                      transitionMutation.mutate({
                        targetStatus: pendingTransition,
                        comment: transitionComment || undefined,
                      })
                    }
                    disabled={transitionMutation.isPending}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    Confirm {pendingTransition}
                  </button>
                  <button
                    onClick={() => setPendingTransition(null)}
                    className="btn-secondary text-xs py-1.5 px-2.5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Details / Edit Form */}
          {isEditing ? (
            <div className="p-4 rounded-xl bg-surface-panel border border-surface-border space-y-4">
              <h3 className="text-sm font-semibold text-gray-200">Edit Work Item Properties</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as Priority)}
                    className="input-field text-xs"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Item Type</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as ItemType)}
                    className="input-field text-xs"
                  >
                    <option value="INCIDENT">Incident</option>
                    <option value="CUSTOMER_ISSUE">Customer Issue</option>
                    <option value="PAYMENT">Payment</option>
                    <option value="COMPLIANCE">Compliance</option>
                    <option value="TASK">Task</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Description</label>
                <textarea
                  rows={4}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="input-field text-xs font-mono"
                  placeholder="Operational details, steps to reproduce, or instructions..."
                />
              </div>

              {/* Stale Version Simulation Toggle for Optimistic Locking Verification */}
              <div className="p-3 rounded-lg bg-surface-bg border border-amber-500/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-amber-400">
                    Test Concurrency: Simulate Stale Version
                  </span>
                  <p className="text-[11px] text-gray-400">
                    Submits an outdated version number (v{item.version - 1}) to deliberately trigger
                    an HTTP 409 Conflict.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={simulateStaleVersion}
                  onChange={(e) => setSimulateStaleVersion(e.target.checked)}
                  className="h-4 w-4 rounded accent-accent"
                />
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={updateMutation.isPending}
                  className="btn-primary text-xs py-2 px-4"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setConflictData(null);
                  }}
                  className="btn-secondary text-xs py-2 px-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left 2 Cols: Description & Metadata */}
              <div className="md:col-span-2 space-y-4">
                <div>
                  <h4 className="text-xs uppercase font-mono text-gray-400 mb-2">Description</h4>
                  <div className="p-4 rounded-xl bg-surface-bg/50 border border-surface-border text-sm text-gray-300 leading-relaxed font-sans min-h-[100px] whitespace-pre-wrap">
                    {item.description || (
                      <span className="text-gray-500 italic">No description provided.</span>
                    )}
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-surface-bg/30 border border-surface-border text-xs">
                  <div>
                    <span className="text-gray-500 block">Team</span>
                    <span className="font-medium text-gray-200">
                      {item.team_name || `Team ${item.team_id}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Created By</span>
                    <span className="font-medium text-gray-200">
                      {item.created_by_name || 'System'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Approved By</span>
                    <span className="font-medium text-gray-200">
                      {item.approved_by_name || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Created At</span>
                    <span className="font-mono text-gray-400">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Updated At</span>
                    <span className="font-mono text-gray-400">
                      {new Date(item.updated_at).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Due Date</span>
                    <span className="font-mono text-gray-400">
                      {item.due_date ? new Date(item.due_date).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Col: RBAC Info & Quick Facts */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-surface-bg/40 border border-surface-border text-xs space-y-2">
                  <h4 className="font-mono uppercase text-gray-400 text-[11px] font-semibold flex items-center space-x-1">
                    <Shield className="w-3.5 h-3.5 text-accent" />
                    <span>Your Access Level</span>
                  </h4>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Role in Team:</span>
                    <span className="font-mono font-bold text-accent">
                      {userRole || 'NO ROLE'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Can Approve:</span>
                    <span
                      className={`font-semibold ${
                        isLeadOrAdmin ? 'text-emerald-400' : 'text-gray-500'
                      }`}
                    >
                      {isLeadOrAdmin ? 'Yes (LEAD/ADMIN)' : 'No (Requires LEAD)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Activity Timeline & Comments */}
          <div className="pt-6 border-t border-surface-border space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-sm text-gray-200">
                  Activity Audit Trail & Comments
                </h3>
              </div>
              <span className="text-xs font-mono text-gray-500">
                {activity.length} event{activity.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Comment Input */}
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Write an operational note or comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && commentText.trim()) {
                    commentMutation.mutate(commentText.trim());
                  }
                }}
                className="input-field text-xs py-2 flex-1"
              />
              <button
                onClick={() => {
                  if (commentText.trim()) {
                    commentMutation.mutate(commentText.trim());
                  }
                }}
                disabled={!commentText.trim() || commentMutation.isPending}
                className="btn-primary text-xs py-2 px-3 flex items-center space-x-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </div>

            {/* Timeline Stream */}
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
              {activity.map((event) => (
                <div
                  key={event.id}
                  className="p-3 rounded-lg bg-surface-bg/50 border border-surface-border/60 text-xs flex items-start space-x-3"
                >
                  <div className="mt-0.5 p-1 rounded bg-surface-panel border border-surface-border text-accent flex-shrink-0">
                    <GitCommit className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-200">
                        {event.actor_name || `User #${event.actor_id}`}
                      </span>
                      <span className="text-[10px] font-mono text-gray-500">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-accent font-mono text-[11px] mt-0.5">
                      {event.event_type.replace(/_/g, ' ')}
                    </p>

                    {event.comment_text && (
                      <p className="text-gray-300 mt-1 bg-surface-panel/80 p-2 rounded border border-surface-border/40">
                        "{event.comment_text}"
                      </p>
                    )}

                    {event.old_value && event.new_value && (
                      <div className="mt-1 text-[11px] font-mono text-gray-400">
                        <span className="text-red-400 line-through">
                          {JSON.stringify(event.old_value)}
                        </span>{' '}
                        →{' '}
                        <span className="text-emerald-400">
                          {JSON.stringify(event.new_value)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
