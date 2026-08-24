"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localCalendarInputToUtcDate = localCalendarInputToUtcDate;
exports.resolveBookingScheduleFromCalendarInput = resolveBookingScheduleFromCalendarInput;
exports.resolveInstructorHourlyRateKzt = resolveInstructorHourlyRateKzt;
exports.calculateIndividualBookingPriceKzt = calculateIndividualBookingPriceKzt;
const primitives_1 = require("./primitives");
function zonedPartsAt(instantMs, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
    });
    const parts = formatter.formatToParts(new Date(instantMs));
    const values = {};
    for (const part of parts) {
        if (part.type !== 'literal') {
            values[part.type] = Number(part.value);
        }
    }
    return values;
}
function localCalendarInputToUtcDate(calendarInput, timeZone) {
    const [year, month, day] = calendarInput.localDate.split('-').map(Number);
    const [hour, minute] = calendarInput.localTime.split(':').map(Number);
    const targetLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    let guessMs = targetLocalMs;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = zonedPartsAt(guessMs, timeZone);
        const observedLocalMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second ?? 0);
        guessMs += targetLocalMs - observedLocalMs;
    }
    return new Date(guessMs);
}
function resolveBookingScheduleFromCalendarInput(calendarInput, timeZone) {
    const startsAtDate = localCalendarInputToUtcDate(calendarInput, timeZone);
    const endsAtDate = new Date(startsAtDate.getTime() + calendarInput.durationMinutes * 60_000);
    const interval = primitives_1.TimeIntervalSchema.parse({
        startsAt: (0, primitives_1.timestampFromDate)(startsAtDate),
        endsAt: (0, primitives_1.timestampFromDate)(endsAtDate),
    });
    return {
        interval,
        durationMinutes: calendarInput.durationMinutes,
    };
}
function resolveInstructorHourlyRateKzt(tariff) {
    if (tariff.pricePerHourKZT !== undefined) {
        if (!Number.isFinite(tariff.pricePerHourKZT) || tariff.pricePerHourKZT <= 0) {
            throw new Error('Invalid instructor hourly rate');
        }
        return primitives_1.KztMinorUnitsSchema.parse(Math.round(tariff.pricePerHourKZT));
    }
    if (tariff.pricePerHour === undefined || !Number.isFinite(tariff.pricePerHour) || tariff.pricePerHour <= 0) {
        throw new Error('Invalid instructor hourly rate');
    }
    return primitives_1.KztMinorUnitsSchema.parse(Math.round(tariff.pricePerHour * 100));
}
function calculateIndividualBookingPriceKzt(hourlyRateKzt, durationMinutes) {
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        throw new Error('Invalid booking duration');
    }
    return primitives_1.KztMinorUnitsSchema.parse(Math.round((hourlyRateKzt * durationMinutes) / 60));
}
