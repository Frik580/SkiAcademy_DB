import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, Bell, CheckCircle, AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../../app/providers/LanguageContext';
import { resolveNotificationText, type DbNotification } from '../../domain/notifications';
import { useNotificationsStore } from './notificationsStore';
import { Booking, Review, UserProfile } from '../../types';
import { ActionButton } from '../../ui/ActionButton';
import { BodyScrollLock } from '../../ui/BodyScrollLock';
import { StateCard } from '../../ui/StateCard';

export interface Notification {
  id: string;
  type: 'success' | 'warning' | 'info' | 'error';
  title: string;
  message: string;
  timestamp: Date;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (type: Notification['type'], title: string, message: string) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback(
    (type: Notification['type'], title: string, message: string) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newNotif: Notification = {
        id,
        type,
        title,
        message,
        timestamp: new Date(),
      };

      setNotifications((prev) => [newNotif, ...prev].slice(0, 10)); // keep last 10 notifications

      // Auto remove after 6 seconds
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, 6000);
    },
    []
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{ notifications, addNotification, removeNotification, clearAll }}
    >
      {children}
      {/* Toast Notification Area */}
      <div className="fixed bottom-4 sm:bottom-6 left-4 sm:left-auto right-4 sm:right-6 z-50 flex flex-col gap-3 max-w-[calc(100vw-2rem)] sm:max-w-sm w-auto sm:w-full">
        {notifications.slice(0, 4).map((n) => (
          <div
            key={n.id}
            id={`toast-${n.id}`}
            className="flex items-start gap-3 p-4 border bg-[var(--bg)] shadow-xl transition-all duration-300 animate-slide-in rounded-none hover:scale-[1.01]"
            style={{
              borderColor:
                n.type === 'success'
                  ? '#10b981'
                  : n.type === 'warning'
                    ? '#f59e0b'
                    : n.type === 'error'
                      ? '#ef4444'
                      : '#3b82f6',
            }}
          >
            <div className="shrink-0 mt-0.5">
              {n.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
              {n.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
              {n.type === 'error' && <ShieldAlert className="w-5 h-5 text-red-500" />}
              {n.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-serif text-sm font-medium text-[var(--ink)] leading-tight">
                {n.title}
              </h4>
              <p className="text-xs text-[var(--ink-dim)] mt-1 leading-relaxed whitespace-pre-wrap">
                {n.message}
              </p>
            </div>

            <button
              id={`close-toast-${n.id}`}
              onClick={() => removeNotification(n.id)}
              className="shrink-0 p-1 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition rounded-none cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export interface NotificationHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookings?: Booking[];
  reviews?: Review[];
  userProfile?: UserProfile | null;
  dismissedReviewIds?: string[];
  onDismissReview?: (bookingId: string) => void;
  dbNotifications?: DbNotification[];
  onClearNotifications?: () => Promise<void>;
  onDeleteNotification?: (id: string) => Promise<void>;
}

export const NotificationHubModal: React.FC<NotificationHubModalProps> = ({
  isOpen,
  onClose,
  bookings = [],
  reviews = [],
  userProfile = null,
  dismissedReviewIds = [],
  onDismissReview,
  dbNotifications = [],
  onClearNotifications,
  onDeleteNotification,
}) => {
  const {
    notifications: localNotifications,
    clearAll: localClearAll,
    removeNotification: removeLocalNotification,
  } = useNotifications();
  const { t, language } = useLanguage();
  const notificationsHasMore = useNotificationsStore((state) => state.notificationsHasMore);
  const loadMoreNotifications = useNotificationsStore((state) => state.loadMoreNotifications);

  if (!isOpen) return null;

  const uid = userProfile?.uid;
  const userBookings = uid ? bookings.filter((b) => b.userId === uid && !b.isDeleted) : [];
  const unreviewedCompletedBookings = userBookings.filter((b) => {
    if (b.status !== 'completed') return false;
    if (dismissedReviewIds.includes(b.id)) return false;
    const alreadyReviewed = reviews.some(
      (r) =>
        r.bookingId === b.id ||
        (uid && r.userId === uid && r.instructorId === b.instructorId && r.date === b.date)
    );
    return !alreadyReviewed;
  });

  const notificationsToShow =
    dbNotifications && dbNotifications.length > 0
      ? dbNotifications.map((n) => {
          const { title, message } = resolveNotificationText(n, language);
          return {
            id: n.id,
            type: n.type || 'info',
            title,
            message,
            timestamp: new Date(n.timestamp),
            isRead: n.isRead ?? false,
          };
        })
      : localNotifications.map((n) => ({
          ...n,
          isRead: true,
        }));

  const unreadDbCount = notificationsToShow.filter((notification) => !notification.isRead).length;
  const totalUnreadCount = unreadDbCount + unreviewedCompletedBookings.length;

  const handleClearAll = async () => {
    if (onClearNotifications) {
      await onClearNotifications();
    } else {
      localClearAll();
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (onDeleteNotification) {
      await onDeleteNotification(id);
    } else {
      removeLocalNotification(id);
    }
  };

  const handleTriggerReview = (bookingId: string) => {
    onClose();
    setTimeout(() => {
      const btn = document.getElementById(`notify-review-btn-${bookingId}`);
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          btn.click();
        }, 150);
      }
    }, 100);
  };

  return (
    <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <BodyScrollLock />
      <div className="ui-modal shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden animate-scale-up rounded-2xl bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)]">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-black/10">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Bell className="w-4 h-4 text-[var(--ink-dim)]" />
              {totalUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full ring-1 ring-[var(--bg)]" />
              )}
            </div>
            <h3 className="font-serif text-sm font-light text-[var(--ink)]">
              {t('notificationHistory')}
            </h3>
            {totalUnreadCount > 0 && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-rose-500 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded-none">
                {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer rounded-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* Review Invitations Section */}
          {unreviewedCompletedBookings.length > 0 && (
            <div className="space-y-2 pb-3 border-b border-[var(--border)]">
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink)] block mb-2">
                🌟 {t('rateCompletedLessons')}
              </h4>
              <div className="space-y-2">
                {unreviewedCompletedBookings.map((b) => (
                  <div
                    key={b.id}
                    className="p-3 border border-[var(--border)] bg-black/10 flex items-center justify-between gap-3 rounded-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={b.instructorAvatar}
                        alt={b.instructorName}
                        className="w-8 h-8 rounded-none object-cover shrink-0 border border-[var(--border)]"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--ink)] leading-tight truncate">
                          {b.instructorName}
                        </p>
                        <span className="text-[10px] text-[var(--ink-dim)] block font-mono">
                          {b.date} • {b.time}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ActionButton
                        onClick={() => handleTriggerReview(b.id)}
                        size="sm"
                        className="shrink-0"
                      >
                        {t('reviewAction')}
                      </ActionButton>
                      {onDismissReview && (
                        <button
                          onClick={() => onDismissReview(b.id)}
                          className="p-1 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer rounded-none"
                          title={t('hide')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Standard Notifications Section */}
          <div className="space-y-3">
            {unreviewedCompletedBookings.length > 0 && notificationsToShow.length > 0 && (
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mb-2">
                {t('systemHistory')}
              </h4>
            )}

            {notificationsToShow.length === 0 && unreviewedCompletedBookings.length === 0 ? (
              <StateCard title={t('noActiveNotifications')} />
            ) : (
              notificationsToShow.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 border flex gap-3 animate-fade-in rounded-none ${
                    n.isRead
                      ? 'border-[var(--border)] bg-black/10'
                      : 'border-[var(--accent)]/40 bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/20'
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {n.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                    {n.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    {n.type === 'error' && <ShieldAlert className="w-4 h-4 text-red-500" />}
                    {n.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-semibold text-[var(--ink)]">{n.title}</h4>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!n.isRead && (
                          <span className="shrink-0 text-[9px] font-mono uppercase tracking-wider text-[var(--accent)]">
                            {t('newBadge')}
                          </span>
                        )}
                        <button
                          onClick={() => handleDeleteItem(n.id)}
                          className="p-1 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer rounded-none"
                          title={t('hide')}
                          id={`delete-notif-${n.id}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--ink-dim)] mt-0.5 whitespace-pre-wrap">
                      {n.message}
                    </p>
                    <span className="text-[10px] text-[var(--ink-dim)] block mt-2 font-mono">
                      {n.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          {notificationsHasMore && (
            <div className="flex justify-center pt-3">
              <ActionButton onClick={loadMoreNotifications} size="sm">
                Load more notifications
              </ActionButton>
            </div>
          )}
        </div>

        {notificationsToShow.length > 0 && (
          <div className="p-4 border-t border-[var(--border)] flex justify-end bg-black/15">
            <ActionButton onClick={handleClearAll} variant="danger" size="sm">
              {t('clearHistory')}
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
};
