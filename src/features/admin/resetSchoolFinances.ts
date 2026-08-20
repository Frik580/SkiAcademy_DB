import { type QueryDocumentSnapshot } from 'firebase/firestore';
import {
  collection,
  db,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  writeBatch,
} from '../../infrastructure/firebase';
import {
  DEFAULT_STARTER_CREDIT_USD,
  GUEST_WALLET_SETTINGS_COLLECTION,
  GUEST_WALLET_SETTINGS_DOC_ID,
  isResettableWalletUser,
  normalizeStarterCreditUsd,
  SCHOOL_GLOBAL_STATS_USER_ID,
  starterOnlyWalletFields,
  WALLET_LEDGER_COLLECTION,
  walletLedgerEntryId,
} from '../../domain/wallet';

export type ResetSchoolFinancesResult = {
  usersReset: number;
  ledgerDeleted: number;
  starterCreditsWritten: number;
  creditUsd: number;
};

const PAGE_SIZE = 200;
const BATCH_LIMIT = 400;

const commitBatchDeletes = async (refs: ReturnType<typeof doc>[]) => {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

const deleteAllWalletLedger = async (onProgress?: (deleted: number) => void): Promise<number> => {
  let deleted = 0;
  let lastDoc: QueryDocumentSnapshot | undefined;

  while (true) {
    const pageQuery = lastDoc
      ? query(
          collection(db, WALLET_LEDGER_COLLECTION),
          orderBy(documentId()),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        )
      : query(collection(db, WALLET_LEDGER_COLLECTION), orderBy(documentId()), limit(PAGE_SIZE));

    const snapshot = await getDocs(pageQuery);
    if (snapshot.empty) break;

    await commitBatchDeletes(snapshot.docs.map((entryDoc) => entryDoc.ref));
    deleted += snapshot.size;
    onProgress?.(deleted);

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < PAGE_SIZE) break;
  }

  return deleted;
};

/**
 * Wipes school wallet history (including guest payments), zeros the guest cash wallet,
 * and sets every non-admin client balance back to the configured registration gift only.
 */
export async function resetSchoolFinances(
  onProgress?: (step: number) => void,
  creditUsd: number = DEFAULT_STARTER_CREDIT_USD
): Promise<ResetSchoolFinancesResult> {
  const amount = normalizeStarterCreditUsd(creditUsd);
  const ledgerDeleted = await deleteAllWalletLedger(onProgress);

  await setDoc(
    doc(db, GUEST_WALLET_SETTINGS_COLLECTION, GUEST_WALLET_SETTINGS_DOC_ID),
    { balanceUSD: 0 },
    { merge: true }
  );

  let usersReset = 0;
  let starterCreditsWritten = 0;
  let lastDoc: QueryDocumentSnapshot | undefined;
  let progress = ledgerDeleted;

  while (true) {
    const pageQuery = lastDoc
      ? query(collection(db, 'users'), orderBy(documentId()), startAfter(lastDoc), limit(PAGE_SIZE))
      : query(collection(db, 'users'), orderBy(documentId()), limit(PAGE_SIZE));

    const snapshot = await getDocs(pageQuery);
    if (snapshot.empty) break;

    for (const userDoc of snapshot.docs) {
      const data = userDoc.data() as { role?: string };
      if (!isResettableWalletUser(userDoc.id, data)) continue;

      const wallet = starterOnlyWalletFields(amount);
      const batch = writeBatch(db);
      batch.update(userDoc.ref, wallet);

      if (amount > 0) {
        const entryId = walletLedgerEntryId('starter_credit', `reset_${userDoc.id}_${amount}`);
        batch.set(doc(db, WALLET_LEDGER_COLLECTION, entryId), {
          id: entryId,
          userId: userDoc.id,
          amount,
          balanceAfter: amount,
          currency: 'USD',
          type: 'starter_credit',
          createdAt: new Date().toISOString(),
          subjectName: 'Starter gift credit',
        });
        starterCreditsWritten += 1;
      }

      await batch.commit();
      usersReset += 1;
      progress += 1;
      onProgress?.(progress);
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < PAGE_SIZE) break;
  }

  await setDoc(
    doc(db, 'users', SCHOOL_GLOBAL_STATS_USER_ID),
    { deletedCompletedRevenue: 0, deletedCompletedCount: 0 },
    { merge: true }
  );

  return {
    usersReset,
    ledgerDeleted,
    starterCreditsWritten,
    creditUsd: amount,
  };
}
