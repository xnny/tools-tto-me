import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TimezoneConverter from '../views/TimezoneConverter.vue'
import router from '../router'

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('timezone converter', () => {
  it('displays and converts UTC time for the UTC route', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-02T03:04:05Z'))
    await router.push('/timezone/utc')
    await router.isReady()

    const wrapper = mount(TimezoneConverter, { global: { plugins: [router] } })
    expect(wrapper.text()).toContain('当前 UTC 时间')
    expect(wrapper.text()).toContain('2024-01-02 03:04:05')

    await wrapper.get('#timezone-input').setValue('0\n1970-01-01 00:00:00')
    expect((wrapper.get('#timezone-output').element as HTMLTextAreaElement).value).toBe(
      '1970-01-01 00:00:00\n0',
    )

    wrapper.unmount()
  })

  it('pauses the clock while hidden and catches up once when returning', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-02T03:04:05Z'))
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    await router.push('/timezone/utc')
    await router.isReady()
    const wrapper = mount(TimezoneConverter, { global: { plugins: [router] } })
    await flushPromises()
    expect(vi.getTimerCount()).toBe(1)

    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(vi.getTimerCount()).toBe(0)
    expect(wrapper.get('.now-value').text()).toBe('2024-01-02 03:04:05')

    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.get('.now-value').text()).toBe('2024-01-02 03:05:05')
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('.now-value').text()).toBe('2024-01-02 03:05:06')

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
