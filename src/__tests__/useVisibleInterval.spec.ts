import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { useVisibleInterval } from '../composables/useVisibleInterval'

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function renderClock(enabled = ref(true)) {
  const tick = vi.fn()
  const wrapper = mount(
    defineComponent({
      setup() {
        useVisibleInterval(tick, 1000, () => enabled.value)
        return () => null
      },
    }),
  )
  return { wrapper, tick }
}

function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('visible display intervals', () => {
  it('stops hidden work and resumes immediately without replaying missed ticks', async () => {
    const { tick, wrapper } = renderClock()
    expect(tick).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(tick).toHaveBeenCalledTimes(2)

    setVisibility('hidden')
    window.dispatchEvent(new Event('focus'))
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(120000)
    expect(tick).toHaveBeenCalledTimes(2)

    setVisibility('visible')
    expect(tick).toHaveBeenCalledTimes(3)
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(1)
    tick.mockClear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(tick).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
    setVisibility('visible')
    window.dispatchEvent(new Event('focus'))
    expect(tick).toHaveBeenCalledTimes(1)
  })

  it('does not start when mounted in the background, even when enabled changes', async () => {
    setVisibility('hidden')
    const enabled = ref(false)
    const { tick } = renderClock(enabled)
    enabled.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(tick).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    setVisibility('visible')
    expect(tick).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('only runs while the caller needs a clock', async () => {
    const enabled = ref(false)
    const { tick } = renderClock(enabled)
    expect(tick).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    enabled.value = true
    await nextTick()
    expect(tick).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    enabled.value = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(tick).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
