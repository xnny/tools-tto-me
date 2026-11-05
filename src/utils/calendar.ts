import { SolarDay } from 'tyme4ts'

export interface CalendarDay {
  date: Temporal.PlainDate
  key: string
  day: number
  inMonth: boolean
  lunarLabel: string
  lunarDate: string
  lunarYear: string
  gzYear: string
  gzMonth: string
  gzDay: string
  zodiac: string
  festivals: string[]
  solarTerm: string
  holiday: '休' | '班' | null
  yi: string[]
  ji: string[]
}

/** ISO date key, independent of time zones. */
export function dateKey(date: Temporal.PlainDate): string {
  return date.toString()
}

/** Convert one Gregorian date into the information shown on the calendar. */
export function getCalendarDay(date: Temporal.PlainDate): CalendarDay {
  const { year, month, day } = date
  const solar = SolarDay.fromYmd(year, month, day)
  const lunar = solar.getLunarDay()
  const lunarMonth = lunar
    .getLunarMonth()
    .getName()
    .replace('十一月', '冬月')
    .replace('十二月', '腊月')
  const lunarDay = lunar.getName()
  // The displayed year and zodiac change at Lunar New Year, while the month follows solar terms.
  const lunarYearCycle = lunar.getLunarMonth().getLunarYear().getSixtyCycle()
  const sixtyCycleDay = solar.getSixtyCycleDay()
  const festivals = [
    ...new Set(
      [solar.getFestival()?.getName(), lunar.getFestival()?.getName()].filter(
        (name) => name !== undefined,
      ),
    ),
  ]
  const termDay = solar.getTermDay()
  const solarTerm = termDay.getDayIndex() === 0 ? termDay.getSolarTerm().getName() : ''
  const holiday = solar.getLegalHoliday()

  return {
    date,
    key: dateKey(date),
    day,
    inMonth: true,
    lunarLabel: festivals[0] || solarTerm || (lunar.getDay() === 1 ? lunarMonth : lunarDay),
    lunarDate: `${lunarMonth}${lunarDay}`,
    lunarYear: `${String(lunar.getYear()).replace(/\d/g, (digit) => '〇一二三四五六七八九'.charAt(Number(digit)))}年`,
    gzYear: lunarYearCycle.getName(),
    gzMonth: sixtyCycleDay.getMonth().getName(),
    gzDay: sixtyCycleDay.getSixtyCycle().getName(),
    zodiac: lunarYearCycle.getEarthBranch().getZodiac().getName(),
    festivals,
    solarTerm,
    holiday: holiday ? (holiday.isWork() ? '班' : '休') : null,
    yi: lunar.getRecommends().map((item) => item.getName()),
    ji: lunar.getAvoids().map((item) => item.getName()),
  }
}

/** Return a Monday-first six-week grid. Month is one-based. */
export function getCalendarMonth(year: number, month: number): CalendarDay[] {
  const first = Temporal.PlainDate.from({ year, month, day: 1 })
  const start = first.subtract({ days: first.dayOfWeek - 1 })
  return Array.from({ length: 42 }, (_, index) => {
    const date = start.add({ days: index })
    return {
      ...getCalendarDay(date),
      inMonth: date.year === year && date.month === month,
    }
  })
}
