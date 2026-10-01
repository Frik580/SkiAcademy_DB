import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTBOX_RECOVERY_INTERVAL_MINUTES } from '@ski-academy/shared-domain';

describe('outbox delivery function wiring', () => {
  const index = readFileSync(resolve(__dirname, '../../index.ts'), 'utf8');

  it('delivers new outbox documents from a create trigger and keeps recovery on the existing scheduler', () => {
    expect(index).toContain('export const deliverDomainOutboxOnCreate = onDocumentCreated(');
    expect(index).toContain("document: 'domain_outbox/{outboxId}'");
    expect(index).toContain('deliverCreatedDomainOutbox');
    expect(index).not.toContain("onDocumentWritten(\n  {\n    document: 'domain_outbox/{outboxId}'");
    const recovery = index.slice(index.indexOf('export const scheduledDeliverDomainOutbox'));
    expect(OUTBOX_RECOVERY_INTERVAL_MINUTES).toBe(30);
    expect(recovery).toContain('every ${OUTBOX_RECOVERY_INTERVAL_MINUTES} minutes');
    expect(recovery.slice(0, 500)).not.toContain('every 5 minutes');
    expect(index).toContain('purgeTerminalDomainOutbox');
  });
});
