import {
  GuestContactDetailsSchema,
  GuestContactSchema,
  GUEST_CONTACT_TRANSPORT_METADATA_KEYS,
  guestContactDocumentId,
  normalizeFirestoreDocument,
  type CommandEnvelope,
  type GuestContact,
  type GuestContactSubject,
} from '@ski-academy/shared-domain';

export function guestContactPath(subject: GuestContactSubject): string {
  return `guest_contacts/${guestContactDocumentId(subject)}`;
}

export function guestContactDetailsFromCommand(envelope: CommandEnvelope) {
  const metadata = envelope.context.transportMetadata;
  const phone = metadata?.[GUEST_CONTACT_TRANSPORT_METADATA_KEYS.phone];
  if (phone === undefined) return undefined;
  return GuestContactDetailsSchema.parse({
    phone,
    ...(metadata?.[GUEST_CONTACT_TRANSPORT_METADATA_KEYS.email] === undefined
      ? {}
      : { email: metadata[GUEST_CONTACT_TRANSPORT_METADATA_KEYS.email] }),
  });
}

export function parseGuestContact(data: Record<string, unknown> | undefined): GuestContact | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = GuestContactSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}
