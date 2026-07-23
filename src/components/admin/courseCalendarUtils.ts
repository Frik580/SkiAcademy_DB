export interface CalendarDayCell {
  day: number;
  isCurrentMonth: boolean;
  date: Date;
}

export function getDaysInMonth(date: Date): CalendarDayCell[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday, 1 is Monday...
  // Adjust Sunday to be 6 (so Monday is 0, Sunday is 6)
  const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  // Previous month's trailing days
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  const prevDays: CalendarDayCell[] = [];
  for (let i = adjustedFirstDay - 1; i >= 0; i--) {
    prevDays.push({
      day: prevMonthTotalDays - i,
      isCurrentMonth: false,
      date: new Date(year, month - 1, prevMonthTotalDays - i)
    });
  }
  
  // Current month's days
  const currentDays: CalendarDayCell[] = [];
  for (let i = 1; i <= totalDays; i++) {
    currentDays.push({
      day: i,
      isCurrentMonth: true,
      date: new Date(year, month, i)
    });
  }
  
  // Next month's leading days to complete the grid (usually 42 cells total for 6 rows)
  const nextDaysCount = 42 - (prevDays.length + currentDays.length);
  const nextDays: CalendarDayCell[] = [];
  for (let i = 1; i <= nextDaysCount; i++) {
    nextDays.push({
      day: i,
      isCurrentMonth: false,
      date: new Date(year, month + 1, i)
    });
  }
  
  return [...prevDays, ...currentDays, ...nextDays];
}
