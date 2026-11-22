/**
 * Chat attachments are stored as plain Firestore fields, which any chat writer
 * can set. Only absolute http(s) links may become a clickable anchor: a
 * `javascript:`, `data:` or `blob:` value would otherwise be "active content
 * that the browser opens" for every other participant of the thread.
 *
 * This mirrors `safeLink` in InstructorHomeworkSection and `safeHomeworkLink`
 * in StudentHomeworkDashboardSection.
 */
export function safeChatLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
