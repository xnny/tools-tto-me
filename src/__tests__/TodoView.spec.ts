import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TodoView from '../views/TodoView.vue'
import { addTodos, getTodos, removeTodo, updateTodo, type Todo } from '../utils/todoStorage'

vi.mock('../utils/todoStorage', () => ({
  addTodos: vi.fn<typeof addTodos>(),
  getTodos: vi.fn<typeof getTodos>(),
  removeTodo: vi.fn<typeof removeTodo>(),
  updateTodo: vi.fn<typeof updateTodo>(),
}))

enableAutoUnmount(afterEach)

const firstTodo: Todo = { id: 1, content: '买牛奶', completed: false, createdAt: 1 }
const secondTodo: Todo = { id: 2, content: '回复邮件', completed: true, createdAt: 2 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getTodos).mockResolvedValue([{ ...firstTodo }, { ...secondTodo }])
})

const renderTodos = async () => {
  const wrapper = mount(TodoView)
  await flushPromises()
  return wrapper
}

describe('todo page', () => {
  it('filters todos without changing their insertion order', async () => {
    const wrapper = await renderTodos()
    const content = () => wrapper.findAll('.todo-content').map((item) => item.text())

    expect(content()).toEqual(['买牛奶', '回复邮件'])
    expect(wrapper.get('.todo-count').text()).toBe('1 条未完成 · 共 2 条')
    await wrapper.get('.filters button:nth-child(2)').trigger('click')
    expect(content()).toEqual(['买牛奶'])
    await wrapper.get('.filters button:nth-child(3)').trigger('click')
    expect(content()).toEqual(['回复邮件'])
    await wrapper.get('.filters button:nth-child(1)').trigger('click')
    expect(content()).toEqual(['买牛奶', '回复邮件'])
  })

  it('adds a mixed batch, shows it in the all filter, and clears committed input', async () => {
    vi.mocked(addTodos).mockResolvedValue([
      { id: 3, content: '采购', completed: false, createdAt: 3 },
      { id: 4, content: '周报\n  进展', completed: false, createdAt: 3 },
    ])
    const wrapper = await renderTodos()
    await wrapper.get('.filters button:nth-child(3)').trigger('click')
    await wrapper.get('#todo-input').setValue('采购\n```\n周报\n  进展\n```')
    await wrapper.get('.composer').trigger('submit')
    await flushPromises()

    expect(addTodos).toHaveBeenCalledExactlyOnceWith(['采购', '周报\n  进展'])
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe('')
    expect(wrapper.findAll('.todo-content').map((item) => item.text())).toEqual([
      '买牛奶',
      '回复邮件',
      '采购',
      '周报\n  进展',
    ])
    expect(wrapper.get('[role="status"]').text()).toBe('已添加 2 条待办。')
  })

  it('keeps the entire input when a fence is unclosed and does not save partial items', async () => {
    const wrapper = await renderTodos()
    const input = '正常待办\n```\n未闭合的待办'
    await wrapper.get('#todo-input').setValue(input)
    await wrapper.get('.composer').trigger('submit')

    expect(addTodos).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('尚未闭合')
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe(input)
    expect(wrapper.findAll('.todo-item')).toHaveLength(2)
  })

  it('preserves input on a failed batch and allows retrying it', async () => {
    vi.mocked(addTodos)
      .mockRejectedValueOnce(new Error('Storage full'))
      .mockResolvedValueOnce([{ id: 3, content: '新待办', completed: false, createdAt: 3 }])
    const wrapper = await renderTodos()
    await wrapper.get('#todo-input').setValue('新待办')
    await wrapper.get('.composer').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('输入已保留')
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe('新待办')
    expect(wrapper.findAll('.todo-item')).toHaveLength(2)

    await wrapper.get('.composer').trigger('submit')
    await flushPromises()
    expect(wrapper.findAll('.todo-item')).toHaveLength(3)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('disables inputs and ignores duplicate submissions until the batch commits', async () => {
    let commit!: (todos: Todo[]) => void
    vi.mocked(addTodos).mockReturnValue(
      new Promise((resolve) => {
        commit = resolve
      }),
    )
    const wrapper = await renderTodos()
    await wrapper.get('#todo-input').setValue('新待办')
    await wrapper.get('.composer').trigger('submit')

    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.disabled).toBe(true)
    expect(wrapper.get<HTMLButtonElement>('.composer button').element.disabled).toBe(true)
    expect(wrapper.findAll('.todo-item')).toHaveLength(2)
    await wrapper.get('.composer').trigger('submit')
    expect(addTodos).toHaveBeenCalledTimes(1)

    commit([{ id: 3, content: '新待办', completed: false, createdAt: 3 }])
    await flushPromises()
    expect(wrapper.findAll('.todo-item')).toHaveLength(3)
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.disabled).toBe(false)
  })

  it('keeps the checkbox in its saved state when completion fails', async () => {
    vi.mocked(updateTodo).mockRejectedValueOnce(new Error('Storage unavailable'))
    const wrapper = await renderTodos()
    await wrapper.get('#todo-complete-1').setValue(true)
    await flushPromises()

    expect(updateTodo).toHaveBeenCalledExactlyOnceWith(1, { completed: true })
    expect(wrapper.get<HTMLInputElement>('#todo-complete-1').element.checked).toBe(false)
    expect(wrapper.get('.todo-count').text()).toBe('1 条未完成 · 共 2 条')
    expect(wrapper.get('[role="alert"]').text()).toContain('完成状态保存失败')
  })

  it('saves edited multiline content as one todo without parsing fences', async () => {
    const content = '第一行\n```保留正文```\n  第二行'
    vi.mocked(updateTodo).mockResolvedValue({ ...firstTodo, content })
    const wrapper = await renderTodos()
    await wrapper.get('#todo-edit-1').trigger('click')
    await wrapper.get('#todo-edit-input').setValue(content)
    await wrapper.get('.todo-editor').trigger('submit')
    await flushPromises()

    expect(updateTodo).toHaveBeenCalledExactlyOnceWith(1, { content })
    expect(wrapper.get('.todo-content').text()).toBe(content)
    expect(wrapper.findAll('.todo-item')).toHaveLength(2)
    expect(wrapper.find('.todo-editor').exists()).toBe(false)
  })

  it('keeps failed edits for retrying, rejects blank content, and supports cancel', async () => {
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

  it('keeps a todo when deletion fails and removes it after a successful retry', async () => {
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

  it('shows a load error and allows retrying without clearing the composer', async () => {
    vi.mocked(getTodos).mockRejectedValueOnce(new Error('Storage unavailable'))
    const wrapper = await renderTodos()
    expect(wrapper.get('[role="alert"]').text()).toContain('无法读取本地待办')
    await wrapper.get('#todo-input').setValue('尚未保存')
    expect(wrapper.get<HTMLButtonElement>('.composer button').element.disabled).toBe(true)

    await wrapper.get('.storage-error button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.todo-item')).toHaveLength(2)
    expect(wrapper.get<HTMLTextAreaElement>('#todo-input').element.value).toBe('尚未保存')
    expect(wrapper.get<HTMLButtonElement>('.composer button').element.disabled).toBe(false)
  })
})
