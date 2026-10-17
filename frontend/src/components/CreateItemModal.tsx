import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Key, RefreshCw, X } from 'lucide-react';
import { itemsApi } from '../api/client';
import { ItemType, Priority, Team } from '../types';

interface CreateItemModalProps {
  teams: Team[];
  onClose: () => void;
  onSuccess: (newItemId: number) => void;
}

export const CreateItemModal: React.FC<CreateItemModalProps> = ({
  teams,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [itemType, setItemType] = useState<ItemType>('INCIDENT');
  const [priority, setPriority] = useState<Priority>('HIGH');
  const [teamId, setTeamId] = useState<number>(teams[0]?.id || 1);
  const [dueDate, setDueDate] = useState<string>('');

  // Idempotency Key demonstration
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    'idem-' + Math.random().toString(36).substring(2, 10)
  );
  const [replayNotice, setReplayNotice] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      itemsApi.create(
        {
          title,
          description: description || undefined,
          item_type: itemType,
          priority,
          team_id: teamId,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
        },
        idempotencyKey.trim() || undefined
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });

      if (res.isReplay) {
        setReplayNotice(true);
        setTimeout(() => {
          onSuccess(res.data.id);
        }, 1500);
      } else {
        onSuccess(res.data.id);
      }
    },
    onError: (err: any) => {
      setErrorMsg(
        err.response?.data?.detail || err.message || 'Failed to create work item'
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setErrorMsg(null);
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-surface-panel border border-surface-border rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-border bg-surface-bg/60 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-100">Create New Work Item</h3>
            <p className="text-xs text-gray-400">
              Dispatches new operational item with idempotency protection.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-surface-hover"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Replay Notice */}
        {replayNotice && (
          <div className="m-4 p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/50 text-emerald-200 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              <strong>Idempotent Replay Verified:</strong> Backend detected duplicate key and
              safely replayed original response (X-Idempotent-Replay: true). No duplicate created!
            </span>
          </div>
        )}

        {/* Error Notice */}
        {errorMsg && (
          <div className="m-4 p-3 rounded-lg bg-red-950/40 border border-red-500/50 text-red-200 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Memory leak in background worker"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">Team</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(Number(e.target.value))}
                className="input-field text-xs"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">Type</label>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value as ItemType)}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="input-field text-xs"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">
                Due Date (SLA)
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input-field text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">Description</label>
            <textarea
              rows={3}
              placeholder="Provide context, diagnostic logs, reproduction steps..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field text-xs font-mono"
            />
          </div>

          {/* Idempotency Demonstration Box */}
          <div className="p-3 rounded-xl bg-surface-bg/80 border border-surface-border text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-300 flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-accent" />
                <span>Idempotency-Key Header</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  setIdempotencyKey('idem-' + Math.random().toString(36).substring(2, 10))
                }
                className="text-accent hover:underline flex items-center space-x-1 text-[11px]"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Regenerate Key</span>
              </button>
            </div>
            <input
              type="text"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              className="input-field text-xs font-mono py-1.5"
            />
            <p className="text-[11px] text-gray-500">
              Submit twice with the same key to verify the idempotency replay guarantee.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-surface-border">
            <button type="button" onClick={onClose} className="btn-secondary text-xs py-2 px-4">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn-primary text-xs py-2 px-5 flex items-center space-x-1"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
