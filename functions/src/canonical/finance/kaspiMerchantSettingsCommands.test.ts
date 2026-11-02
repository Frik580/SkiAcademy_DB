import { describe, expect, it, vi } from 'vitest';
import { KASPI_CONFIGURATION_PATH, type CommandEnvelope } from '@ski-academy/shared-domain';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import {
  kaspiFixtures,
  kaspiToggle,
  kaspiAdmin,
  kaspiAccount,
} from '../../../testSupport/kaspiPaymentFixtures';

const path = `kaspi-qr/${kaspiAdmin}/d197f0ca-6727-40b3-854a-c6e62f94fabc`;
function command(extra: object = {}, revision = 0): CommandEnvelope<'save_kaspi_configuration'> {
  return {
    kind: 'save_kaspi_configuration',
    intent: {
      merchantName: 'TEST RECIPIENT',
      walletRequestTtlSeconds: 3600,
      qrStoragePath: path,
      qrVerified: true,
      ...extra,
    },
    context: kaspiToggle(false, revision).context,
  };
}
function setup(initial = true, extra: Record<string, Record<string, unknown>> = {}) {
  const docs = { ...kaspiFixtures().docs, ...extra };
  if (!initial) delete docs[KASPI_CONFIGURATION_PATH];
  const executor = createInMemoryCanonicalTransactionExecutor(docs);
  const verify = vi.fn(
    async (asset: string) =>
      `https://firebasestorage.googleapis.com/v0/b/demo/o/${encodeURIComponent(asset)}?alt=media`
  );
  const commands = createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date('2026-01-01T10:00:00Z')) },
    executor,
    { verifyKaspiQrUpload: verify }
  );
  return {
    executor,
    verify,
    run: commands.execute,
    get: () => executor.snapshot().docs.get(KASPI_CONFIGURATION_PATH)?.data,
  };
}
describe('Kaspi merchant settings canonical command', () => {
  it('creates verified configuration OFF with a server key and idempotent audit', async () => {
    const h = setup(false);
    expect((await h.run(command())).status).toBe('success');
    expect(h.get()).toMatchObject({
      enabled: false,
      revision: 1,
      merchantName: 'TEST RECIPIENT',
      qrVerifiedBy: kaspiAdmin,
      qrVerifiedAt: { seconds: 1767261600, nanoseconds: 0 },
    });
    expect(h.get()?.merchantKey).toMatch(/^[0-9a-f-]{36}$/);
    expect((await h.run(command())).status).toBe('success');
    expect(
      [...h.executor.snapshot().docs.keys()].filter((key) =>
        key.startsWith(`${KASPI_CONFIGURATION_PATH}/actions/`)
      )
    ).toHaveLength(1);
    expect(
      [...h.executor.snapshot().docs.keys()].some((key) => key.startsWith('activity_logs/'))
    ).toBe(true);
    expect((await h.run(kaspiToggle(true, 1, 'enable_saved'))).status).toBe('success');
    expect(h.get()?.enabled).toBe(true);
  });
  it('updates name, QR and TTL while preserving current merchant and enabled flag', async () => {
    const h = setup();
    const originalKey = h.get()?.merchantKey;
    expect((await h.run(command({ walletRequestTtlSeconds: 7200 }))).status).toBe('success');
    expect(h.get()).toMatchObject({
      enabled: true,
      merchantKey: originalKey,
      merchantName: 'TEST RECIPIENT',
      walletRequestTtlSeconds: 7200,
      qrStoragePath: path,
    });
    const action = [...h.executor.snapshot().docs.entries()].find(([key]) =>
      key.startsWith(`${KASPI_CONFIGURATION_PATH}/actions/`)
    )![1].data;
    expect(action.previous).toMatchObject({
      merchantKey: originalKey,
      merchantName: 'EMULATOR ONLY',
    });
    expect(action.configuration).toMatchObject({ qrVerifiedBy: kaspiAdmin });
  });
  it('allows TTL/name edits without re-uploading an existing compatible QR', async () => {
    const h = setup();
    const input = command();
    delete (input.intent as { qrStoragePath?: string }).qrStoragePath;
    expect((await h.run(input)).status).toBe('success');
    expect(h.verify).not.toHaveBeenCalled();
  });
  it('repairs an incomplete document without a valid merchant key', async () => {
    const h = setup(true, { [KASPI_CONFIGURATION_PATH]: { enabled: false, merchantKey: '' } });
    expect((await h.run(command())).status).toBe('success');
    expect(h.get()?.merchantKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(h.get()?.enabled).toBe(false);
  });
  it('rejects stale revision without writes', async () => {
    const h = setup();
    expect((await h.run(command({}, 12))).status).toBe('error');
    expect(h.get()?.revision).toBeUndefined();
  });
  it('denies a non-admin account even with a forged administrator context', async () => {
    const h = setup();
    const input = command({ qrStoragePath: path.replace(kaspiAdmin, kaspiAccount) });
    const envelope = {
      ...input,
      context: {
        ...input.context,
        actor: { kind: 'account' as const, accountId: kaspiAccount as never },
      },
    };
    expect((await h.run(envelope)).status).toBe('error');
  });
  it('denies using another administrator upload', async () => {
    const h = setup();
    expect(
      (await h.run(command({ qrStoragePath: path.replace(kaspiAdmin, 'someone_else') }))).status
    ).toBe('error');
    expect(h.verify).not.toHaveBeenCalled();
  });
  it('fails closed on missing, invalid or unverified QR', async () => {
    const h = setup(false);
    h.verify.mockRejectedValue(new Error('Missing upload'));
    expect((await h.run(command())).status).toBe('error');
    expect(h.get()).toBeUndefined();
    expect((await h.run(command({ qrVerified: false }))).status).toBe('error');
  });
  it('requires OFF to rotate merchant identity', async () => {
    const h = setup();
    expect((await h.run(command({ replaceMerchant: true }))).status).toBe('error');
  });
  it('requires a newly uploaded object for explicit recipient replacement', async () => {
    const config = {
      ...kaspiFixtures().docs[KASPI_CONFIGURATION_PATH],
      enabled: false,
      qrStoragePath: path,
    };
    const h = setup(true, { [KASPI_CONFIGURATION_PATH]: config });
    expect((await h.run(command({ replaceMerchant: true }))).status).toBe('error');
    expect(h.get()?.merchantKey).toBe(config.merchantKey);
  });
  it.each(['awaiting_payment', 'payment_claimed', 'requires_clarification', 'refund_required'])(
    'blocks rotation with unresolved %s',
    async (status) => {
      const config = { ...kaspiFixtures().docs[KASPI_CONFIGURATION_PATH], enabled: false };
      const h = setup(true, {
        [KASPI_CONFIGURATION_PATH]: config,
        'payment_requests/unresolved': { status, merchantKey: 'demo-merchant' },
      });
      expect((await h.run(command({ replaceMerchant: true }))).status).toBe('error');
      expect(h.get()?.merchantKey).toBe(config.merchantKey);
    }
  );
  it('rotates a disabled merchant without rewriting settled historical requests', async () => {
    const config = { ...kaspiFixtures().docs[KASPI_CONFIGURATION_PATH], enabled: false };
    const historical = { status: 'confirmed', merchantKey: config.merchantKey };
    const h = setup(true, {
      [KASPI_CONFIGURATION_PATH]: config,
      'payment_requests/history': historical,
    });
    expect((await h.run(command({ replaceMerchant: true }))).status).toBe('success');
    expect(h.get()?.merchantKey).not.toBe(config.merchantKey);
    expect(h.get()?.enabled).toBe(false);
    expect(h.executor.snapshot().docs.get('payment_requests/history')?.data).toEqual(historical);
  });
});
