import { describe, it, expect, vi } from 'vitest'

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
    expect(wrapper.find('.site-nav').text()).toContain('两步验证')
    expect(wrapper.findAll('.tool-card')).toHaveLength(4)
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

  it('opens the usage guide from the footer', async () => {
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })
    const link = wrapper.get('.site-footer a')
    expect(link.text()).toBe('使用说明')
    expect(link.attributes('href')).toBe('/guide')

    await link.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('Guide'))
    expect(document.title).toBe('使用说明 · TTO Tools')
    expect(wrapper.get('h1').text()).toBe('使用说明')
    expect(wrapper.text()).toContain('基督教节日按西方教会常用公历日期标注')
    expect(wrapper.text()).toContain('取消后重新开启自动删除会重新计时')
    expect(wrapper.text()).toContain('选择、拖拽或粘贴 PNG、JPEG、WebP')
  })
})
