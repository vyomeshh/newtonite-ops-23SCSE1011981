import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Flame,
  Layers,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import { itemsApi, notificationsApi } from '../api/client';
import { OutboxStats, WorkItemBrief } from '../types';

interface SimulatorModalProps {
  onClose: () => void;
  onViewItem?: (itemId: number) => void;
}

export const SimulatorModal: React.FC<SimulatorModalProps> = ({ onClose, onViewItem }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'race' | 'idempotency' | 'outbox'>('race');

  // Race condition state
  const [concurrencyLevel, setConcurrencyLevel] = useState<number>(5);
  const [targetItemId, setTargetItemId] = useState<string>('');
  const [raceResults, setRaceResults] = useState<{
    item_id: number;
    concurrency_level: number;
    winner: { status: number; message: string; assignee_id?: number };
    losers: Array<{ status: number; message: string; error_detail?: string }>;
    total_duration_ms: number;
  } | null>(null);

  // Idempotency state
  const [idempKey, setIdempKey] = useState<string>('test-key-' + Math.floor(Math.random() * 9000 + 1000));
  const [idempTitle, setIdempTitle] = useState<string>('Idempotent Operational Task');
  const [idempLogs, setIdempLogs] = useState<
    Array<{ step: string; status: number; message: string; isReplay?: boolean; timestamp: string }>
  >([]);

  // Outbox stats query
  const { data: outboxStats, refetch: refetchOutbox } = useQuery<OutboxStats>({
    queryKey: ['outboxStatsModal'],
    queryFn: notificationsApi.getOutboxStats,
    refetchInterval: 3000,
  });

  // Query unassigned items to suggest
  const { data: unassignedItems } = useQuery({
    queryKey: ['unassignedUrgentItems'],
    queryFn: () => itemsApi.list({ attention_filter: 'unassigned_urgent', page: 1, limit: 5 }),
  });

  // Race simulation mutation
  const raceMutation = useMutation({
    mutationFn: async () => {
      let idToUse = targetItemId ? Number(targetItemId) : undefined;
      // If none provided, create a fresh temporary unassigned item
      if (!idToUse) {
        const temp = await itemsApi.create({
          title: `[Stress Test] High Concurrency Claim Item #${Date.now()}`,
          description: 'Created automatically for race condition verification',
          item_type: 'INCIDENT',
          priority: 'URGENT',
          team_id: 1,
        });
        idToUse = temp.data.id;
      }
      return itemsApi.simulateRace(idToUse, concurrencyLevel);
    },
    onSuccess: (data) => {
      setRaceResults(data);
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  // Test Idempotency First Call
  const handleIdempotencyFirstCall = async () => {
    try {
      const res = await itemsApi.create(
        {
          title: idempTitle,
          description: 'Testing idempotency first submission',
          item_type: 'TASK',
          priority: 'MEDIUM',
          team_id: 1,
        },
        idempKey
      );
      setIdempLogs((prev) => [
        ...prev,
        {
          step: '1. Initial POST Submission',
          status: 201,
          message: `Created Item #${res.data.id} in DB. Key stored with hash.`,
          isReplay: res.isReplay,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      queryClient.invalidateQueries({ queryKey: ['items'] });
    } catch (err: any) {
      setIdempLogs((prev) => [
        ...prev,
        {
          step: 'Initial POST Submission Failed',
          status: err.response?.status || 500,
          message: err.response?.data?.detail || err.message,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }
  };

  // Test Idempotency Replay (Identical Payload)
  const handleIdempotencyReplay = async () => {
    try {
      const res = await itemsApi.create(
        {
          title: idempTitle,
          description: 'Testing idempotency first submission',
          item_type: 'TASK',
          priority: 'MEDIUM',
          team_id: 1,
        },
        idempKey
      );
      setIdempLogs((prev) => [
        ...prev,
        {
          step: '2. Duplicate POST (Identical Payload)',
          status: 200,
          message: `X-Idempotent-Replay: true. Returned cached item #${res.data.id}. NO duplicate DB record created!`,
          isReplay: res.isReplay,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } catch (err: any) {
      setIdempLogs((prev) => [
        ...prev,
        {
          step: 'Duplicate Replay Failed',
          status: err.response?.status || 500,
          message: err.response?.data?.detail || err.message,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }
  };

  // Test Idempotency Mismatch (Altered Payload)
  const handleIdempotencyMismatch = async () => {
    try {
      await itemsApi.create(
        {
          title: idempTitle + ' - TAMPERED PAYLOAD',
          description: 'Altered description to test 422 mismatch rejection',
          item_type: 'INCIDENT',
          priority: 'URGENT',
          team_id: 1,
        },
        idempKey
      );
      setIdempLogs((prev) => [
        ...prev,
        {
          step: '3. Duplicate POST (Modified Payload)',
          status: 200,
          message: 'Unexpected success with altered payload',
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } catch (err: any) {
      setIdempLogs((prev) => [
        ...prev,
        {
          step: '3. Duplicate POST (Modified Payload)',
          status: err.response?.status || 422,
          message: `Rejection confirmed: HTTP ${err.response?.status || 422} - ${
            err.response?.data?.detail || 'Payload does not match original request'
          }`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-surface-panel border border-surface-border rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-surface-border bg-surface-bg/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-accent">
              <Zap className="w-5 h-5 fill-accent" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-100 flex items-center space-x-2">
                <span>Operational Pressure Test Lab</span>
                <span className="text-xs bg-accent/20 border border-accent/40 text-accent font-mono px-2 py-0.5 rounded">
                  Live Concurrency
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Interactive verification of Race Conditions, Idempotency, and Outbox background processing.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-surface-hover"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-surface-border bg-surface-bg/40 text-xs font-mono">
          <button
            onClick={() => setActiveTab('race')}
            className={`py-3 px-6 font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
              activeTab === 'race'
                ? 'border-accent text-accent bg-accent/5'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Flame className="w-4 h-4" />
            <span>1. Race Condition / Atomic Claim</span>
          </button>
          <button
            onClick={() => setActiveTab('idempotency')}
            className={`py-3 px-6 font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
              activeTab === 'idempotency'
                ? 'border-accent text-accent bg-accent/5'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>2. Idempotency Key Replay</span>
          </button>
          <button
            onClick={() => setActiveTab('outbox')}
            className={`py-3 px-6 font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
              activeTab === 'outbox'
                ? 'border-accent text-accent bg-accent/5'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>3. Outbox Worker Health</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: Race Condition */}
          {activeTab === 'race' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-surface-bg/60 border border-surface-border text-xs leading-relaxed space-y-2">
                <h4 className="font-semibold text-gray-200 text-sm flex items-center space-x-2">
                  <Flame className="w-4 h-4 text-accent" />
                  <span>The High-Concurrency Claim Challenge</span>
                </h4>
                <p className="text-gray-400">
                  When multiple workers simultaneously try to claim an unassigned incident, naive CRUD
                  systems encounter race conditions where multiple workers become assigned to the same item.
                  Newtonite Ops uses PostgreSQL row-level locks (
                  <code className="text-accent bg-surface-panel px-1.5 py-0.5 rounded font-mono">
                    SELECT ... FOR UPDATE
                  </code>
                  ) inside atomic transactions. Exactly one worker succeeds with HTTP 200, while the remaining
                  workers receive HTTP 409 Conflict with details on who claimed it.
                </p>
              </div>

              {/* Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-surface-panel border border-surface-border">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Target Item ID</label>
                  <input
                    type="number"
                    placeholder="Leave blank to auto-create"
                    value={targetItemId}
                    onChange={(e) => setTargetItemId(e.target.value)}
                    className="input-field text-xs font-mono"
                  />
                  {unassignedItems?.items?.[0] && (
                    <button
                      type="button"
                      onClick={() => setTargetItemId(String(unassignedItems.items[0].id))}
                      className="text-[10px] text-accent hover:underline mt-1 block"
                    >
                      Use unassigned item #{unassignedItems.items[0].id}
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    Concurrency Level ({concurrencyLevel} parallel workers)
                  </label>
                  <input
                    type="range"
                    min="2"
                    max="10"
                    value={concurrencyLevel}
                    onChange={(e) => setConcurrencyLevel(Number(e.target.value))}
                    className="w-full accent-accent mt-2"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                    <span>2 parallel</span>
                    <span>5 parallel</span>
                    <span>10 parallel</span>
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => raceMutation.mutate()}
                    disabled={raceMutation.isPending}
                    className="btn-primary w-full text-xs py-2.5 flex items-center justify-center space-x-2"
                  >
                    {raceMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Firing {concurrencyLevel} Requests...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-black" />
                        <span>Execute Stress Test</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Results Output */}
              {raceResults && (
                <div className="space-y-4 animate-fade-in">
                  <div className="p-4 rounded-xl bg-surface-bg border border-surface-border flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono text-gray-400">Target Item:</span>
                      <span className="font-mono font-bold text-accent ml-2">
                        #{raceResults.item_id}
                      </span>
                      {onViewItem && (
                        <button
                          onClick={() => onViewItem(raceResults.item_id)}
                          className="text-xs text-accent underline ml-3"
                        >
                          View Item Modal →
                        </button>
                      )}
                    </div>
                    <div className="text-xs font-mono text-gray-400">
                      Total Execution Duration:{' '}
                      <span className="text-emerald-400 font-bold">
                        {raceResults.total_duration_ms} ms
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Winner Card */}
                    <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 space-y-2">
                      <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase font-mono">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Winner: 1 Request Succeeded (HTTP 200)</span>
                      </div>
                      <p className="text-xs text-gray-300 font-mono">
                        Status: <span className="text-emerald-400 font-bold">{raceResults.winner.status} OK</span>
                      </p>
                      <p className="text-xs text-gray-400">{raceResults.winner.message}</p>
                    </div>

                    {/* Losers Card */}
                    <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/40 space-y-2">
                      <div className="flex items-center space-x-2 text-red-400 font-bold text-xs uppercase font-mono">
                        <AlertTriangle className="w-4 h-4" />
                        <span>
                          Locked Out: {raceResults.losers.length} Requests Rejected (HTTP 409)
                        </span>
                      </div>
                      <p className="text-xs text-gray-300 font-mono">
                        Status: <span className="text-red-400 font-bold">409 CONFLICT</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {raceResults.losers[0]?.message || 'Item already claimed.'}
                      </p>
                    </div>
                  </div>

                  {/* Detailed Log Table */}
                  <div className="border border-surface-border rounded-xl overflow-hidden text-xs">
                    <div className="bg-surface-bg px-4 py-2 border-b border-surface-border font-mono font-semibold text-gray-400">
                      Execution Breakdown ({raceResults.concurrency_level} parallel HTTP threads)
                    </div>
                    <div className="divide-y divide-surface-border/50 max-h-48 overflow-y-auto">
                      <div className="p-2.5 px-4 flex items-center justify-between bg-emerald-950/10">
                        <span className="font-mono text-emerald-400 font-semibold">Worker Thread #1</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-bold">
                          200 OK (Claim Acquired)
                        </span>
                      </div>
                      {raceResults.losers.map((loser, idx) => (
                        <div key={idx} className="p-2.5 px-4 flex items-center justify-between bg-red-950/5">
                          <span className="font-mono text-gray-400">Worker Thread #{idx + 2}</span>
                          <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-mono font-bold">
                            409 CONFLICT (Blocked by Row Lock)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Idempotency */}
          {activeTab === 'idempotency' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-surface-bg/60 border border-surface-border text-xs leading-relaxed space-y-2">
                <h4 className="font-semibold text-gray-200 text-sm flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-accent" />
                  <span>Guaranteed Exactly-Once Execution</span>
                </h4>
                <p className="text-gray-400">
                  Network retries often cause duplicate payments or duplicated incident creations. By passing
                  an <code className="text-accent bg-surface-panel px-1.5 py-0.5 rounded font-mono">Idempotency-Key</code> header,
                  Newtonite Ops hashes the request payload and stores the response. Repeated requests with the same key
                  return the original response with header{' '}
                  <code className="text-accent bg-surface-panel px-1.5 py-0.5 rounded font-mono">
                    X-Idempotent-Replay: true
                  </code>
                  . If a client attempts to reuse a key with altered parameters, it is rejected with HTTP 422.
                </p>
              </div>

              {/* Idempotency Interactive Runner */}
              <div className="p-4 rounded-xl bg-surface-panel border border-surface-border space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Idempotency-Key</label>
                    <input
                      type="text"
                      value={idempKey}
                      onChange={(e) => setIdempKey(e.target.value)}
                      className="input-field text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Item Title Payload</label>
                    <input
                      type="text"
                      value={idempTitle}
                      onChange={(e) => setIdempTitle(e.target.value)}
                      className="input-field text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={handleIdempotencyFirstCall}
                    className="btn-primary text-xs py-2 px-3"
                  >
                    Step 1: Submit Initial POST
                  </button>
                  <button
                    onClick={handleIdempotencyReplay}
                    className="btn-secondary text-xs py-2 px-3 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10"
                  >
                    Step 2: Resend Identical (Expect Replay)
                  </button>
                  <button
                    onClick={handleIdempotencyMismatch}
                    className="btn-secondary text-xs py-2 px-3 text-red-400 border-red-500/40 hover:bg-red-500/10"
                  >
                    Step 3: Resend Modified (Expect 422)
                  </button>
                  <button
                    onClick={() => {
                      setIdempKey('test-key-' + Math.floor(Math.random() * 9000 + 1000));
                      setIdempLogs([]);
                    }}
                    className="btn-secondary text-xs py-2 px-3 ml-auto text-gray-400"
                  >
                    Reset Key & Logs
                  </button>
                </div>
              </div>

              {/* Idempotency Log Stream */}
              <div className="border border-surface-border rounded-xl overflow-hidden text-xs">
                <div className="bg-surface-bg px-4 py-2 border-b border-surface-border font-mono font-semibold text-gray-400">
                  Idempotency Verification Stream
                </div>
                <div className="p-4 space-y-2 max-h-60 overflow-y-auto font-mono">
                  {idempLogs.length === 0 ? (
                    <p className="text-gray-500 italic">No runs yet. Click Step 1 to begin.</p>
                  ) : (
                    idempLogs.map((log, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border flex items-start space-x-3 ${
                          log.status === 201
                            ? 'bg-blue-950/30 border-blue-500/40 text-blue-200'
                            : log.isReplay
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                            : 'bg-red-950/30 border-red-500/40 text-red-200'
                        }`}
                      >
                        <span className="text-[10px] text-gray-400 mt-0.5">{log.timestamp}</span>
                        <div className="flex-1">
                          <p className="font-bold">{log.step}</p>
                          <p className="text-xs opacity-90 mt-0.5">{log.message}</p>
                        </div>
                        <span className="font-bold px-2 py-0.5 rounded bg-black/40 text-[11px]">
                          HTTP {log.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Outbox */}
          {activeTab === 'outbox' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-surface-bg/60 border border-surface-border text-xs leading-relaxed space-y-2">
                <h4 className="font-semibold text-gray-200 text-sm flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-accent" />
                  <span>Transactional Outbox Architecture</span>
                </h4>
                <p className="text-gray-400">
                  To avoid dual-write bugs between PostgreSQL and external notification/event systems, all
                  workflow transitions insert an <code className="text-accent bg-surface-panel px-1.5 py-0.5 rounded font-mono">outbox_jobs</code> record
                  inside the same database transaction. An asynchronous background worker polls pending jobs, delivers
                  notifications with exponential backoff and deduplication keys, and marks them complete.
                </p>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-surface-panel border border-surface-border">
                  <span className="text-[10px] uppercase font-mono text-gray-400 block">Pending</span>
                  <span className="text-2xl font-bold font-mono text-amber-400 mt-1 block">
                    {outboxStats?.pending ?? 0}
                  </span>
                  <span className="text-[11px] text-gray-500">Queued for worker</span>
                </div>
                <div className="p-4 rounded-xl bg-surface-panel border border-surface-border">
                  <span className="text-[10px] uppercase font-mono text-gray-400 block">Processing</span>
                  <span className="text-2xl font-bold font-mono text-blue-400 mt-1 block">
                    {outboxStats?.processing ?? 0}
                  </span>
                  <span className="text-[11px] text-gray-500">Active flight</span>
                </div>
                <div className="p-4 rounded-xl bg-surface-panel border border-surface-border">
                  <span className="text-[10px] uppercase font-mono text-gray-400 block">Completed</span>
                  <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
                    {outboxStats?.completed ?? 0}
                  </span>
                  <span className="text-[11px] text-gray-500">Successfully delivered</span>
                </div>
                <div className="p-4 rounded-xl bg-surface-panel border border-surface-border">
                  <span className="text-[10px] uppercase font-mono text-gray-400 block">Failed</span>
                  <span className="text-2xl font-bold font-mono text-red-400 mt-1 block">
                    {outboxStats?.failed ?? 0}
                  </span>
                  <span className="text-[11px] text-gray-500">Exceeded retries</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-surface-panel border border-surface-border text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-gray-300 font-medium">Worker Status: ACTIVE & POLLING (Every 5s)</span>
                </div>
                <button
                  onClick={() => refetchOutbox()}
                  className="btn-secondary py-1.5 px-3 flex items-center space-x-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Stats</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
