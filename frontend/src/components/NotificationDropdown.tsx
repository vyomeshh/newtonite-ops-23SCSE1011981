import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Clock, ExternalLink } from 'lucide-react';
import { notificationsApi } from '../api/client';
import { NotificationItem } from '../types';

interface NotificationDropdownProps {
  onSelectItem?: (itemId: number) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ onSelectItem }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    refetchInterval: 5000,
  });

  const markReadMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.is_read) {
      markReadMutation.mutate(item.id);
    }
    if (onSelectItem) {
      onSelectItem(item.work_item_id);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg bg-surface-panel hover:bg-surface-hover border border-surface-border text-gray-300 transition-colors"
        title="Notifications (from background outbox worker)"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-accent text-[10px] font-bold text-black items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface-panel border border-surface-border rounded-xl shadow-2xl z-50 overflow-hidden animate-slide-up">
          <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between bg-surface-bg/50">
            <div className="flex items-center space-x-2">
              <Bell className="w-4 h-4 text-accent" />
              <span className="font-semibold text-sm text-gray-200">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-xs bg-accent/20 text-accent font-mono px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <span className="text-[11px] text-gray-400 font-mono">Outbox worker live</span>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-surface-border/50">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-sm">
                No notifications yet. Transitions & outbox events will appear here!
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3 transition-colors cursor-pointer hover:bg-surface-hover flex items-start space-x-3 ${
                    !n.is_read ? 'bg-accent/5' : 'opacity-70'
                  }`}
                >
                  <div className="mt-1 flex-shrink-0">
                    {!n.is_read ? (
                      <span className="w-2 h-2 rounded-full bg-accent block" />
                    ) : (
                      <Check className="w-3.5 h-3.5 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium text-gray-200 truncate ${!n.is_read ? 'font-semibold' : ''}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                    <div className="flex items-center space-x-2 mt-1.5 text-[10px] text-gray-500">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(n.created_at).toLocaleTimeString()}</span>
                      <span>•</span>
                      <span className="text-accent hover:underline flex items-center space-x-0.5">
                        <span>Item #{n.work_item_id}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
