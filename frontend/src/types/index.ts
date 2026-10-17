export type TeamRole = 'VIEWER' | 'MEMBER' | 'LEAD' | 'ADMIN';

export type ItemType = 'INCIDENT' | 'CUSTOMER_ISSUE' | 'PAYMENT' | 'COMPLIANCE' | 'TASK';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type Status = 'OPEN' | 'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'RESOLVED' | 'CLOSED';

export type EventType =
  | 'ITEM_CREATED'
  | 'ITEM_CLAIMED'
  | 'ITEM_ASSIGNED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'DETAILS_UPDATED'
  | 'COMMENT_ADDED'
  | 'APPROVAL_GRANTED'
  | 'APPROVAL_REJECTED';

export type OutboxEventType = 'NOTIFY_ASSIGNEE' | 'NOTIFY_LEAD_APPROVAL' | 'AUDIT_ENRICHMENT';

export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Membership {
  id: number;
  user_id: number;
  team_id: number;
  role: TeamRole;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  memberships: Membership[];
}

export interface Team {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
}

export interface WorkItemBrief {
  id: number;
  title: string;
  item_type: ItemType;
  priority: Priority;
  status: Status;
  team_id: number;
  team_name: string | null;
  assignee_id: number | null;
  assignee_name: string | null;
  created_by_name: string | null;
  due_date: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkItemDetail extends WorkItemBrief {
  description: string | null;
  created_by_id: number;
  approved_by_id: number | null;
  approved_by_name: string | null;
}

export interface WorkItemListResponse {
  items: WorkItemBrief[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ActivityEvent {
  id: number;
  work_item_id: number;
  actor_id: number;
  actor_name: string | null;
  event_type: EventType;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  comment_text: string | null;
  created_at: string;
}

export interface SummaryCounts {
  assigned_to_me: number;
  unassigned_urgent: number;
  awaiting_my_approval: number;
  overdue: number;
}

export interface OutboxStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  work_item_id: number;
  dedupe_key: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface ConflictResponse {
  error: string;
  detail: string;
  current_item: WorkItemDetail;
  your_version: number;
  current_version: number;
}

export interface FilterParams {
  team_id?: number | '';
  status?: string;
  priority?: string;
  item_type?: string;
  assignee_id?: number;
  attention_filter?: string;
  q?: string;
  page: number;
  limit: number;
}
