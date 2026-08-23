# Canonical primitive decisions

T01 establishes these shared-domain conventions for later canonical slices:

- IDs are URL-safe opaque strings of 1–128 characters. Their TypeScript brands and typed
  reference/path builders prevent aggregate kinds from being substituted; the raw value does not
  encode business identity or derive one aggregate ID from another.
- Timestamps use the transport-neutral `{ seconds, nanoseconds }` shape and Firestore's supported
  UTC range. Persisting adapters can map this value directly to and from Firestore `Timestamp`.
- Time intervals are half-open `[startsAt, endsAt)` and require `endsAt > startsAt`, so adjacent
  intervals do not overlap.
- Aggregate revisions and KZT minor units are non-negative safe integers. Canonical money always
  carries `currency: "KZT"`; floating-point and foreign-currency values are invalid.
- Canonical paths are absolute, typed, and restricted to the accepted collection topology. Path
  builders accept the branded ID required by that document kind.
- Validation failures expose sorted, normalized issue codes and paths without copying rejected
  values. Command-error transport uses a closed code/policy registry and maps unknown failures to a
  fixed internal response without serializing exception messages, stacks, SDK data, or paths.

These modules do not import legacy Booking, Course-shaped Enrollment, availability-lock, Wallet
ledger, transaction, or frontend contracts.
