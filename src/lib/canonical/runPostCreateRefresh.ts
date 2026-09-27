import { logger } from '../../shared';

export type PostCreateRefreshResult = {
  readonly refreshFailed?: boolean;
};

/**
 * Runs a best-effort read-model/store sync after a canonical mutation already succeeded.
 * Mutation success is never downgraded to failure when this refresh throws.
 */
export async function runPostCreateRefresh(
  refresh: () => Promise<void>,
  logEvent: string
): Promise<PostCreateRefreshResult> {
  try {
    await refresh();
    return {};
  } catch (error) {
    logger.warn(logEvent, error);
    return { refreshFailed: true };
  }
}
