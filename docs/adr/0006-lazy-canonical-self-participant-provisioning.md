# ADR-0006: Lazy canonical self-Participant provisioning

## Status

Accepted.

## Context

After the canonical Booking cutover, authenticated Booking commands require an active canonical
Participant and ParticipantManagement relationship. Legacy client profiles may have only
`/users/{accountId}`. Registration still creates that profile after Firebase Auth creates the user,
so an Auth `onCreate` trigger cannot reliably provision from the completed profile. A read-model
fallback or direct client Firestore write would violate ADR-0001 and ADR-0002.

## Decision

The first authenticated canonical Participant access executes the dedicated
`provision_self_participant` command before querying managed Participants. The command is the only
writer for this workflow and runs inside the canonical idempotent transaction pipeline.

Within one transaction it:

- verifies the authenticated client profile and initializes missing canonical Account fields on the
  existing `/users/{accountId}` document;
- queries active `authority = self` management records for that Account and reuses a valid existing
  self-Participant;
- rejects contradictory or duplicate self ownership rather than manufacturing another identity;
- otherwise creates deterministic Account-derived Participant and ParticipantManagement identities,
  plus the active-owner guard, atomically;
- stages the required Activity Log and command-idempotency records.

The initial self profile uses the Account display name and conservative v1 defaults (`18`,
`beginner`, `ski`) because the current registration form does not collect canonical age, skill, or
discipline. Those fields remain editable only through canonical Participant commands.

## Consequences

- Existing accounts need no mandatory bulk backfill: opening an authenticated flow that loads the
  managed Participant picker provisions or finds the self-Participant.
- Repeated calls, retries with a different idempotency key, and concurrent calls cannot create
  duplicate self identities. The transaction queries current self management, reads the deterministic
  target documents, and creates deterministic IDs, so Firestore retries serialize competing writes.
- Accounts with an existing valid self-Participant retain that Participant ID and receive no duplicate.
- Invalid multiple-self or broken management topology is surfaced as a relationship conflict and must
  be repaired explicitly; provisioning never hides corruption.
- `queryManagedParticipantPickerReadModels` remains a pure read model. The client orchestration invokes
  provisioning first and queries second; no React component writes canonical documents.

## Rejected alternatives

- Registration-only provisioning does not repair pre-cutover accounts and races profile creation.
- A required production backfill creates an avoidable deployment gate and is unnecessary because the
  command can safely discover existing self management transactionally.
- Synthetic picker items and UserProfile-as-Participant fallbacks violate the canonical identity and
  authorization boundaries.
