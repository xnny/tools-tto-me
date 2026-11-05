import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarView from '../views/CalendarView.vue'

enableAutoUnmount(afterEach)

function setNow(dateTime: string) {
  vi.mocked(Temporal.Now.zonedDateTimeISO).mockReturnValue(Temporal.ZonedDateTime.from(dateTime))
}

describe('calendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(Temporal.Now, 'zonedDateTimeISO')
    setNow('2026-12-31T12:00:00+08:00[Asia/Shanghai]')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('shows Monday first, marks the weekend, and displays the selected weekday', async () => {
    setNow('2026-02-01T12:00:00+08:00[Asia/Shanghai]')
    const wrapper = mount(CalendarView)

    expect(wrapper.findAll('.weekdays span').map((day) => day.text())).toEqual([
      '一',
      '二',
      '三',
      '四',
      '五',
      '六',
      '日',
    ])
    expect(wrapper.findAll('.weekdays .weekend').map((day) => day.text())).toEqual(['六', '日'])
    expect(wrapper.get('.detail-date').text()).toBe('2026年2月1日 星期日')

    await wrapper.get('button[aria-label^="2026-02-02 "]').trigger('click')
    expect(wrapper.get('.detail-date').text()).toBe('2026年2月2日 星期一')
  })

  it('shows the number of calendar days from today for past and future selections', async () => {
    const wrapper = mount(CalendarView)

    expect(wrapper.text()).not.toContain('还有')
    expect(wrapper.text()).not.toContain('已经过去')

    await wrapper.get('button[aria-label^="2027-01-01 "]').trigger('click')
    expect(wrapper.text()).toContain('还有1天')

    await wrapper.get('button[aria-label^="2026-12-30 "]').trigger('click')
    expect(wrapper.text()).toContain('已经过去1天')

    await wrapper.get('.today-button').trigger('click')
    expect(wrapper.text()).not.toContain('还有')
    expect(wrapper.text()).not.toContain('已经过去')
    expect(wrapper.get('.day-cell.selected').attributes('aria-label')).toMatch(/^2026-12-31 /)
  })

  it('constrains the selected day when navigating to a shorter month', async () => {
    setNow('2026-01-31T12:00:00+08:00[Asia/Shanghai]')
    const wrapper = mount(CalendarView)

    await wrapper.get('button[aria-label="下个月"]').trigger('click')
    expect(wrapper.get('.detail-date').text()).toBe('2026年2月28日 星期六')

    await wrapper.get('button[aria-label="上个月"]').trigger('click')
    expect(wrapper.get('.detail-date').text()).toBe('2026年1月28日 星期三')
  })

  it('constrains the selected day when choosing a shorter month from the dropdown', async () => {
    setNow('2026-01-31T12:00:00+08:00[Asia/Shanghai]')
    const wrapper = mount(CalendarView)

    await wrapper.get('.month-select select').setValue('2')
    expect(wrapper.get('.detail-date').text()).toBe('2026年2月28日 星期六')
  })

  it('constrains leap day when choosing a non-leap year', async () => {
    setNow('2024-02-29T12:00:00+08:00[Asia/Shanghai]')
    const wrapper = mount(CalendarView)

    await wrapper.get('.date-controls > .select-wrap select').setValue('2025')
    expect(wrapper.get('.detail-date').text()).toBe('2025年2月28日 星期五')
  })

  it('navigates across a year boundary', async () => {
    const wrapper = mount(CalendarView)

    await wrapper.get('button[aria-label="下个月"]').trigger('click')
    expect(wrapper.get('.detail-date').text()).toBe('2027年1月31日 星期日')

    await wrapper.get('button[aria-label="上个月"]').trigger('click')
    expect(wrapper.get('.detail-date').text()).toBe('2026年12月31日 星期四')
  })

  it.each([
    { date: '1901-01-01', arrow: '上个月', outside: '1900-12-31' },
    { date: '2099-12-31', arrow: '下个月', outside: '2100-01-01' },
  ])(
    'disables navigation outside the supported range at $date',
    async ({ date, arrow, outside }) => {
      setNow(`${date}T12:00:00[Asia/Shanghai]`)
      const wrapper = mount(CalendarView)
      const navigation = wrapper.get(`button[aria-label="${arrow}"]`)
      const outsideDay = wrapper.get(`button[aria-label^="${outside} "]`)

      expect(navigation.attributes('disabled')).toBeDefined()
      expect(outsideDay.attributes('disabled')).toBeDefined()
      await navigation.trigger('click')
      await outsideDay.trigger('click')
      expect(wrapper.get('.day-cell.selected').attributes('aria-label')).toMatch(
        new RegExp(`^${date} `),
      )
    },
  )

  it.each([
    { holiday: '元旦', date: '2026-01-01', label: '元旦' },
    { holiday: '春节', date: '2026-02-17', label: '春节' },
    { holiday: '清明节', date: '2026-04-05', label: '清明' },
    { holiday: '劳动节', date: '2026-05-01', label: '劳动节' },
    { holiday: '端午节', date: '2026-06-19', label: '端午节' },
    { holiday: '中秋节', date: '2026-09-25', label: '中秋节' },
    { holiday: '国庆节', date: '2026-10-01', label: '国庆节' },
  ])('selects $holiday in the displayed year', async ({ holiday, date, label }) => {
    const wrapper = mount(CalendarView)

    await wrapper.get('.holiday-select select').setValue(holiday)
    expect(wrapper.get('.day-cell.selected').attributes('aria-label')).toMatch(
      new RegExp(`^${date} `),
    )
    expect(wrapper.get('.detail-festival').text()).toContain(label)
  })

  it('updates today when the page stays open past midnight', async () => {
    setNow('2026-12-31T23:59:59+08:00[Asia/Shanghai]')
    const wrapper = mount(CalendarView)

    await vi.advanceTimersByTimeAsync(999)
    expect(wrapper.find('.detail-relative').exists()).toBe(false)

    setNow('2027-01-01T00:00:00+08:00[Asia/Shanghai]')
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.text()).toContain('已经过去1天')
    expect(wrapper.get('.heading-date').text()).toBe('2027 年 1 月')
    expect(wrapper.get('.day-cell.today').attributes('aria-label')).toMatch(/^2027-01-01 /)

    await wrapper.get('.today-button').trigger('click')
    expect(wrapper.text()).not.toContain('已经过去')
    expect(wrapper.get('.detail-date').text()).toBe('2027年1月1日 星期五')
  })

  it.each([
    {
      start: '2026-03-08T00:00:00-05:00[America/New_York]',
      end: '2026-03-09T00:00:00-04:00[America/New_York]',
      nextDate: '2026-03-09',
      hours: 23,
    },
    {
      start: '2026-11-01T00:00:00-04:00[America/New_York]',
      end: '2026-11-02T00:00:00-05:00[America/New_York]',
      nextDate: '2026-11-02',
      hours: 25,
    },
  ])(
    'counts calendar days and refreshes at midnight on a $hours-hour day',
    async ({ start, end, nextDate, hours }) => {
      setNow(start)
      const wrapper = mount(CalendarView)

      await wrapper.get(`button[aria-label^="${nextDate} "]`).trigger('click')
      expect(wrapper.get('.detail-relative').text()).toBe('还有1天')
      await wrapper.get('.today-button').trigger('click')
      expect(wrapper.find('.detail-relative').exists()).toBe(false)

      vi.mocked(Temporal.Now.zonedDateTimeISO).mockClear()
      await vi.advanceTimersByTimeAsync(hours * 60 * 60 * 1000 - 1)
      expect(Temporal.Now.zonedDateTimeISO).not.toHaveBeenCalled()

      setNow(end)
      await vi.advanceTimersByTimeAsync(1)
      expect(Temporal.Now.zonedDateTimeISO).toHaveBeenCalledTimes(1)
      expect(wrapper.get('.detail-relative').text()).toBe('已经过去1天')
      expect(wrapper.get('.day-cell.today').attributes('aria-label')).toMatch(
        new RegExp(`^${nextDate} `),
      )
    },
  )

  it('clears the midnight timer on unmount', () => {
    const wrapper = mount(CalendarView)

    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
