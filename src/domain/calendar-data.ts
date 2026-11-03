import { listOverlapping, type DayAppointment } from "./appointments";
import { loadSettings, loadWorkingHours, type Queryable } from "./availability";
import { buildDayColumn, gridWindow, weekDates, type DayColumn, type GridWindow } from "./calendar";
import type { SlotWorkingHours } from "./slots";
import { listTimeOffDuring, type TimeOffBlock } from "./time-off";
import { localDayRange, type LocalDate } from "./time";

/** Everything the owner's calendar shows for the week containing a date. */
export interface CalendarWeek {
  dates: LocalDate[];
  workingHours: readonly SlotWorkingHours[];
  appointments: DayAppointment[];
  timeOff: TimeOffBlock[];
  stepMin: number;
}

export async function loadCalendarWeek(
  db: Queryable,
  date: LocalDate,
  tz: string,
): Promise<CalendarWeek> {
  const dates = weekDates(date);
  const first = dates[0] ?? date;
  const last = dates.at(-1) ?? date;
  const range = { start: localDayRange(first, tz).start, end: localDayRange(last, tz).end };
  const [workingHours, appointments, timeOff, settings] = await Promise.all([
    loadWorkingHours(db),
    listOverlapping(db, range),
    listTimeOffDuring(db, range),
    loadSettings(db),
  ]);
  return { dates, workingHours, appointments, timeOff, stepMin: settings.slotStepMin };
}

/** Lays out some of the week's days; null when they're all closed and empty. */
export function layoutDays(
  week: CalendarWeek,
  dates: readonly LocalDate[],
  now: Date,
  tz: string,
): { window: GridWindow; columns: DayColumn<DayAppointment, TimeOffBlock>[] } | null {
  const window = gridWindow(dates, week.workingHours, week.appointments, tz);
  if (!window) return null;
  const columns = dates.map((d) =>
    buildDayColumn({
      date: d,
      window,
      workingHours: week.workingHours,
      appointments: week.appointments,
      timeOff: week.timeOff,
      stepMin: week.stepMin,
      now,
      tz,
    }),
  );
  return { window, columns };
}
