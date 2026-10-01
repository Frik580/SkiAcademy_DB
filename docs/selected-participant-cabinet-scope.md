# Selected Participant cabinet scope

The header (`useNavbarParticipantSwitcher`) and cabinet share
`useCabinetProgressParticipantSelectionStore`. `useCabinetProgressParticipantSelection`
returns a presentation scope only when its account matches and the selected ID
belongs to the current managed participant set. It adds no selection state.

## Data flow

- Account hot/history/calendar reads → `LessonBookingReadModel` →
  `mapLessonBookingReadModelToCabinetItem` (including canonical `participantIds`).
- Account course-enrollment reads → `CourseEnrollmentCabinetItem` →
  `buildMixedCabinetSessionItems` (lesson and course-day rows).
- `StudentCabinetShell` + selected Participant →
  `selectCabinetDataForParticipant` → Home/Today, Calendar/Lessons, History,
  Courses, Development, coach recommendations and Journey presentation.
- Progress comes from `useParticipantProgressStore`, overlaid on the account
  profile for exactly the selected Participant. Today still overlays
  `participantTodayChecklists[participantId]`, including its existing self-only
  compatibility behavior.
- Feedback uses the selected Participant's canonical feedback bucket. Its
  presentation ID changes before paint; pending reads never display the previous
  Participant's feedback. Open lesson/chat/review/cancellation/reschedule/level
  dialogs close when the selection or account changes.
- Season totals and participant achievement rules retain canonical
  participant Attendance evidence, progress, feedback and persisted achievement
  sources. They do not count account-wide booking lists. The `feedback_given`
  achievement rule remains explicitly account-scoped, as defined by
  `achievementProductScope`; its account-review evidence is preserved.
- Wallet/ledger, payment authority, contact/identity, preferences, participant
  management and authentication remain account-scoped.
  Wallet operation history also retains the full account Booking list for
  payment/refund rows and ledger detail enrichment.

## Ownership and compatibility

A lesson is visible when its canonical party `participantIds` includes the
selected ID, regardless of lifecycle status or origin. `[A, B]` is one Booking,
visible for both A and B; `[A]` is invisible for B. Display names, payer identity,
account IDs and `selfAccountId` projections do not determine ownership.

Canonical read models require `participantIds`; the client field is optional
only to accommodate existing legacy presentation rows. Missing or empty IDs
fail closed for everyone, including self. There is no proven legacy
Booking-to-self mapping in this path. No new legacy persistence/fallback is
introduced. Unidentified legacy course-booking rows are also excluded;
canonical enrollments/course-day rows retain their Participant ownership.

`activity_logs` has account `userId`, with no canonical Participant identifier.
Only `booking_completed` and `review_created` records linked by explicit
`metadata.bookingId` to an owned Booking are included. Unlinked records and
skill/level/recommendation/achievement records cannot safely be attributed,
even when linked to a shared lesson, and are omitted. The historical activity
timeline therefore cannot recover those ambiguous legacy events. This does
not remove canonical progress, feedback or achievements. Booking-linked
reviews in History/Journey follow the same owned-Booking relation.

## Authorization and read cost

Presentation filtering adds no authorization. The existing managed-participant
picker, authenticated callable reads and server management/topology checks
remain the authority; arbitrary IDs cannot create server access. The cabinet
also rejects selections absent from its managed set before rendering.

No new queries, subscriptions, polling, schedulers or duplicated participant
datasets are added. Existing account reads and cursor pagination are retained
(lesson read-model pages have a maximum of 25). Calendar month loading remains
account-cached; newly loaded rows pass through the same Participant boundary.
History may need further account pages to reach older selected-Participant
records. No automatic full-history drain is introduced.
