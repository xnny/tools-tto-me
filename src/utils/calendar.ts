import { HolidayUtil, Solar } from 'lunar-typescript'

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
  const solar = Solar.fromYmd(year, month, day)
  const lunar = solar.getLunar()
  const lunarMonth = `${lunar.getMonthInChinese()}月`
  const lunarDay = lunar.getDayInChinese()
  const festivals = [...new Set([...solar.getFestivals(), ...lunar.getFestivals()])]
  const solarTerm = lunar.getJieQi()
  const holiday = HolidayUtil.getHoliday(year, month, day)

  return {
    date,
    key: dateKey(date),
    day,
    inMonth: true,
    lunarLabel: festivals[0] || solarTerm || (lunar.getDay() === 1 ? lunarMonth : lunarDay),
    lunarDate: `${lunarMonth}${lunarDay}`,
    lunarYear: `${lunar.getYearInChinese()}年`,
    gzYear: lunar.getYearInGanZhi(),
    gzMonth: lunar.getMonthInGanZhi(),
    gzDay: lunar.getDayInGanZhi(),
    zodiac: lunar.getYearShengXiao(),
    festivals,
    solarTerm,
    holiday: holiday ? (holiday.isWork() ? '班' : '休') : null,
    yi: lunar.getDayYi(),
    ji: lunar.getDayJi(),
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
