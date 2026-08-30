import type { TranslationKey } from '../../lib/i18n/translations';
import { ADMIN_ISSUE_SEVERITIES, type AdminIssueSeverity } from '@ski-academy/shared-domain';

export const ADMIN_TAB_IDS = ['operations', 'finance', 'people', 'product', 'system'] as const;

export type AdminTabId = (typeof ADMIN_TAB_IDS)[number];

export const DEFAULT_ADMIN_TAB: AdminTabId = 'operations';

export const ADMIN_TAB_QUERY_KEY = 'tab';
export const ADMIN_ISSUE_QUERY_KEY = 'issue';
export const ADMIN_ISSUE_VIEW_QUERY_KEY = 'issueView';
export const ADMIN_ISSUE_SEVERITY_QUERY_KEY = 'issueSeverity';

export const ADMIN_TAB_LABEL_KEYS: Record<AdminTabId, TranslationKey> = {
  operations: 'adminTabOperations',
  finance: 'adminTabFinance',
  people: 'adminTabPeople',
  product: 'adminTabProduct',
  system: 'adminTabSystem',
};

export function isAdminTabId(value: string | null | undefined): value is AdminTabId {
  return value != null && (ADMIN_TAB_IDS as readonly string[]).includes(value);
}

export function parseAdminTabId(value: string | null | undefined): AdminTabId {
  return isAdminTabId(value) ? value : DEFAULT_ADMIN_TAB;
}

export function parseAdminIssueView(value: string | null | undefined): 'open' | 'history' {
  return value === 'history' ? 'history' : 'open';
}

export function parseAdminIssueSeverity(
  value: string | null | undefined
): AdminIssueSeverity | undefined {
  return value != null && (ADMIN_ISSUE_SEVERITIES as readonly string[]).includes(value)
    ? (value as AdminIssueSeverity)
    : undefined;
}
