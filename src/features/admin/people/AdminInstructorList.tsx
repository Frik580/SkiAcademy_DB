import type { InstructorId } from '@ski-academy/shared-domain';
import type { AdminInstructorDirectoryRow } from './adminInstructorContracts';
import type { useAdminInstructorTranslations } from './useAdminInstructorTranslations';

interface AdminInstructorListProps {
  readonly items: readonly AdminInstructorDirectoryRow[];
  readonly selectedInstructorId?: InstructorId;
  readonly text: ReturnType<typeof useAdminInstructorTranslations>['text'];
  readonly onOpen: (instructorId: InstructorId) => void;
}

function specialtyLabel(
  specialty: AdminInstructorDirectoryRow['specialty'],
  text: AdminInstructorListProps['text']
): string {
  if (specialty === 'snowboard') return text.specialtySnowboard;
  if (specialty === 'both') return text.specialtyBoth;
  if (specialty === 'ski') return text.specialtySki;
  return '—';
}

export function AdminInstructorList({
  items,
  selectedInstructorId,
  text,
  onOpen,
}: AdminInstructorListProps) {
  return (
    <div className="overflow-x-auto border border-[var(--border)]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
            <th className="px-4 py-3">{text.instructor}</th>
            <th className="px-4 py-3">{text.specialty}</th>
            <th className="px-4 py-3">{text.rate}</th>
            <th className="px-4 py-3">{text.availability}</th>
            <th className="px-4 py-3">{text.account}</th>
            <th className="px-4 py-3 text-right">{text.actions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]/40">
          {items.map((item) => (
            <tr
              key={item.instructorId}
              className={
                selectedInstructorId === item.instructorId
                  ? 'bg-black/5 dark:bg-white/5'
                  : 'hover:bg-black/5 dark:hover:bg-white/5'
              }
            >
              <td className="px-4 py-3">
                <span className="block text-xs font-bold">{item.name || text.unnamed}</span>
              </td>
              <td className="px-4 py-3 text-xs">{specialtyLabel(item.specialty, text)}</td>
              <td className="px-4 py-3 font-mono text-xs">
                {item.pricePerHourKZT === undefined
                  ? '—'
                  : item.pricePerHourKZT.toLocaleString('ru-RU')}
              </td>
              <td className="px-4 py-3 text-xs">
                {item.isAvailable ? text.available : text.paused}
              </td>
              <td className="px-4 py-3 text-xs">
                {item.linkedAccountDisplayName ||
                  (item.linkedAccountId ? item.linkedAccountId : text.accountNotLinked)}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onOpen(item.instructorId)}
                  className="border border-[var(--border)] px-2 py-1 text-[10px] font-mono uppercase tracking-wider"
                >
                  {text.openDetail}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
