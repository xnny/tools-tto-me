<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { dateKey, getCalendarDay, getCalendarMonth } from '@/utils/calendar'

const today = shallowRef(Temporal.Now.zonedDateTimeISO().toPlainDate())
const selectedDate = shallowRef(today.value)
const year = ref(today.value.year)
const month = ref(today.value.month)
const holiday = ref('')
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const years = Array.from({ length: 199 }, (_, index) => 1901 + index)
const months = Array.from({ length: 12 }, (_, index) => index + 1)
const days = computed(() => getCalendarMonth(year.value, month.value))
const selected = computed(() => getCalendarDay(selectedDate.value))
const todayKey = computed(() => dateKey(today.value))
const relativeDays = computed(() => {
  const difference = today.value.until(selectedDate.value, { largestUnit: 'days' }).days
  if (difference > 0) return `还有${difference}天`
  if (difference < 0) return `已经过去${-difference}天`
  return ''
})

let midnightTimer: ReturnType<typeof setTimeout> | undefined

function updateToday() {
  const now = Temporal.Now.zonedDateTimeISO()
  today.value = now.toPlainDate()
  const nextMidnight = now.add({ days: 1 }).startOfDay()
  midnightTimer = setTimeout(updateToday, nextMidnight.epochMilliseconds - now.epochMilliseconds)
}

onMounted(updateToday)
onUnmounted(() => clearTimeout(midnightTimer))

function selectDate(date: Temporal.PlainDate) {
  selectedDate.value = date
  year.value = date.year
  month.value = date.month
  holiday.value = ''
}

function changeMonth(amount: number) {
  const target = selectedDate.value.add({ months: amount }, { overflow: 'constrain' })
  if (target.year < 1901 || target.year > 2099) return
  selectDate(target)
}

function changeSelection() {
  selectDate(selectedDate.value.with({ year: year.value, month: month.value }, { overflow: 'constrain' }))
}

function selectHoliday() {
  if (!holiday.value) return
  const name = holiday.value
  for (let m = 1; m <= 12; m++) {
    const match = getCalendarMonth(year.value, m).find((day) => day.inMonth && (day.festivals.includes(name) || (name === '清明节' && day.solarTerm === '清明')))
    if (match) {
      selectDate(match.date)
      return
    }
  }
  holiday.value = ''
}
</script>

