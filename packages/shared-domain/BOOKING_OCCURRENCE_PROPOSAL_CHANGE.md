# Booking, occurrence, proposal, and change-request decisions

T03 adds strict canonical contracts for individual and family/group Bookings, Booking occurrence
identity, frozen service-party representation, BookingProposal, and BookingChangeRequest.

- Booking is structurally distinct from CourseEnrollment and rejects legacy scalar `userId`,
  `isGuest`, course-shaped fields, synthetic `course_*` Instructor IDs, and `withdrawn` lifecycle.
- Persisted Booking aggregates begin at revision 1 and carry `createdAt`, `updatedAt`, creating and
  last-changing command IDs, and the current correlation ID.
- `attribution` is an immutable historical record of `bookingOrigin` and `bookedBy`. Guest origin
  requires a guest `bookedBy`; account, admin, and instructor origins require an Account `bookedBy`.
  Linking a guest Booking later must not change its origin.
- `party.participantIds` contains 1–8 unique Participants. One Participant means an Individual
  Lesson; two through eight means a Family/Group Lesson.
- `occurrence` owns the server-generated `occurrenceId`, assigned Instructor, half-open interval,
  IANA timezone, schedule revision, and the frozen `serviceParty` subset used for Attendance on
  that delivery attempt. Reschedule rotation uses a new `occurrenceId` so old Attendance never
  attaches to a new occurrence.
- Optional `payerAccountId` identifies the associated funding Account and remains distinct from
  `bookedBy`, Participants, and Instructors.
- Booking lifecycle vocabularies are `pending`, `confirmed`, `pending_cancellation`, `cancelled`,
  `completed`, and `no_show`. `withdrawn` is Course-only and is rejected for Booking.
- BookingProposal targets exactly one Participant, may overlap, and carries no reservation or claim
  authority. BookingChangeRequest is a separate aggregate with its own lifecycle and does not mutate
  or reserve a Booking by itself.

This slice contains no lifecycle transition commands, booking creation, proposal acceptance,
change-request resolution, Firestore transactions, resource-claim acquisition, Wallet charging,
Attendance recording, scheduler behavior, frontend migration, or legacy compatibility.
