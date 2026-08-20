import { describe, expect, it } from 'vitest';
import {
  ADMIN_TAB_IDS,
  DEFAULT_ADMIN_TAB,
  isAdminTabId,
  parseAdminTabId,
} from '../../src/features/admin/adminNavigation';

describe('adminNavigation', () => {
  it('exposes five top-level tabs with operations as default', () => {
    expect(ADMIN_TAB_IDS).toEqual(['operations', 'finance', 'people', 'product', 'system']);
    expect(DEFAULT_ADMIN_TAB).toBe('operations');
  });

  it('parses known tab ids and falls back for unknown values', () => {
    expect(isAdminTabId('finance')).toBe(true);
    expect(isAdminTabId('nope')).toBe(false);
    expect(parseAdminTabId('people')).toBe('people');
    expect(parseAdminTabId(null)).toBe('operations');
    expect(parseAdminTabId('unknown')).toBe('operations');
  });
});
