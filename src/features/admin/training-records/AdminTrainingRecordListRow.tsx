import { AdminLessonBookingListRow } from '../lesson-bookings/AdminLessonBookingUi';
import type { AdminLessonBookingListRowInput } from '../lesson-bookings/AdminLessonBookingUi';

export function AdminTrainingRecordListRow({
  item,
  selected,
  onSelect,
}: {
  readonly item: AdminLessonBookingListRowInput & {
    readonly kindLabel: string;
    readonly trainingRecordId: string;
    readonly recordKind: 'lesson' | 'course';
  };
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <div data-admin-training-kind={item.recordKind}>
      <AdminLessonBookingListRow item={item} selected={selected} onSelect={onSelect} />
    </div>
  );
}
