import type { CommandCalendarInput } from './commands/commandContext';
import { type IanaTimeZone, type KztMinorUnits, type TimeInterval } from './primitives';
export interface InstructorTariffInput {
    readonly pricePerHour?: number;
    readonly pricePerHourKZT?: number;
}
export interface ResolvedBookingSchedule {
    readonly interval: TimeInterval;
    readonly durationMinutes: number;
}
export declare function localCalendarInputToUtcDate(calendarInput: CommandCalendarInput, timeZone: IanaTimeZone): Date;
export declare function resolveBookingScheduleFromCalendarInput(calendarInput: CommandCalendarInput, timeZone: IanaTimeZone): ResolvedBookingSchedule;
export declare function resolveInstructorHourlyRateKzt(tariff: InstructorTariffInput): KztMinorUnits;
export declare function calculateIndividualBookingPriceKzt(hourlyRateKzt: KztMinorUnits, durationMinutes: number): KztMinorUnits;
