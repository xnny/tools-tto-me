import { enableAutoUnmount, flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TodoView from '../views/TodoView.vue'
import { addTodos, clearExpiredTodos, type Todo } from '../utils/todoStorage'

vi.mock('../utils/todoStorage', () => ({
  addTodos: vi.fn<typeof addTodos>(),
  clearExpiredTodos: vi.fn<typeof clearExpiredTodos>(),
}))

enableAutoUnmount(afterEach)

const DRAFT_KEY = 'tto-tools-todo-draft'
const newTodo: Todo = {
  id: 1,
  content: '新待办',
  createdAt: 1,
  completedAt: 0,
  autoDelete: true,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  localStorage.clear()
  vi.mocked(clearExpiredTodos).mockResolvedValue()
  vi.mocked(addTodos).mockResolvedValue([{ ...newTodo }])
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const renderComposer = async () => {
  const wrapper = mount(TodoView, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  return wrapper
}

describe('todo composer', () => {
  it('saves the exact draft after one idle second, restarting the debounce after input', async () => {
    const wrapper = await renderComposer()
    const draft = '第一行\n```\n  缩进内容\n```\n'
    await wrapper.get('#todo-input').setValue('第一行')
    await vi.advanceTimersByTimeAsync(999)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    await wrapper.get('#todo-input').setValue(draft)
    await vi.advanceTimersByTimeAsync(999)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(localStorage.getItem(DRAFT_KEY)).toBe(draft)
    expect(wrapper.get('.draft-status').text()).toContain('草稿已保存')
    expect(addTodos).not.toHaveBeenCalled()
    expect(wrapper.find('.todo-list-section').exists()).toBe(false)
    expect(wrapper.find('.page-heading .subtitle').exists()).toBe(false)
    expect(wrapper.find('.input-help').exists()).toBe(false)
    expect(wrapper.find('.footnote').exists()).toBe(false)
  })

  it('restores a draft and removes it when the input is cleared', async () => {
    const draft = '  尚未提交\n第二行\n'
    localStorage.setItem(DRAFT_KEY, draft)
    const wrapper = await renderComposer()
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe(draft)
    await wrapper.get('#todo-input').setValue('')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    await vi.advanceTimersByTimeAsync(1000)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('flushes pending input on unmount and removes its listeners and timer', async () => {
    const wrapper = await renderComposer()
    const write = vi.spyOn(Storage.prototype, 'setItem')
    await wrapper.get('#todo-input').setValue('离开前的草稿')
    wrapper.unmount()
    expect(localStorage.getItem(DRAFT_KEY)).toBe('离开前的草稿')
    window.dispatchEvent(new Event('pagehide'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('flushes on page hide or backgrounding without running cleanup again', async () => {
    const wrapper = await renderComposer()
    await wrapper.get('#todo-input').setValue('刷新前的草稿')
    window.dispatchEvent(new Event('pagehide'))
    expect(localStorage.getItem(DRAFT_KEY)).toBe('刷新前的草稿')
    await wrapper.get('#todo-input').setValue('后台草稿')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(localStorage.getItem(DRAFT_KEY)).toBe('后台草稿')
    await vi.advanceTimersByTimeAsync(8 * 24 * 60 * 60 * 1000)
    expect(clearExpiredTodos).toHaveBeenCalledTimes(1)
  })

  it('adds a mixed batch and clears the draft without a stale timer writing it back', async () => {
    vi.mocked(addTodos).mockResolvedValue([
      { ...newTodo, content: '采购' },
      { ...newTodo, id: 2, content: '周报\n  进展' },
    ])
    const wrapper = await renderComposer()
    await wrapper.get('#todo-input').setValue('采购\n```\n周报\n  进展\n```')
    await wrapper.get('.composer').trigger('submit')
    await flushPromises()
    expect(addTodos).toHaveBeenCalledExactlyOnceWith(['采购', '周报\n  进展'])
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe('')
    expect(wrapper.get('.save-message').text()).toBe('已添加 2 条待办。')
    await vi.advanceTimersByTimeAsync(1000)
    wrapper.unmount()
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('keeps malformed input in the draft without partially adding it', async () => {
    const wrapper = await renderComposer()
    const draft = '正常待办\n```\n未闭合的待办'
    await wrapper.get('#todo-input').setValue(draft)
    await wrapper.get('.composer').trigger('submit')
    expect(addTodos).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('尚未闭合')
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe(draft)
    expect(localStorage.getItem(DRAFT_KEY)).toBe(draft)
  })

  it('preserves a failed submission for retrying', async () => {
    vi.mocked(addTodos).mockRejectedValueOnce(new Error('Storage full'))
    const wrapper = await renderComposer()
    await wrapper.get('#todo-input').setValue('新待办')
    await wrapper.get('.composer').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('输入已保留')
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe('新待办')
    expect(localStorage.getItem(DRAFT_KEY)).toBe('新待办')
    await wrapper.get('.composer').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.save-message').text()).toBe('已添加 1 条待办。')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('disables input and ignores duplicate submissions until the batch commits', async () => {
    let commit!: (todos: Todo[]) => void
    vi.mocked(addTodos).mockReturnValue(
      new Promise((resolve) => {
        commit = resolve
      }),
    )
    const wrapper = await renderComposer()
    await wrapper.get('#todo-input').setValue('新待办')
    await wrapper.get('.composer').trigger('submit')
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.disabled).toBe(true)
    expect(wrapper.get<HTMLButtonElement>('.composer button').element.disabled).toBe(true)
    await wrapper.get('.composer').trigger('submit')
    expect(addTodos).toHaveBeenCalledTimes(1)
    commit([{ ...newTodo }])
    await flushPromises()
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.disabled).toBe(false)
  })

  it('shows storage initialization errors and retries without losing input', async () => {
    vi.mocked(clearExpiredTodos).mockRejectedValueOnce(new Error('Storage unavailable'))
    const wrapper = await renderComposer()
    expect(wrapper.get('[role="alert"]').text()).toContain('无法读取或清理本地待办')
    await wrapper.get('#todo-input').setValue('尚未保存')
    expect(wrapper.get<HTMLButtonElement>('.composer button').element.disabled).toBe(true)
    await wrapper.get('.storage-error button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe('尚未保存')
    expect(wrapper.get<HTMLButtonElement>('.composer button').element.disabled).toBe(false)
  })

  it('allows adding todos when localStorage reads or writes fail', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Full')
    })
    const wrapper = await renderComposer()
    expect(wrapper.get('[role="alert"]').text()).toContain('无法读取本地草稿')
    await wrapper.get('#todo-input').setValue('新待办')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('[role="alert"]').text()).toContain('草稿保存失败')
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe('新待办')
    await wrapper.get('.composer').trigger('submit')
    await flushPromises()
    expect(addTodos).toHaveBeenCalledExactlyOnceWith(['新待办'])
    expect(wrapper.get('.save-message').text()).toBe('已添加 1 条待办。')
  })

  it('does not report a committed batch as failed when removing its draft fails', async () => {
    const wrapper = await renderComposer()
    await wrapper.get('#todo-input').setValue('新待办')
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    await wrapper.get('.composer').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.save-message').text()).toBe('已添加 1 条待办。')
    expect(wrapper.get('[role="alert"]').text()).toContain('草稿保存失败')
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe('')
    expect(addTodos).toHaveBeenCalledTimes(1)
  })

  it('submits todos with Command+Return or Ctrl+Enter in the textarea', async () => {
    const wrapper = await renderComposer()
    const input = wrapper.get('#todo-input')

    await input.setValue('快捷键待办 1')
    await input.trigger('keydown', { key: 'Enter' })
    await input.trigger('keydown', { key: 'Enter', shiftKey: true })
    await input.trigger('keydown', { key: 'Enter', altKey: true })
    await input.trigger('keydown', { key: 'Enter', metaKey: true, shiftKey: true })
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true, isComposing: true })
    expect(addTodos).not.toHaveBeenCalled()

    await input.trigger('keydown', { key: 'Enter', metaKey: true })
    await flushPromises()
    expect(addTodos).toHaveBeenCalledExactlyOnceWith(['快捷键待办 1'])
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe('')

    await input.setValue('快捷键待办 2')
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()
    expect(addTodos).toHaveBeenCalledTimes(2)
    expect(addTodos).toHaveBeenLastCalledWith(['快捷键待办 2'])
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe('')
  })
})
