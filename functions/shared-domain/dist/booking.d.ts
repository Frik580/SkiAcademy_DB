export type LessonDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'freeride' | 'freestyle';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'pending_cancellation';
export interface BookingIdentity {
    id: string;
    userId: string;
    instructorId: string;
    instructorName: string;
    instructorAvatar: string;
    date: string;
    time: string;
    durationHours: number;
    status: BookingStatus;
    difficulty: LessonDifficulty;
    notes?: string;
}
export interface AvailabilitySlotLike {
    bookingId: string;
    instructorId: string;
    date: string;
    time: string;
    durationHours: number;
    slotType: 'lesson' | 'block';
}
export interface BookingPriceInput {
    userId: string;
    instructorId: string;
    durationHours: number;
    courseId?: string;
    coursePrice?: number;
    instructorPricePerHour?: number;
}
export declare const AVAILABILITY_HOUR_LOCKS_COLLECTION = "availability_hour_locks";
export declare class BookingSlotOverlapError extends Error {
    constructor();
}
export declare class BookingIdConflictError extends Error {
    constructor();
}
export declare const isCourseBooking: (booking: Pick<BookingIdentity, "instructorId">) => boolean;
export declare function calculateBookingTotalPrice(input: BookingPriceInput): number;
export declare const blocksInstructorAvailability: (booking: Pick<BookingIdentity, "instructorId" | "status"> & {
    isDeleted?: boolean;
}) => boolean;
export declare const timeStrToMinutes: (time: string) => number;
export declare const slotsOverlap: (a: Pick<BookingIdentity, "time" | "durationHours">, b: Pick<AvailabilitySlotLike, "time" | "durationHours">) => boolean;
export declare function buildHourLockId(instructorId: string, date: string, time: string): string;
export declare function buildHourLockIds(booking: Pick<BookingIdentity, 'instructorId' | 'date' | 'time' | 'durationHours'>): string[];
export declare function hasOverlappingAvailabilitySlot(candidate: Pick<BookingIdentity, 'time' | 'durationHours'>, existingSlots: AvailabilitySlotLike[], excludeBookingId?: string): boolean;
export declare function matchesExistingBookingRequest(existing: BookingIdentity, booking: BookingIdentity): boolean;
export declare function computeLessonEndsAtIso(booking: Pick<BookingIdentity, 'date' | 'time' | 'durationHours'>): string | null;
