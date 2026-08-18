"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slotsOverlap = exports.timeStrToMinutes = exports.blocksInstructorAvailability = exports.isCourseBooking = exports.BookingIdConflictError = exports.BookingSlotOverlapError = exports.AVAILABILITY_HOUR_LOCKS_COLLECTION = void 0;
exports.calculateBookingTotalPrice = calculateBookingTotalPrice;
exports.buildHourLockId = buildHourLockId;
exports.buildHourLockIds = buildHourLockIds;
exports.hasOverlappingAvailabilitySlot = hasOverlappingAvailabilitySlot;
exports.matchesExistingBookingRequest = matchesExistingBookingRequest;
exports.computeLessonEndsAtIso = computeLessonEndsAtIso;
exports.AVAILABILITY_HOUR_LOCKS_COLLECTION = 'availability_hour_locks';
class BookingSlotOverlapError extends Error {
    constructor() {
        super('Instructor slot is no longer available');
        this.name = 'BookingSlotOverlapError';
    }
}
exports.BookingSlotOverlapError = BookingSlotOverlapError;
class BookingIdConflictError extends Error {
    constructor() {
        super('Booking ID is already in use for a different request.');
        this.name = 'BookingIdConflictError';
    }
}
exports.BookingIdConflictError = BookingIdConflictError;
const isCourseBooking = (booking) => booking.instructorId.startsWith('course_');
exports.isCourseBooking = isCourseBooking;
function calculateBookingTotalPrice(input) {
    if (input.userId.startsWith('system_block_'))
        return 0;
    if ((0, exports.isCourseBooking)(input)) {
        if (typeof input.coursePrice !== 'number')
            throw new Error('Invalid course price.');
        return input.coursePrice;
    }
    if (typeof input.instructorPricePerHour !== 'number' || input.instructorPricePerHour < 0) {
        throw new Error('Invalid instructor price.');
    }
    return input.instructorPricePerHour * input.durationHours;
}
const blocksInstructorAvailability = (booking) => !(0, exports.isCourseBooking)(booking) &&
    !booking.isDeleted &&
    (booking.status === 'pending' ||
        booking.status === 'confirmed' ||
        booking.status === 'pending_cancellation');
exports.blocksInstructorAvailability = blocksInstructorAvailability;
const timeStrToMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + (minutes || 0);
};
exports.timeStrToMinutes = timeStrToMinutes;
const slotsOverlap = (a, b) => {
    const aStart = (0, exports.timeStrToMinutes)(a.time);
    const bStart = (0, exports.timeStrToMinutes)(b.time);
    return aStart < bStart + b.durationHours * 60 && aStart + a.durationHours * 60 > bStart;
};
exports.slotsOverlap = slotsOverlap;
function buildHourLockId(instructorId, date, time) {
    return `${instructorId}__${date}__${time}`;
}
function buildHourLockIds(booking) {
    const startMinutes = (0, exports.timeStrToMinutes)(booking.time);
    const lockIds = [];
    for (let hour = 0; hour < booking.durationHours; hour++) {
        const minutes = startMinutes + hour * 60;
        lockIds.push(buildHourLockId(booking.instructorId, booking.date, `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`));
    }
    return lockIds;
}
function hasOverlappingAvailabilitySlot(candidate, existingSlots, excludeBookingId) {
    return existingSlots.some((slot) => (!excludeBookingId || slot.bookingId !== excludeBookingId) && (0, exports.slotsOverlap)(candidate, slot));
}
function matchesExistingBookingRequest(existing, booking) {
    return (existing.userId === booking.userId &&
        existing.instructorId === booking.instructorId &&
        existing.instructorName === booking.instructorName &&
        existing.instructorAvatar === booking.instructorAvatar &&
        existing.date === booking.date &&
        existing.time === booking.time &&
        existing.durationHours === booking.durationHours &&
        existing.difficulty === booking.difficulty &&
        (existing.notes ?? '') === (booking.notes ?? ''));
}
function computeLessonEndsAtIso(booking) {
    const [year, month, day] = booking.date.split('-').map(Number);
    if (!year || !month || !day)
        return null;
    const [hour, minute] = (booking.time || '00:00').split(':').map(Number);
    const startsAt = new Date(year, month - 1, day, hour || 0, minute || 0, 0);
    if (Number.isNaN(startsAt.getTime()))
        return null;
    return new Date(startsAt.getTime() + (booking.durationHours || 1) * 60 * 60 * 1000).toISOString();
}
