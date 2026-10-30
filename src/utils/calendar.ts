import { HolidayUtil, Solar } from 'lunar-javascript'

export interface CalendarDay {
  date: Date
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

/** The key uses local calendar components, rather than UTC conversion. */
export function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Convert one local Gregorian date into the information shown on the calendar. */
export function getCalendarDay(date: Date): CalendarDay {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const solar = Solar.fromYmd(year, month, day)
  const lunar = solar.getLunar()
  const lunarMonth = `${lunar.getMonthInChinese()}月`
  const lunarDay = lunar.getDayInChinese()
  const festivals = [...new Set([...solar.getFestivals(), ...lunar.getFestivals()])]
  const solarTerm = lunar.getJieQi()
  const holiday = HolidayUtil.getHoliday(year, month, day)

  return {
    date: new Date(year, month - 1, day),
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

/** Return a Sunday-first six-week grid. Month is one-based. */
export function getCalendarMonth(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month - 1, 1)
  const start = new Date(year, month - 1, 1 - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    const entry = getCalendarDay(date)
    entry.inMonth = date.getFullYear() === year && date.getMonth() === month - 1
    return entry
  })
}
