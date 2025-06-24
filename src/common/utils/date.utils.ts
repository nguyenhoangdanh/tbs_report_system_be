export function getCurrentWeek(): { weekNumber: number; year: number } {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor(
    (now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000),
  );
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

  return {
    weekNumber,
    year: now.getFullYear(),
  };
}

export function getWeekDateRange(
  weekNumber: number,
  year: number,
): { start: Date; end: Date } {
  const jan1 = new Date(year, 0, 1);
  const daysOffset = (weekNumber - 1) * 7;
  const weekStart = new Date(jan1.getTime() + daysOffset * 24 * 60 * 60 * 1000);

  // Adjust to Monday
  const monday = new Date(weekStart);
  monday.setDate(weekStart.getDate() - weekStart.getDay() + 1);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return { start: monday, end: sunday };
}

export function isReportLocked(weekNumber: number, year: number): boolean {
  const { start } = getWeekDateRange(weekNumber, year);
  const deadline = new Date(start);
  deadline.setDate(start.getDate() + 14); // 2 weeks after week start

  return new Date() > deadline;
}
