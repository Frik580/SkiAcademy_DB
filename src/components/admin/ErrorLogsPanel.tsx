import React, { useState, useMemo, useEffect } from 'react';
import { Trash2, Search } from 'lucide-react';
import { ErrorLog } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';
import { useNotifications } from '../PushNotificationHub';
import { TableSkeleton } from '../ui/Skeleton';
import { ActionButton } from '../ui/ActionButton';
import { StateCard } from '../ui/StateCard';
import { logger } from '../../lib/logger';
import { QUERY_LIMITS } from '../../lib/queryLimits';
import {
  deleteErrorLog,
  deleteErrorLogs,
  subscribeErrorLogs,
} from '../../features/admin/adminService';

interface ErrorLogsPanelProps {
  onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

export const ErrorLogsPanel: React.FC<ErrorLogsPanelProps> = ({ onRequestConfirm }) => {
  const { t } = useLanguage();
  const { addNotification } = useNotifications();

  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [errorLogsLoading, setErrorLogsLoading] = useState(true);
  const [logSearch, setLogSearch] = useState('');
  const [logSourceFilter, setLogSourceFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null);
  const [pageSize, setPageSize] = useState<number>(QUERY_LIMITS.errorLogs);
  const [hasMoreLogs, setHasMoreLogs] = useState(false);

  useEffect(() => {
    setErrorLogsLoading(true);
    const unsub = subscribeErrorLogs(
      (logs, hasMore) => {
        setErrorLogs(logs);
        setHasMoreLogs(hasMore);
        setErrorLogsLoading(false);
      },
      (error) => {
        logger.error('Error fetching logs:', error);
        setErrorLogsLoading(false);
      },
      pageSize
    );

    return () => unsub();
  }, [pageSize]);

  const handleDeleteLog = async (logId: string) => {
    try {
      await deleteErrorLog(logId);
      addNotification('success', t('logDeleted'), t('logDeletedDesc'));
    } catch (error) {
      logger.error('Failed to delete error log:', error);
    }
  };

  const handleClearAllLogs = () => {
    const confirmMsg = t('clearLogsConfirm');
    onRequestConfirm(confirmMsg, async () => {
      try {
        await deleteErrorLogs(errorLogs.map((log) => log.id));
        addNotification('success', t('logsCleared'), t('logsClearedDesc'));
      } catch (error) {
        logger.error('Failed to clear error logs:', error);
      }
    });
  };

  const filteredLogs = useMemo(() => {
    return errorLogs.filter((log) => {
      if (logSourceFilter !== 'all' && log.source !== logSourceFilter) {
        return false;
      }
      if (!logSearch) return true;
      const search = logSearch.toLowerCase();
      return (
        (log.message || '').toLowerCase().includes(search) ||
        (log.stack || '').toLowerCase().includes(search) ||
        (log.userEmail || '').toLowerCase().includes(search) ||
        (log.url || '').toLowerCase().includes(search)
      );
    });
  }, [errorLogs, logSearch, logSourceFilter]);

  return (
    <div className="space-y-4 transition-colors duration-300 w-full min-w-0 overflow-hidden">
      {errorLogs.length > 0 && (
        <div className="flex items-center justify-end border-b border-[var(--border)] pb-3">
          <ActionButton onClick={handleClearAllLogs} variant="danger" size="sm">
            <Trash2 className="w-3.5 h-3.5" />
            {t('clearAllLogs')}
          </ActionButton>
        </div>
      )}

      {hasMoreLogs && (
        <div className="flex justify-end">
          <ActionButton
            onClick={() => setPageSize((current) => current + QUERY_LIMITS.errorLogs)}
            size="sm"
          >
            Load more logs
          </ActionButton>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--ink-dim)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            placeholder={t('searchLogsPlaceholder')}
            className="w-full pl-9 pr-3 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none placeholder-[var(--ink-dim)] font-mono"
          />
        </div>

        <div>
          <select
            value={logSourceFilter}
            onChange={(e) => setLogSourceFilter(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
          >
            <option value="all">{t('allSources')}</option>
            <option value="firestore">Firestore</option>
            <option value="global_error">{t('globalWindowError')}</option>
            <option value="unhandled_rejection">{t('unhandledRejection')}</option>
            <option value="custom">Custom Logs</option>
          </select>
        </div>

        <div className="flex items-center text-xs text-[var(--ink-dim)] font-mono justify-end">
          {`${t('logsShowingPrefix')} ${filteredLogs.length} ${t('logsShowingOf')} ${errorLogs.length} ${t('logsShowingSuffix')}`}
        </div>
      </div>

      {errorLogsLoading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : filteredLogs.length === 0 ? (
        <StateCard title={t('noErrorLogsMatch')} />
      ) : (
        <div className="border border-[var(--border)] divide-y divide-[var(--border)] max-h-[500px] overflow-y-auto w-full">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className={`p-4 transition hover:bg-black/5 dark:hover:bg-white/5 flex flex-col gap-2 cursor-pointer w-full text-left font-mono text-[11px] ${selectedLog?.id === log.id ? 'bg-black/10 dark:bg-white/10 border-l-2 border-rose-500' : ''}`}
              onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider rounded-none shrink-0 ${
                      log.source === 'firestore'
                        ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-250/45 dark:border-amber-900/60'
                        : log.source === 'global_error'
                          ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-250/45 dark:border-rose-900/60'
                          : 'bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-250/45 dark:border-purple-900/60'
                    }`}
                  >
                    {log.source}
                  </span>
                  <span className="text-[var(--ink-dim)] text-[9px] shrink-0">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteLog(log.id);
                  }}
                  className="text-[var(--ink-dim)] hover:text-rose-500 p-1 transition cursor-pointer"
                  title={t('deleteLog')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="font-semibold text-rose-600 dark:text-rose-400 break-words line-clamp-2 leading-relaxed">
                {log.message}
              </div>

              <div className="text-[10px] text-[var(--ink-dim)] flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-[var(--border)] border-dashed">
                <div>
                  <span className="font-bold">{t('userLabelColon')}</span>{' '}
                  {log.userEmail || 'anonymous'}
                </div>
                <div className="truncate max-w-xs md:max-w-md lg:max-w-xl">
                  <span className="font-bold">URL:</span> {log.url}
                </div>
                {log.operation && (
                  <div>
                    <span className="font-bold">{t('opLabelColon')}</span> {log.operation}
                  </div>
                )}
                {log.path && (
                  <div className="truncate max-w-xs">
                    <span className="font-bold">{t('pathLabelColon')}</span> {log.path}
                  </div>
                )}
              </div>

              {selectedLog?.id === log.id && (
                <div className="mt-3 p-3 bg-black/10 dark:bg-white/5 border border-[var(--border)] rounded-none space-y-3 animate-fade-in text-[10px] overflow-x-auto select-text">
                  {log.stack && (
                    <div className="space-y-1">
                      <span className="font-bold text-[var(--ink)] uppercase tracking-wider text-[9px] block">
                        {t('stackTraceLabel')}
                      </span>
                      <pre className="whitespace-pre font-mono leading-relaxed text-rose-500/90 dark:text-rose-450 text-[9px] overflow-x-auto max-h-[200px] overflow-y-auto">
                        {log.stack}
                      </pre>
                    </div>
                  )}
                  <div className="space-y-1">
                    <span className="font-bold text-[var(--ink)] uppercase tracking-wider text-[9px] block">
                      {t('clientEnvDetails')}
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 font-mono text-[9px] leading-relaxed text-[var(--ink-dim)]">
                      <div>
                        <span className="font-bold text-[var(--ink)]">User Agent:</span>{' '}
                        {log.userAgent}
                      </div>
                      <div>
                        <span className="font-bold text-[var(--ink)]">Full URL:</span> {log.url}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
