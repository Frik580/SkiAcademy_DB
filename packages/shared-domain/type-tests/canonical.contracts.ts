import {
  BookingIdSchema,
  ParticipantIdSchema,
  canonicalPaths,
  canonicalReference,
  type BookingId,
} from '../src';
import { canonicalPrimitiveFixtures } from '../src/testing';

const bookingId = BookingIdSchema.parse('booking_contract_01');
const participantId = ParticipantIdSchema.parse('participant_contract_01');

canonicalReference('booking', bookingId);
canonicalPaths.booking(bookingId);

// @ts-expect-error A Participant ID cannot cross the Booking reference boundary.
canonicalReference('booking', participantId);

// @ts-expect-error A Participant ID cannot address a Booking document.
canonicalPaths.booking(participantId);

// @ts-expect-error Branded aggregate IDs are not structurally interchangeable.
const crossTypeId: BookingId = participantId;

void crossTypeId;
void canonicalPrimitiveFixtures;
