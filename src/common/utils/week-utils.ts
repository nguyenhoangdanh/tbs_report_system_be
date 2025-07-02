/**
 * Week-related utility functions
 */

/**
 * Get the current week number and year
 * Uses ISO week date system where Monday is the first day of the week
 */
export function getCurrentWeek(): { weekNumber: number; year: number } {
  const now = new Date();
  return getWeekFromDate(now);
}

/**
 * Get week number and year from a specific date
 * @param date The date to get week info from
 */
export function getWeekFromDate(date: Date): { weekNumber: number; year: number } {
  // Create a copy to avoid modifying the original date
  const targetDate = new Date(date.getTime());
  
  // Set to nearest Thursday (defines the year for ISO week)
  const dayOfWeek = (targetDate.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
  targetDate.setDate(targetDate.getDate() - dayOfWeek + 3);
  
  // Get first Thursday of the year (week 1)
  const firstThursday = new Date(targetDate.getFullYear(), 0, 4);
  const firstThursdayDayOfWeek = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstThursdayDayOfWeek + 3);
  
  // Calculate week number
  const weekNumber = Math.floor((targetDate.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  
  return {
    weekNumber: Math.max(1, Math.min(53, weekNumber)),
    year: targetDate.getFullYear()
  };
}

/**
 * Get the date range for a specific week
 * @param weekNumber Week number (1-53)
 * @param year Year
 */
export function getWeekDateRange(weekNumber: number, year: number): { startDate: Date; endDate: Date } {
  // Get first Thursday of the year (defines week 1)
  const firstThursday = new Date(year, 0, 4);
  const firstThursdayDayOfWeek = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstThursdayDayOfWeek + 3);
  
  // Calculate the Thursday of the target week
  const targetThursday = new Date(firstThursday.getTime());
  targetThursday.setDate(targetThursday.getDate() + (weekNumber - 1) * 7);
  
  // Get Monday (start of week)
  const startDate = new Date(targetThursday.getTime());
  startDate.setDate(startDate.getDate() - 3);
  
  // Get Sunday (end of week)
  const endDate = new Date(targetThursday.getTime());
  endDate.setDate(endDate.getDate() + 3);
  
  return { startDate, endDate };
}

/**
 * Calculate how many days overdue a report is
 * @param weekNumber The week number of the report
 * @param year The year of the report
 */
export function calculateDaysOverdue(weekNumber: number, year: number): number {
  const now = new Date();
  const { endDate } = getWeekDateRange(weekNumber, year);
  
  // Add grace period (e.g., reports due by end of Sunday + 1 day grace)
  const dueDate = new Date(endDate.getTime());
  dueDate.setDate(dueDate.getDate() + 1); // 1 day grace period
  dueDate.setHours(23, 59, 59, 999); // End of grace day
  
  if (now <= dueDate) {
    return 0; // Not overdue
  }
  
  const diffTime = now.getTime() - dueDate.getTime();
  const diffDays = Math.ceil(diffTime / (24 * 60 * 60 * 1000));
  
  return diffDays;
}

/**
 * Get week info string for display
 * @param weekNumber Week number
 * @param year Year
 */
export function getWeekDisplayString(weekNumber: number, year: number): string {
  const { startDate, endDate } = getWeekDateRange(weekNumber, year);
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };
  
  return `Tuần ${weekNumber}/${year} (${formatDate(startDate)} - ${formatDate(endDate)})`;
}

/**
 * Check if a specific date falls within a given week
 * @param date Date to check
 * @param weekNumber Week number
 * @param year Year
 */
export function isDateInWeek(date: Date, weekNumber: number, year: number): boolean {
  const { startDate, endDate } = getWeekDateRange(weekNumber, year);
  
  // Set time to start/end of day for proper comparison
  const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const weekEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  
  return checkDate >= weekStart && checkDate <= weekEnd;
}

/**
 * Get all dates within a specific week
 * @param weekNumber Week number
 * @param year Year
 */
export function getWeekDates(weekNumber: number, year: number): Date[] {
  const { startDate } = getWeekDateRange(weekNumber, year);
  const dates: Date[] = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate.getTime());
    date.setDate(date.getDate() + i);
    dates.push(date);
  }
  
  return dates;
}

/**
 * Get month(s) that a specific week spans across
 * @param weekNumber Week number
 * @param year Year
 */
export function getWeekMonths(weekNumber: number, year: number): Array<{ month: number; year: number }> {
  const { startDate, endDate } = getWeekDateRange(weekNumber, year);
  const months = new Set<string>();
  
  // Add start month
  months.add(`${startDate.getFullYear()}-${startDate.getMonth()}`);
  
  // Add end month if different
  months.add(`${endDate.getFullYear()}-${endDate.getMonth()}`);
  
  return Array.from(months).map(monthStr => {
    const [yearStr, monthStr2] = monthStr.split('-');
    return {
      year: parseInt(yearStr),
      month: parseInt(monthStr2) + 1 // Convert to 1-12 range
    };
  });
}

/**
 * Check if a week spans across multiple months
 * @param weekNumber Week number
 * @param year Year
 */
export function isWeekCrossMonth(weekNumber: number, year: number): boolean {
  const months = getWeekMonths(weekNumber, year);
  return months.length > 1;
}

/**
 * Get previous week
 * @param weekNumber Current week number
 * @param year Current year
 */
export function getPreviousWeek(weekNumber: number, year: number): { weekNumber: number; year: number } {
  if (weekNumber > 1) {
    return { weekNumber: weekNumber - 1, year };
  } else {
    // Go to last week of previous year
    return { weekNumber: 52, year: year - 1 }; // Simplified, actual last week might be 53
  }
}

/**
 * Get next week
 * @param weekNumber Current week number
 * @param year Current year
 */
export function getNextWeek(weekNumber: number, year: number): { weekNumber: number; year: number } {
  if (weekNumber < 52) {
    return { weekNumber: weekNumber + 1, year };
  } else {
    // Check if week 53 exists for this year
    const week53Date = new Date(year, 11, 31); // Dec 31
    const week53Info = getWeekFromDate(week53Date);
    
    if (week53Info.weekNumber === 53 && week53Info.year === year && weekNumber < 53) {
      return { weekNumber: weekNumber + 1, year };
    } else {
      // Go to first week of next year
      return { weekNumber: 1, year: year + 1 };
    }
  }
}

/**
 * Format week for display
 * @param weekNumber Week number
 * @param year Year
 * @param format Format type
 */
export function formatWeek(
  weekNumber: number, 
  year: number, 
  format: 'short' | 'long' | 'range' = 'short'
): string {
  switch (format) {
    case 'short':
      return `W${weekNumber}/${year}`;
    case 'long':
      return `Tuần ${weekNumber} năm ${year}`;
    case 'range':
      return getWeekDisplayString(weekNumber, year);
    default:
      return `W${weekNumber}/${year}`;
  }
}