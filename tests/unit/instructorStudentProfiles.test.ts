import { describe, expect, it } from 'vitest';
import {
  chunkFirestoreInValues,
  getInstructorStudentProfileIds,
} from '../../src/features/profile/sync/instructorStudentProfiles';
import type { InstructorLessonBookingItem } from '../../src/features/booking-collaboration/bookingCollaborationContracts';

const booking = (...selfAccountIds: Array<string | undefined>) =>
  ({
    participants: selfAccountIds.map((selfAccountId, index) => ({
      participantId: `participant_${index}`,
      displayName: `Student ${index}`,
      ...(selfAccountId ? { selfAccountId } : {}),
    })),
  }) as InstructorLessonBookingItem;

describe('instructor student profile query helpers', () => {
  it('keeps only self-managed participant accounts and de-duplicates them', () => {
    expect(
      getInstructorStudentProfileIds([
        booking('student_1'),
        booking('student_1'),
        booking('guest_1'),
        booking('system_block_1'),
        booking(undefined),
      ])
    ).toEqual(['student_1']);
  });

  it('splits document ID queries into Firestore-compatible chunks', () => {
    const values = Array.from({ length: 61 }, (_, index) => String(index));

    expect(chunkFirestoreInValues(values).map((chunk) => chunk.length)).toEqual([30, 30, 1]);
  });
});
