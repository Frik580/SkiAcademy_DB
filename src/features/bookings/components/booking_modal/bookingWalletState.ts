import type { CanonicalWalletSnapshot } from '../../../wallet/walletStore';

export function resolveBookingWalletState(
  wallet: CanonicalWalletSnapshot,
  accountId: string | undefined,
  authenticatedAccountId: string | undefined,
  totalCost: number
) {
  const sameAccount =
    Boolean(accountId) &&
    accountId === authenticatedAccountId &&
    wallet.canonicalWalletAccountId === accountId;
  const loaded = sameAccount && wallet.canonicalWalletLoaded;
  const balance =
    loaded &&
    wallet.canonicalWalletExists &&
    wallet.canonicalWalletTrusted &&
    wallet.canonicalBalanceKzt !== null &&
    Number.isSafeInteger(wallet.canonicalBalanceKzt) &&
    wallet.canonicalBalanceKzt >= 0
      ? wallet.canonicalBalanceKzt
      : null;
  const validCost = Number.isSafeInteger(totalCost) && totalCost >= 0;
  return {
    balance,
    status: !loaded ? 'loading' : balance === null ? 'unavailable' : 'ready',
    insufficient: balance !== null && validCost && balance < totalCost,
    canPay: balance !== null && validCost && balance >= totalCost,
  } as const;
}
