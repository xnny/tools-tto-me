import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CalendarView from '../views/CalendarView.vue'

describe('calendar date distance', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the number of calendar days from today for past and future selections', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 11, 31, 12))
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
    wrapper.unmount()
  })

  it('updates today when the page stays open past midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59))
    const wrapper = mount(CalendarView)

    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.text()).toContain('已经过去1天')

    await wrapper.get('.today-button').trigger('click')
    expect(wrapper.text()).not.toContain('已经过去')
    wrapper.unmount()
  })
})
