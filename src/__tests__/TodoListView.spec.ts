import { enableAutoUnmount, flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TodoListView from '../views/TodoListView.vue'
import {
  clearExpiredTodos,
  getTodos,
  removeTodo,
  TODO_RETENTION_MS,
  updateTodo,
  type Todo,
} from '../utils/todoStorage'

vi.mock('../utils/todoStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/todoStorage')>()),
  clearExpiredTodos: vi.fn<typeof clearExpiredTodos>(),
  getTodos: vi.fn<typeof getTodos>(),
  removeTodo: vi.fn<typeof removeTodo>(),
  updateTodo: vi.fn<typeof updateTodo>(),
}))

enableAutoUnmount(afterEach)

const createdAt = new Date(2026, 10, 3, 23, 59).getTime()
const firstTodo: Todo = { id: 1, content: '买牛奶', completedAt: 0, autoDelete: true, createdAt }
const secondTodo: Todo = {
  id: 2,
  content: '回复邮件',
  completedAt: createdAt + 1000,
  autoDelete: true,
  createdAt: createdAt + 1,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(clearExpiredTodos).mockResolvedValue()
  vi.mocked(getTodos).mockResolvedValue([{ ...firstTodo }, { ...secondTodo }])
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const renderTodos = async () => {
  const wrapper = mount(TodoListView, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  return wrapper
}

describe('my todos page', () => {
  it('groups by local creation date, newest day first, with insertion order within each day', async () => {
    const thirdTodo = {
      ...firstTodo,
      id: 3,
      content: '今天新增',
      createdAt: new Date(2026, 10, 4).getTime(),
    }
    vi.mocked(getTodos).mockResolvedValue([firstTodo, secondTodo, thirdTodo])
    const wrapper = await renderTodos()
    expect(wrapper.findAll('.todo-group h3').map((item) => item.text())).toEqual([
      '2026-11-04',
      '2026-11-03',
    ])
    const content = () => wrapper.findAll('.todo-content').map((item) => item.text())
    expect(content()).toEqual(['今天新增', '买牛奶', '回复邮件'])
    expect(wrapper.get('.todo-count').text()).toBe('2 条未完成 · 共 3 条')
    await wrapper.get('.filters button:nth-child(2)').trigger('click')
    expect(content()).toEqual(['今天新增', '买牛奶'])
    await wrapper.get('.filters button:nth-child(3)').trigger('click')
    expect(content()).toEqual(['回复邮件'])
    expect(wrapper.findAll('.todo-group h3').map((item) => item.text())).toEqual(['2026-11-03'])
    await wrapper.get('.filters button:nth-child(1)').trigger('click')
    expect(content()).toEqual(['今天新增', '买牛奶', '回复邮件'])
    expect(wrapper.find('.composer').exists()).toBe(false)
    expect(wrapper.find('.page-heading .subtitle').exists()).toBe(false)
    expect(wrapper.get('.todo-page > :last-child').classes()).toContain('footnote')
  })

  it('records completion time, resets it to zero on restore, and starts a new period on completion', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(createdAt + 10000)
    vi.mocked(updateTodo).mockImplementation(async (id, changes) => ({
      ...firstTodo,
      ...changes,
      id,
    }))
    const wrapper = await renderTodos()
    await wrapper.get('#todo-complete-1').setValue(true)
    await flushPromises()
    expect(updateTodo).toHaveBeenLastCalledWith(1, { completedAt: createdAt + 10000 })
    expect(wrapper.get<HTMLInputElement>('#todo-complete-1').element.checked).toBe(true)
    await wrapper.get('#todo-complete-1').setValue(false)
    await flushPromises()
    expect(updateTodo).toHaveBeenLastCalledWith(1, { completedAt: 0 })
    now.mockReturnValue(createdAt + 20000)
    await wrapper.get('#todo-complete-1').setValue(true)
    await flushPromises()
    expect(updateTodo).toHaveBeenLastCalledWith(1, { completedAt: createdAt + 20000 })
    expect(wrapper.get('.todo-group h3').text()).toBe('2026-11-03')
  })

  it('keeps the checkbox in its persisted state when completion fails', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(createdAt + 1000)
    vi.mocked(updateTodo).mockRejectedValueOnce(new Error('Storage unavailable'))
    const wrapper = await renderTodos()
    await wrapper.get('#todo-complete-1').setValue(true)
    await flushPromises()
    expect(updateTodo).toHaveBeenCalledExactlyOnceWith(1, { completedAt: createdAt + 1000 })
    expect(wrapper.get<HTMLInputElement>('#todo-complete-1').element.checked).toBe(false)
    expect(wrapper.get('.todo-count').text()).toBe('1 条未完成 · 共 2 条')
    expect(wrapper.get('[role="alert"]').text()).toContain('完成状态保存失败')
  })

  it('defaults to automatic deletion and saves disabling or re-enabling it without cleaning up', async () => {
    const now = createdAt + 3 * 86400000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    vi.mocked(updateTodo).mockImplementation(async (id, changes) => ({
      ...secondTodo,
      ...changes,
      id,
    }))
    const wrapper = await renderTodos()
    expect(wrapper.find('.retention-option').exists()).toBe(false)
    await wrapper.get('#todo-edit-2').trigger('click')
    expect(wrapper.get('.retention-option').text()).toBe('自动删除')
    expect(wrapper.get<HTMLInputElement>('.retention-option input').element.checked).toBe(true)
    expect(wrapper.find('.deletion-countdown').exists()).toBe(true)
    await wrapper.get('.todo-editor .retention-option input').setValue(false)
    expect(wrapper.find('.deletion-countdown').exists()).toBe(false)
    expect(updateTodo).not.toHaveBeenCalled()
    await wrapper.get('.todo-editor').trigger('submit')
    await flushPromises()
    expect(updateTodo).toHaveBeenLastCalledWith(2, {
      content: secondTodo.content,
      autoDelete: false,
    })
    expect(wrapper.find('.retention-option').exists()).toBe(false)
    expect(wrapper.get<HTMLInputElement>('#todo-complete-2').element.checked).toBe(true)
    await wrapper.get('#todo-edit-2').trigger('click')
    expect(wrapper.get<HTMLInputElement>('.retention-option input').element.checked).toBe(false)
    await wrapper.get('.retention-option input').setValue(true)
    expect(wrapper.get('.deletion-countdown').text()).toBe('7 天 00:00:00 后删除')
    await wrapper.get('.todo-editor').trigger('submit')
    await flushPromises()
    expect(updateTodo).toHaveBeenLastCalledWith(2, {
      content: secondTodo.content,
      autoDelete: true,
      autoDeleteStartedAt: now,
    })
    expect(clearExpiredTodos).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.todo-item')).toHaveLength(2)
  })

  it('keeps the retention draft if saving fails and discards it on cancel', async () => {
    vi.mocked(updateTodo).mockRejectedValueOnce(new Error('Storage unavailable'))
    const wrapper = await renderTodos()
    await wrapper.get('#todo-edit-1').trigger('click')
    const retention = wrapper.get<HTMLInputElement>('.retention-option input')
    await retention.setValue(false)
    await wrapper.get('.todo-editor').trigger('submit')
    await flushPromises()
    expect(retention.element.checked).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain('编辑内容已保留')
    await wrapper.get('.todo-editor button[type="button"]').trigger('click')
    expect(wrapper.find('.retention-option').exists()).toBe(false)
    await wrapper.get('#todo-edit-1').trigger('click')
    expect(wrapper.get<HTMLInputElement>('.retention-option input').element.checked).toBe(true)
    expect(updateTodo).toHaveBeenCalledExactlyOnceWith(1, {
      content: firstTodo.content,
      autoDelete: false,
    })
  })

  it('updates the countdown each second and stops its timer on unmount', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(secondTodo.completedAt + TODO_RETENTION_MS - 2000)
    const wrapper = await renderTodos()
    await wrapper.get('#todo-edit-2').trigger('click')
    expect(wrapper.get('.deletion-countdown').text()).toBe('00:00:02 后删除')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('.deletion-countdown').text()).toBe('00:00:01 后删除')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('.deletion-countdown').text()).toBe('下次打开或刷新时删除')
    expect(clearExpiredTodos).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.todo-item')).toHaveLength(2)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts the countdown only after completion', async () => {
    const wrapper = await renderTodos()
    await wrapper.get('#todo-edit-1').trigger('click')
    expect(wrapper.get<HTMLInputElement>('.retention-option input').element.checked).toBe(true)
    expect(wrapper.get('.deletion-countdown').text()).toBe('完成后 7 天删除')
    await wrapper.get('.retention-option input').setValue(false)
    expect(wrapper.find('.deletion-countdown').exists()).toBe(false)
    await wrapper.get('.retention-option input').setValue(true)
    expect(wrapper.get('.deletion-countdown').text()).toBe('完成后 7 天删除')
  })

  it('resets the countdown within one edit and discards the reset on cancel', async () => {
    vi.useFakeTimers()
    const now = secondTodo.completedAt + 3 * 86400000
    vi.setSystemTime(now)
    const wrapper = await renderTodos()
    await wrapper.get('#todo-edit-2').trigger('click')
    expect(wrapper.get('.deletion-countdown').text()).toBe('4 天 00:00:00 后删除')
    await wrapper.get('.retention-option input').setValue(false)
    await wrapper.get('.retention-option input').setValue(true)
    expect(wrapper.get('.deletion-countdown').text()).toBe('7 天 00:00:00 后删除')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('.deletion-countdown').text()).toBe('6 天 23:59:59 后删除')
    expect(updateTodo).not.toHaveBeenCalled()
    await wrapper.get('.todo-editor button[type="button"]').trigger('click')
    await wrapper.get('#todo-edit-2').trigger('click')
    expect(wrapper.get('.deletion-countdown').text()).toBe('3 天 23:59:59 后删除')
  })

  it('uses the saved reset time for existing todos', async () => {
    const autoDeleteStartedAt = secondTodo.completedAt + 3 * 86400000
    vi.spyOn(Date, 'now').mockReturnValue(autoDeleteStartedAt + 86400000)
    vi.mocked(getTodos).mockResolvedValue([{ ...secondTodo, autoDeleteStartedAt }])
    const wrapper = await renderTodos()
    await wrapper.get('#todo-edit-2').trigger('click')
    expect(wrapper.get('.deletion-countdown').text()).toBe('6 天 00:00:00 后删除')
  })

  it('saves multiline edits without changing creation or completion timestamps', async () => {
    const content = '第一行\n```保留正文```\n  第二行'
    vi.mocked(updateTodo).mockResolvedValue({ ...secondTodo, content })
    const wrapper = await renderTodos()
    await wrapper.get('#todo-edit-2').trigger('click')
    await wrapper.get('#todo-edit-input').setValue(content)
    await wrapper.get('.todo-editor').trigger('submit')
    await flushPromises()
    expect(updateTodo).toHaveBeenCalledExactlyOnceWith(2, { content, autoDelete: true })
    expect(wrapper.findAll('.todo-content')[1]!.text()).toBe(content)
    expect(wrapper.get<HTMLInputElement>('#todo-complete-2').element.checked).toBe(true)
    expect(wrapper.get('.todo-group h3').text()).toBe('2026-11-03')
    expect(wrapper.find('.todo-editor').exists()).toBe(false)
  })

  it('keeps failed edits, rejects blank content, and supports cancel', async () => {
    vi.mocked(updateTodo).mockRejectedValueOnce(new Error('Storage full'))
    const wrapper = await renderTodos()
    await wrapper.get('#todo-edit-1').trigger('click')
    await wrapper.get('#todo-edit-input').setValue('修改后的内容')
    await wrapper.get('.todo-editor').trigger('submit')
    await flushPromises()
    expect(wrapper.get<HTMLTextAreaElement>('#todo-edit-input').element.value).toBe('修改后的内容')
    expect(wrapper.get('[role="alert"]').text()).toContain('编辑内容已保留')
    await wrapper.get('#todo-edit-input').setValue('  \n ')
    expect(
      wrapper.get<HTMLButtonElement>('.todo-editor button[type="submit"]').element.disabled,
    ).toBe(true)
    await wrapper.get('.todo-editor').trigger('submit')
    expect(updateTodo).toHaveBeenCalledTimes(1)
    await wrapper.get('.todo-editor button[type="button"]').trigger('click')
    expect(wrapper.get('.todo-content').text()).toBe('买牛奶')
  })

  it('only removes a todo after its deletion commits', async () => {
    vi.mocked(removeTodo)
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValueOnce()
    const wrapper = await renderTodos()
    await wrapper.get('.delete-button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.todo-item')).toHaveLength(2)
    expect(wrapper.get('[role="alert"]').text()).toContain('删除失败')
    await wrapper.get('.delete-button').trigger('click')
    await flushPromises()
    expect(removeTodo).toHaveBeenLastCalledWith(1)
    expect(wrapper.findAll('.todo-content').map((item) => item.text())).toEqual(['回复邮件'])
  })

  it('does not load a misleading list after failed cleanup and allows retrying', async () => {
    vi.mocked(clearExpiredTodos).mockRejectedValueOnce(new Error('Cleanup failed'))
    const wrapper = await renderTodos()
    expect(getTodos).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('无法读取或清理本地待办')
    await wrapper.get('.storage-error button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.todo-item')).toHaveLength(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('only runs cleanup on page entry, never on elapsed time or focus/visibility events', async () => {
    vi.useFakeTimers()
    const wrapper = await renderTodos()
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000)
    await vi.advanceTimersByTimeAsync(1000)
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(clearExpiredTodos).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.todo-item')).toHaveLength(2)
    wrapper.unmount()
    await renderTodos()
    expect(clearExpiredTodos).toHaveBeenCalledTimes(2)
  })
})