<template>
  <main class="calendar-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">CALENDAR</p>
        <h1>日历</h1>
        <p class="subtitle">查看日期、农历与节日</p>
      </div>
      <span class="heading-date">{{ today.year }} 年 {{ today.month }} 月</span>
    </div>

    <section class="calendar-card" aria-label="日历">
      <div class="toolbar">
        <div class="date-controls">
          <label class="select-wrap">
            <span class="sr-only">选择年份</span>
            <select v-model.number="year" @change="changeSelection">
              <option v-for="item in years" :key="item" :value="item">{{ item }}年</option>
            </select>
          </label>
          <div class="month-control">
            <button type="button" class="arrow" aria-label="上个月" :disabled="year === 1901 && month === 1" @click="changeMonth(-1)">‹</button>
            <label class="select-wrap month-select">
              <span class="sr-only">选择月份</span>
              <select v-model.number="month" @change="changeSelection">
                <option v-for="item in months" :key="item" :value="item">{{ item }}月</option>
              </select>
            </label>
            <button type="button" class="arrow" aria-label="下个月" :disabled="year === 2099 && month === 12" @click="changeMonth(1)">›</button>
          </div>
          <label class="select-wrap holiday-select">
            <span class="sr-only">选择节日</span>
            <select v-model="holiday" @change="selectHoliday">
              <option value="">节日选择</option>
              <option v-for="item in ['元旦节', '春节', '清明节', '劳动节', '端午节', '中秋节', '国庆节']" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
        </div>
        <button type="button" class="today-button" @click="selectDate(today)">返回今天</button>
      </div>

      <div class="calendar-content">
        <div class="month-view">
          <div class="weekdays" aria-hidden="true">
            <span v-for="(weekday, index) in weekdays" :key="weekday" :class="{ weekend: index === 5 || index === 6 }">{{ weekday }}</span>
          </div>
          <div class="day-grid">
            <button
              v-for="day in days"
              :key="day.key"
              type="button"
              class="day-cell"
              :class="{ outside: !day.inMonth, selected: day.key === selected.key, today: day.key === todayKey, festival: day.festivals.length || day.solarTerm }"
              :aria-label="`${day.key} ${day.lunarDate}${day.festivals.length ? ' ' + day.festivals.join('、') : ''}`"
              :aria-pressed="day.key === selected.key"
              :disabled="day.date.year < 1901 || day.date.year > 2099"
              @click="selectDate(day.date)"
            >
              <span v-if="day.holiday" class="holiday-badge" :class="{ work: day.holiday === '班' }">{{ day.holiday }}</span>
              <span class="day-number">{{ day.day }}</span>
              <span class="lunar-label">{{ day.lunarLabel }}</span>
              <span v-if="day.key === todayKey" class="today-dot"></span>
            </button>
          </div>
        </div>

        <aside class="day-detail" aria-live="polite">
          <p class="detail-date">{{ selected.date.year }}年{{ selected.date.month }}月{{ selected.day }}日 星期{{ weekdays[selected.date.dayOfWeek - 1] }}</p>
          <div class="detail-number">{{ selected.day }}</div>
          <p v-if="relativeDays" class="detail-relative">{{ relativeDays }}</p>
          <p class="detail-lunar">农历{{ selected.lunarDate }}</p>
          <p class="detail-ganzhi">{{ selected.gzYear }}年 【{{ selected.zodiac }}年】<br>{{ selected.gzMonth }}月 {{ selected.gzDay }}日</p>
          <p v-if="selected.festivals.length || selected.solarTerm" class="detail-festival">{{ [...selected.festivals, selected.solarTerm].filter(Boolean).join(' · ') }}</p>
          <div class="almanac">
            <div class="almanac-row"><span class="almanac-tag good">宜</span><span>{{ selected.yi.slice(0, 8).join('　') || '诸事不宜' }}</span></div>
            <div class="almanac-row"><span class="almanac-tag bad">忌</span><span>{{ selected.ji.slice(0, 8).join('　') || '无' }}</span></div>
          </div>
        </aside>
      </div>
    </section>
    <p class="footnote">节假日及调休安排以官方公布为准</p>
  </main>
</template>

