import axios, { AxiosError } from 'axios';
import {
  ActivityEvent,
  ConflictResponse,
  FilterParams,
  NotificationItem,
  OutboxStats,
  SummaryCounts,
  Team,
  User,
  WorkItemDetail,
  WorkItemListResponse,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: async (email: string, password: string): Promise<{ access_token: string }> => {
    const res = await api.post('/api/auth/login', { email, password });
    return res.data;
  },
  getMe: async (): Promise<User> => {
    const res = await api.get('/api/auth/me');
    return res.data;
  },
};

export const teamsApi = {
  list: async (): Promise<Team[]> => {
    const res = await api.get('/api/teams');
    return res.data;
  },
};

export const itemsApi = {
  getSummary: async (): Promise<SummaryCounts> => {
    const res = await api.get('/api/items/summary');
    return res.data;
  },
  list: async (params: FilterParams): Promise<WorkItemListResponse> => {
    const query = new URLSearchParams();
    if (params.team_id) query.append('team_id', String(params.team_id));
    if (params.status) query.append('status', params.status);
    if (params.priority) query.append('priority', params.priority);
    if (params.item_type) query.append('item_type', params.item_type);
    if (params.assignee_id) query.append('assignee_id', String(params.assignee_id));
    if (params.attention_filter) query.append('attention_filter', params.attention_filter);
    if (params.q) query.append('q', params.q);
    query.append('page', String(params.page));
    query.append('limit', String(params.limit));

    const res = await api.get(`/api/items?${query.toString()}`);
    return res.data;
  },
  get: async (id: number): Promise<WorkItemDetail> => {
    const res = await api.get(`/api/items/${id}`);
    return res.data;
  },
  create: async (
    data: {
      title: string;
      description?: string;
      item_type: string;
      priority: string;
      team_id: number;
      due_date?: string | null;
    },
    idempotencyKey?: string
  ): Promise<{ data: WorkItemDetail; isReplay: boolean }> => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    const res = await api.post('/api/items', data, { headers });
    const isReplay = res.headers['x-idempotent-replay'] === 'true';
    return { data: res.data, isReplay };
  },
  update: async (
    id: number,
    data: {
      version: number;
      title?: string;
      description?: string;
      priority?: string;
      item_type?: string;
    }
  ): Promise<WorkItemDetail> => {
    const res = await api.put(`/api/items/${id}`, data);
    return res.data;
  },
  claim: async (id: number): Promise<WorkItemDetail> => {
    const res = await api.post(`/api/items/${id}/claim`);
    return res.data;
  },
  transition: async (
    id: number,
    target_status: string,
    comment?: string
  ): Promise<WorkItemDetail> => {
    const res = await api.post(`/api/items/${id}/transition`, { target_status, comment });
    return res.data;
  },
  getActivity: async (id: number): Promise<ActivityEvent[]> => {
    const res = await api.get(`/api/items/${id}/activity`);
    return res.data;
  },
  addComment: async (id: number, comment: string): Promise<ActivityEvent> => {
    const res = await api.post(`/api/items/${id}/comments`, { comment });
    return res.data;
  },
  simulateRace: async (
    itemId: number,
    concurrentRequests: number
  ): Promise<{
    item_id: number;
    concurrency_level: number;
    winner: { status: number; message: string; assignee_id?: number };
    losers: Array<{ status: number; message: string; error_detail?: string }>;
    total_duration_ms: number;
  }> => {
    const res = await api.post('/api/items/simulate/race-condition', {
      item_id: itemId,
      concurrent_requests: concurrentRequests,
    });
    return res.data;
  },
};

export const notificationsApi = {
  list: async (): Promise<NotificationItem[]> => {
    const res = await api.get('/api/notifications');
    return res.data;
  },
  markRead: async (id: number): Promise<{ ok: boolean }> => {
    const res = await api.post(`/api/notifications/${id}/read`);
    return res.data;
  },
  getOutboxStats: async (): Promise<OutboxStats> => {
    const res = await api.get('/api/outbox/stats');
    return res.data;
  },
};
