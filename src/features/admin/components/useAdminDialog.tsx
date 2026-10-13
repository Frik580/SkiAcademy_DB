import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { translations } from '../../../lib/i18n/translations';
import { AdminModal } from './AdminModal';

interface DialogRequest {
  id: number;
  kind: 'confirm' | 'alert';
  message: string;
  resolve: (accepted: boolean) => void;
}

/** Feature-level native-dialog adapter. No commands run before explicit acceptance. */
export function useAdminDialog() {
  const { language } = useLanguage();
  const localized = translations[language];
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const active = useRef<DialogRequest | null>(null);
  const queue = useRef<DialogRequest[]>([]);
  const sequence = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    const pendingQueue = queue.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.resolve(false);
      active.current = null;
      pendingQueue.splice(0).forEach((queued) => queued.resolve(false));
    };
  }, []);

  const ask = useCallback(
    (kind: DialogRequest['kind'], message: string) =>
      new Promise<boolean>((resolve) => {
        if (!mounted.current) {
          resolve(false);
          return;
        }
        const next = { id: ++sequence.current, kind, message, resolve };
        if (active.current) queue.current.push(next);
        else {
          active.current = next;
          setRequest(next);
        }
      }),
    []
  );
  const finish = useCallback((accepted: boolean) => {
    const current = active.current;
    if (!current) return;
    active.current = queue.current.shift() ?? null;
    setRequest(active.current);
    current.resolve(accepted);
  }, []);
  const confirm = useCallback((message: string) => ask('confirm', message), [ask]);
  const alert = useCallback(
    async (message: string) => {
      await ask('alert', message);
    },
    [ask]
  );

  return {
    confirm,
    alert,
    dialog: request ? (
      <AdminModal
        key={request.id}
        title={
          request.kind === 'confirm'
            ? localized.confirmAction
            : language === 'ru'
              ? 'Сообщение'
              : 'Notice'
        }
        closeLabel={localized.cancel}
        onClose={() => finish(false)}
        width="sm"
        footer={
          <>
            {request.kind === 'confirm' && (
              <button
                type="button"
                className="btn-secondary flex-1 px-4 py-3 type-button"
                onClick={() => finish(false)}
              >
                {localized.cancel}
              </button>
            )}
            <button
              type="button"
              className="btn-primary flex-1 px-4 py-3"
              onClick={() => finish(true)}
            >
              {request.kind === 'confirm' ? localized.confirm : 'OK'}
            </button>
          </>
        }
      >
        <p className="type-caption text-[var(--ink-dim)]">{request.message}</p>
      </AdminModal>
    ) : null,
  };
}
