import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TimezoneConverter from '../views/TimezoneConverter.vue'
import router from '../router'

afterEach(() => {
  vi.useRealTimers()
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
})
