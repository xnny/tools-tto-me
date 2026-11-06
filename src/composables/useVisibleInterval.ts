import { onBeforeUnmount, onMounted, watch } from 'vue'

/** Keep display-only clocks idle while the page is hidden or no clock is needed. */
export function useVisibleInterval(
  callback: () => void,
  delay: number,
  enabled: () => boolean = () => true,
) {
  let mounted = false
  let timer: ReturnType<typeof setInterval> | undefined

  const stop = () => {
    clearInterval(timer)
    timer = undefined
  }

  const shouldRun = () => mounted && document.visibilityState === 'visible' && enabled()

  const tick = () => {
    if (shouldRun()) callback()
    else stop()
  }

  const sync = () => {
    stop()
    if (!shouldRun()) return
    // Read the real clock on resume; never replay missed background ticks.
    callback()
    if (shouldRun()) timer = setInterval(tick, delay)
  }

  watch(enabled, sync)

  onMounted(() => {
    mounted = true
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    sync()
  })

  onBeforeUnmount(() => {
    mounted = false
    stop()
    document.removeEventListener('visibilitychange', sync)
    window.removeEventListener('focus', sync)
  })
}