<style scoped>
.calendar-page { max-width: 1000px; margin: 0 auto; padding: 58px 24px 72px; color: #263348; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; }
.page-heading { display: flex; align-items: end; justify-content: space-between; margin-bottom: 28px; }
.eyebrow { margin: 0 0 8px; color: #3c80d9; font-size: 11px; font-weight: 700; letter-spacing: .18em; }
h1 { margin: 0; color: #1f2d41; font-size: 32px; line-height: 1.2; }
.subtitle { margin: 9px 0 0; color: #8b96a5; font-size: 14px; }
.heading-date { padding-bottom: 3px; color: #a2acb9; font-size: 13px; }
.calendar-card { overflow: hidden; background: #fff; border: 1px solid #e7edf4; border-radius: 12px; box-shadow: 0 14px 45px rgba(39, 66, 100, .08); }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 19px 22px; border-bottom: 1px solid #edf1f6; }
.date-controls, .month-control { display: flex; align-items: center; gap: 10px; }
.month-control { gap: 2px; }
.select-wrap { display: inline-flex; align-items: center; }
select, button { font: inherit; }
select { appearance: none; height: 36px; min-width: 100px; padding: 0 30px 0 12px; color: #425167; background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none' stroke='%238b9aab' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2.5 4.5 3.5 3.5 3.5-3.5'/%3E%3C/svg%3E") no-repeat right 10px center; border: 1px solid #dce4ed; border-radius: 5px; cursor: pointer; }
.month-select select { min-width: 75px; }
.arrow { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 36px; padding: 0 0 2px; border: 0; background: transparent; color: #8b9aab; font-size: 26px; line-height: 1; cursor: pointer; }
.arrow:hover { color: #3281df; }
.arrow:disabled { opacity: .3; cursor: default; }
.today-button { display: inline-flex; align-items: center; justify-content: center; height: 36px; padding: 0 16px; color: #377ed2; background: #f1f7ff; border: 1px solid #d7e9ff; border-radius: 5px; cursor: pointer; white-space: nowrap; }
.today-button:hover { background: #e4f1ff; }
.calendar-content { display: grid; grid-template-columns: minmax(0, 1fr) 245px; }
.month-view { padding: 14px 22px 22px; }
.weekdays, .day-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.weekdays { height: 36px; align-items: center; text-align: center; color: #8794a6; font-size: 13px; }
.weekdays .weekend { color: #e28a7b; }
.day-grid { gap: 3px; }
.day-cell { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 0; height: 70px; padding: 5px 1px; background: transparent; border: 1px solid transparent; border-radius: 7px; color: #344154; cursor: pointer; }
.day-cell:hover { background: #f3f8fe; }
.day-cell:disabled { cursor: default; opacity: .5; }
.day-cell.selected { border-color: #4b94e9; background: #edf6ff; }
.day-cell.outside { color: #c5cdd6; }
.day-number { font-size: 20px; line-height: 1.25; }
.lunar-label { max-width: 100%; overflow: hidden; margin-top: 5px; color: #a1aab6; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.festival:not(.outside) .lunar-label { color: #e17a66; }
.holiday-badge { position: absolute; top: 4px; right: 5px; color: #e77b6f; font-size: 10px; }
.holiday-badge.work { color: #9ba6b4; }
.today-dot { position: absolute; bottom: 4px; width: 4px; height: 4px; background: #4b94e9; border-radius: 50%; }
.day-detail { padding: 25px 22px; background: #f5f9ff; text-align: center; }
.detail-date { margin: 0 0 18px; color: #6d8098; font-size: 13px; }
.detail-number { display: flex; align-items: center; justify-content: center; width: 90px; height: 90px; margin: auto; color: white; background: #5798e4; border-radius: 12px; font-size: 49px; font-weight: 300; box-shadow: 0 8px 20px rgba(71, 139, 218, .23); }
.detail-relative { margin: 12px 0 0; color: #377ed2; font-size: 13px; font-weight: 600; }
.detail-lunar { margin: 17px 0 7px; color: #364b67; font-size: 16px; font-weight: 600; }
.detail-ganzhi { margin: 0; color: #8a9aac; font-size: 12px; line-height: 1.9; }
.detail-festival { margin: 10px 0 0; color: #e17a66; font-size: 13px; }
.almanac { display: grid; gap: 12px; margin-top: 22px; padding-top: 20px; border-top: 1px solid #e0eaf5; text-align: left; }
.almanac-row { display: flex; gap: 9px; align-items: flex-start; color: #7c8da1; font-size: 12px; line-height: 1.8; }
.almanac-tag { flex: 0 0 24px; height: 24px; border-radius: 5px; color: white; line-height: 24px; text-align: center; }
.good { background: #83b59a; } .bad { background: #d7a4a0; }
.footnote { margin: 14px 3px 0; color: #a7b1bd; font-size: 12px; text-align: right; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 700px) { .calendar-page { padding: 30px 12px 48px; } .heading-date { display: none; } .toolbar { align-items: flex-start; padding: 14px; } .date-controls { flex-wrap: wrap; gap: 6px; } .calendar-content { grid-template-columns: 1fr; } .month-view { padding: 10px 8px 16px; } .day-cell { height: 59px; } .day-number { font-size: 18px; } .day-detail { padding: 22px; } .almanac { max-width: 400px; margin: 20px auto 0; } }
@media (max-width: 380px) { select { min-width: 85px; padding-left: 8px; } .today-button { padding: 0 9px; } .arrow { width: 22px; } }
</style>
