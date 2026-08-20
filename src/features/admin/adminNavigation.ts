import type { TranslationKey } from '../../lib/i18n/translations';

export const ADMIN_TAB_IDS = ['operations', 'finance', 'people', 'product', 'system'] as const;

export type AdminTabId = (typeof ADMIN_TAB_IDS)[number];

export const DEFAULT_ADMIN_TAB: AdminTabId = 'operations';

export const ADMIN_TAB_QUERY_KEY = 'tab';

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
