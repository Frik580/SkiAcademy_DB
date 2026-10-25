import React, { forwardRef } from 'react';
export const ScheduleSlotActionModal = forwardRef(function TestModal(
  { activeSlot }: { activeSlot?: { booking?: { id: string } } },
  _ref
) {
  return <output data-testid="opened-booking">{activeSlot?.booking?.id}</output>;
});
