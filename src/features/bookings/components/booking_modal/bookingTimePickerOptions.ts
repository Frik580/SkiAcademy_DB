import type { BookingAppleWheelOption } from './BookingAppleWheelPicker';

export interface BuildBookingTimePickerOptionsInput {
  isLoadingBookings: boolean;
  occupancyLoadFailed: boolean;
  availableSlots: string[];
  t: (key: string) => string;
}

export function buildBookingTimePickerOptions(
  input: BuildBookingTimePickerOptionsInput
): BookingAppleWheelOption[] {
  const { isLoadingBookings, occupancyLoadFailed, availableSlots, t } = input;

  if (isLoadingBookings) {
    return [{ value: '', label: `${t('loading')}...`, disabled: true }];
  }
  if (occupancyLoadFailed) {
    return [{ value: '', label: t('instructorOccupancyLoadFailed'), disabled: true }];
  }
  if (availableSlots.length === 0) {
    return [{ value: '', label: t('noSlotsAvailable'), disabled: true }];
  }
  return availableSlots.map((slot) => ({ value: slot, label: slot }));
}

export function getVisibleBookingTimePickerValues(
  options: readonly BookingAppleWheelOption[]
): string[] {
  return options
    .filter((option) => !option.disabled && option.value !== '')
    .map((option) => option.value);
}
