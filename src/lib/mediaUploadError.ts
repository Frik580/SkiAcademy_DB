import { translations, type Language } from './i18n/translations';

type QuotaReason = 'uploads' | 'bytes' | 'busy' | 'requests';

export class MediaUploadLimitError extends Error {
  constructor(
    readonly reason: QuotaReason,
    readonly retryAt?: number
  ) {
    super('Media upload limit reached');
  }
}

export async function readMediaUploadLimit(response: Response): Promise<MediaUploadLimitError> {
  const body = (await response.json().catch(() => undefined)) as
    { quota?: { reason?: unknown; retryAt?: unknown } } | undefined;
  const reason = body?.quota?.reason;
  if (reason === 'busy') return new MediaUploadLimitError(reason);
  if (reason !== 'uploads' && reason !== 'bytes') return new MediaUploadLimitError('requests');
  const retryAt = body?.quota?.retryAt;
  return new MediaUploadLimitError(
    reason,
    typeof retryAt === 'number' && Number.isSafeInteger(retryAt) && retryAt <= 8.64e15
      ? retryAt
      : undefined
  );
}

export function formatMediaUploadLimit(error: unknown, language: Language): string | undefined {
  if (!(error instanceof MediaUploadLimitError)) return;
  const text = translations[language];
  const message = {
    busy: text.mediaUploadBusy,
    uploads: text.mediaUploadCountLimit,
    bytes: text.mediaUploadBytesLimit,
    requests: text.mediaUploadRequestLimit,
  }[error.reason];
  if (!error.retryAt || error.retryAt <= Date.now()) return message;
  const time = new Intl.DateTimeFormat(language, { timeStyle: 'medium' }).format(error.retryAt);
  return `${message} ${text.mediaUploadRetryAt.replace('{time}', time)}`;
}
