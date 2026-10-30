import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'

describe('App', () => {
  it('renders the header navigation and home page', async () => {
    router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })
    await new Promise((resolve) => setTimeout(resolve))

    expect(wrapper.text()).toContain('TTO Tools')
    expect(wrapper.find('.site-nav').text()).toContain('日历')
    expect(wrapper.find('.site-nav').text()).toContain('时间戳转换')
    expect(wrapper.findAll('.tool-card')).toHaveLength(2)
  })
})
