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

An instructor may read and update Participant progress/skills when any existing valid access basis applies:

1. an active `instructor_relationship`; or
2. valid `Attendance = present`; or
3. a valid assigned lesson that has already started.

For lesson-based access, all of the following must be true:

- the requesting instructor is canonically assigned to the lesson;
- the target Participant belongs to that Booking;
- the Booking is valid for instructor progress access;
- the Booking lifecycle is `confirmed` or `completed`;
- the Booking is not deleted;
- server-authoritative current time is greater than or equal to
  `booking.occurrence.interval.startsAt`.

There is no fixed post-lesson expiry window for this access basis.

A completed historical lesson may therefore continue to authorize progress/skills access when the canonical lesson relationship remains valid.

## Time authority

Lesson-start authorization is server-authoritative.

Client/browser time is not an authorization source.

Backend read and write paths determine whether the lesson has started using server-side time.

Client-side clocks may be used only to update presentation state, enable controls, or trigger a refetch at lesson start.

## Read access

After the canonical lesson start time, the assigned instructor may read the Participant progress required by the instructor workspace and skills/radar UI.

Before lesson start, the lesson itself and Participant context may be visible through authorized lesson read models, but lesson assignment alone does not grant progress access.

## Write access

After the canonical lesson start time, the assigned instructor may submit canonical progress/skill assessment updates for Participants belonging to that lesson.

Write authorization must use the same canonical instructor/lesson/Participant relationship as read authorization.

Client-supplied `participantId`, `instructorId`, `bookingId`, local state, or browser time are not authorization authorities.

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

Existing owner/student and valid relationship-based access remains unchanged.

## UI behavior

Before lesson start:

- the instructor may see the assigned lesson and Participant;
- progress/skills controls remain unavailable unless another valid access basis exists;
- the UI must not intentionally issue unauthorized progress requests.

At lesson start:

- progress/skills eligibility is re-evaluated;
- controls become available without requiring a manual page reload;
- backend authorization remains authoritative.

## Consequences

Positive:

- instructors can assess students during the lesson;
- Attendance does not need to be recorded before skill assessment;
- broad `/users` access is not reintroduced;
- read and write authorization share the same domain policy.

Trade-offs:

- lesson-based authorization requires querying instructor Booking relationships;
- authorization queries must remain bounded and indexed;
- runtime behavior still requires authenticated smoke verification.

## Deployment

Required deployment order:

1. deploy required Firestore indexes;
2. wait until indexes are READY / Enabled;
3. deploy:
   - `queryParticipantProgressReadModels`;
   - `executeCanonicalCommand`;
4. deploy Hosting.

No Firestore Rules or data migration is required.