# ADR-0011 — Instructor access to Participant progress after lesson start

## Status

Accepted

## Context

Instructor access to Participant progress and skills must support lesson-time assessment without granting broad access to unrelated Participants or Account documents.

Historically, instructor progress access required either:

- an active `instructor_relationship`; or
- a valid lesson with `Attendance = present`.

This prevented an assigned instructor from assessing a Participant during an already-started lesson before Attendance had been recorded.

The authorization contract must allow lesson-time assessment while preserving least privilege and the existing Participant/account security boundary.

## Decision

Read and assessment authorization are separate.

An assigned Instructor may read Participant progress immediately after a canonical
Booking is confirmed. The server verifies assignment, membership in both Booking
party and frozen service party, lifecycle (`confirmed` or `completed`), and that
the Booking is not deleted. Reading does not require the lesson to have started.
Cancellation removes this Booking basis; another independently valid read basis
may remain. Existing valid InstructorRelationship read access is retained.

Assessment commands (skill scores, skill comments and all Instructor level
operations) require a qualifying canonical Booking whose `startsAt` has passed.
An existing InstructorRelationship alone never authorizes assessment, including
historical guardian permissions. No relationship data is deleted or migrated.
Completed qualifying lessons retain authority without a fixed post-lesson expiry.

Participant blocks retain the canonical policy: they prevent new activity and
relationship-only access, while valid Booking-scoped access remains available.
Blocking does not cancel confirmed lessons. Each actor may remove only their own
block. Account/Participant management boundaries remain unchanged.

## Time authority

The backend uses server-authoritative time for assessment. Client identifiers,
status and clocks cannot grant authority. The UI clock only refreshes presentation
at the next lesson start, including an already-open progress dialog.

## Read access

Progress, skill scores, comments and level state are exposed through authorized
Participant progress read models. Future confirmed Bookings grant read access,
not access to account contacts, financial data or unrelated Participants.

Read authorization uses instructor/Participant/status-scoped Booking pages of 50,
stopping at the first valid Booking. Assessment transaction queries additionally
filter by start time, page in batches of 25 and stop at the first valid Booking.
Malformed/deleted matches may require further pages; normal historical records
do not cause a full-history drain. Existing composite indexes cover these shapes.

## Write access

`update_participant_progress` and Instructor `manage_participant_level` operations
share the stricter started-Booking guard. They never use the prelesson read guard
as a write capability. Transactionality, OCC, idempotency and owner/admin policy
remain unchanged.

## Lesson feedback

Lesson feedback remains a separate contract.

Access to feedback for a specific lesson continues to require the applicable Attendance rule, including `Attendance = present` where required by the current canonical contract.

Starting a lesson does not automatically satisfy the lesson-feedback policy.

## Security invariants

The following remain denied:

- instructor access to unrelated `/users/{uid}`;
- arbitrary instructor `/users` list/query;
- progress access to unrelated Participants;
- access based only on a client-supplied Participant ID;
- another instructor using a lesson they are not assigned to;
- invalid, cancelled, or otherwise ineligible Booking-based access.

Existing owner/student read access remains unchanged.

## UI behavior

The student instructor card exposes blocking/unblocking under the additional
actions menu, with a required block reason and confirmation. Manual relationship
grant/revoke controls are removed from this flow. The selected Participant,
including a dependent, determines the affected block.

The Instructor may view future confirmed students, level, radar, scores and
comments. Before the first qualifying lesson starts, assessment and level mutation
controls are unavailable and the UI explains when assessment becomes available.
The existing lesson-start timer updates controls without manual reload.

## Consequences

- The Instructor can prepare for a confirmed lesson by viewing progress.
- Read access cannot be reused to mutate progress before lesson start.
- Manual permissions no longer bypass assessment timing.
- Broad `/users` access and client-authoritative mutation are not introduced.

## Deployment

Required deployment order:

1. Existing Firestore indexes must be READY / Enabled; no new indexes are required.
2. Deploy:
   - `queryParticipantProgressReadModels`;
   - `executeCanonicalCommand`;
3. Deploy Hosting.

No Firestore Rules or data migration is required.