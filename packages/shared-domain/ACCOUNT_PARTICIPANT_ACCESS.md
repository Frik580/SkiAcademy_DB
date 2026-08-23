# Account and Participant access decisions

T02 adds strict canonical contracts for Account, Participant, Participant Management, the active
Participant-owner guard, Instructor Relationship, Participant Block, and explicit booking-scoped
access evidence.

- Persisted T02 aggregates begin at revision 1 and carry `createdAt`, `updatedAt`, the creating and
  last-changing canonical command IDs, and the current correlation ID. The command ID is the audit
  linkage because ADR-0005 derives Activity Log identity from canonical command identity; domain
  records do not store a second mutable audit-log pointer.
- Account lifecycle is `active | disabled`; Participant lifecycle is `active | archived`.
  Participant Management is `active | ended`, Instructor Relationship is
  `active | revoked | expired`, and Participant Block is `active | removed`. Terminal timestamps
  must fall within the record's creation/update chronology. These schemas represent lifecycle state
  only; T02 does not implement transition commands.
- A Participant explicitly records either one managed relationship ID or `unmanaged_guest`.
  Topology validation requires a managed Participant, its one active owner relationship, and its
  active-owner guard to agree on Participant, Account, relationship ID, and relationship revision.
  No Account is inferred from payer, Booking history, raw ID equality, or Participant data.
- Canonical v1 management role is only `owner`. `authority` distinguishes an explicit self link
  from the `parent_guardian` capability for a dependent. Administrator operational authority does
  not create either relationship.
- Instructor Relationship basis is closed to confirmed Booking, confirmed Course Enrollment,
  administration assignment, or explicit guardian permission. Guardian permission records the
  exact Participant Management relationship and Account that granted it. General access is active
  only in the half-open `[validFrom, expiresAt)` interval.
- Booking-scoped minimum access is explicit evidence naming the Participant, Instructor, time
  interval, and Booking or Course-Day/Enrollment source. A block denies general relationship access
  and all new activity. Existing valid booking-scoped evidence still returns minimum delivery
  access with `blockedForNewActivity: true`, preserving confirmed commitments without treating the
  block or Booking history as a general access grant.
- Parent/Guardian and Instructor blocks are separate directions. Each block records its creator,
  Participant, Instructor, reason, timestamp metadata, and lifecycle. Only the exact creator can be
  serialized as the remover, and topology validation rejects duplicate active blocks in the same
  direction for the same Participant/Instructor pair.

This slice contains no command execution, Firestore transaction behavior, legacy compatibility,
migration, dual read/write, frontend contract, Booking aggregate, or Course workflow.
