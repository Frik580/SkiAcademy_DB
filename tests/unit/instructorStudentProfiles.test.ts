import { describe, expect, it } from 'vitest';
import {
  chunkFirestoreInValues,
  getInstructorStudentProfileIds,
} from '../../src/features/profile/sync/instructorStudentProfiles';
import type { Booking } from '../../src/types';

const booking = (userId: string, instructorId = 'instructor_1') =>
  ({ userId, instructorId }) as Booking;

describe('instructor student profile query helpers', () => {
  it('keeps only real students assigned to the instructor and de-duplicates them', () => {
    expect(
      getInstructorStudentProfileIds(
        [
          booking('student_1'),
          booking('student_1'),
          booking('guest_1'),
          booking('system_block_1'),
          booking('student_2', 'instructor_2'),
        ],
        'instructor_1'
      )
    ).toEqual(['student_1']);
  });

  it('splits document ID queries into Firestore-compatible chunks', () => {
    const values = Array.from({ length: 61 }, (_, index) => String(index));

    expect(chunkFirestoreInValues(values).map((chunk) => chunk.length)).toEqual([30, 30, 1]);
  });
});
