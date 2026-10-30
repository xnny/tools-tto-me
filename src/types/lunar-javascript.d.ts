declare module 'lunar-javascript' {
  interface LunarDate {
    getYearInChinese(): string
    getMonthInChinese(): string
    getDayInChinese(): string
    getDay(): number
    getYearInGanZhi(): string
    getMonthInGanZhi(): string
    getDayInGanZhi(): string
    getYearShengXiao(): string
    getFestivals(): string[]
    getJieQi(): string
    getDayYi(): string[]
    getDayJi(): string[]
  }

  interface SolarDate {
    getLunar(): LunarDate
    getFestivals(): string[]
  }

  interface Holiday {
    isWork(): boolean
  }

  export const Solar: {
    fromYmd(year: number, month: number, day: number): SolarDate
  }

  export const HolidayUtil: {
    getHoliday(year: number, month: number, day: number): Holiday | null
  }
}
