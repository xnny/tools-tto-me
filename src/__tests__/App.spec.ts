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
    expect(wrapper.find('.site-nav').text()).toContain('待办事项')
    expect(wrapper.findAll('.tool-card')).toHaveLength(3)
  })

  it('shows a 404 page for unmatched paths and can return home', async () => {
    await router.push('/timezone/utf-8')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })
    expect(wrapper.find('h1').text()).toBe('页面未找到')
    expect(document.title).toBe('页面未找到 · TTO Tools')

    await wrapper.get('.home-link').trigger('click')
    await new Promise((resolve) => setTimeout(resolve))
    expect(wrapper.find('h1').text()).toBe('简单好用的在线小工具')
  })
})
