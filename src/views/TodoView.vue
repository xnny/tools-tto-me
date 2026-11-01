<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { parseTodoInput } from '@/utils/todoParser'
import { addTodos, getTodos, removeTodo, updateTodo, type Todo } from '@/utils/todoStorage'

type TodoFilter = 'all' | 'active' | 'completed'

const filters: { value: TodoFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '未完成' },
  { value: 'completed', label: '已完成' },
]
const inputExample = [
  '买牛奶',
  '```',
  '准备周报',
  '  整理本周进展',
  '  列出下周计划',
  '```',
  '回复邮件',
].join('\n')

const todos = ref<Todo[]>([])
const inputValue = ref('')
const filter = ref<TodoFilter>('all')
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const addError = ref('')
const operationError = ref('')
const successMessage = ref('')
const editingId = ref<number | null>(null)
const editValue = ref('')
const busy = computed(() => loading.value || saving.value)
const activeCount = computed(() => todos.value.filter((todo) => !todo.completed).length)
const visibleTodos = computed(() =>
  todos.value.filter((todo) => {
    if (filter.value === 'active') return !todo.completed
    if (filter.value === 'completed') return todo.completed
    return true
  }),
)
const emptyMessage = computed(() => {
  if (filter.value === 'active') return '没有未完成的待办。'
  if (filter.value === 'completed') return '还没有已完成的待办。'
  return '还没有待办，从上方添加第一条吧。'
})

const loadTodos = async () => {
  loading.value = true
  loadError.value = ''
  try {
    todos.value = await getTodos()
  } catch {
    loadError.value = '无法读取本地待办，请检查浏览器是否允许本地存储后重试。'
  } finally {
    loading.value = false
  }
}

const clearAddMessages = () => {
  addError.value = ''
  successMessage.value = ''
}

const submitTodos = async () => {
  if (busy.value || loadError.value || editingId.value !== null) return

  clearAddMessages()
  const result = parseTodoInput(inputValue.value)
  if (result.error || result.items.length === 0) {
    addError.value = result.error ?? '请输入至少一条非空待办。'
    return
  }

  saving.value = true
  try {
    const added = await addTodos(result.items)
    todos.value.push(...added)
    inputValue.value = ''
    filter.value = 'all'
    successMessage.value = `已添加 ${added.length} 条待办。`
  } catch {
    addError.value = '待办保存失败，输入已保留，请重试。'
  } finally {
    saving.value = false
  }
}

const mutateTodo = async (action: () => Promise<void>, errorMessage: string) => {
  if (busy.value || loadError.value) return false

  saving.value = true
  operationError.value = ''
  successMessage.value = ''
  try {
    await action()
    return true
  } catch {
    operationError.value = errorMessage
    return false
  } finally {
    saving.value = false
  }
}

const replaceTodo = (updated: Todo) => {
  todos.value = todos.value.map((todo) => (todo.id === updated.id ? updated : todo))
}

const toggleTodo = async (todo: Todo, event: Event) => {
  // Keep the checkbox in its persisted state until the write commits.
  const checkbox = event.target as HTMLInputElement
  checkbox.checked = todo.completed
  await mutateTodo(async () => {
    replaceTodo(await updateTodo(todo.id, { completed: !todo.completed }))
  }, '完成状态保存失败，请重试。')
}

const deleteTodo = async (todo: Todo) => {
  await mutateTodo(async () => {
    await removeTodo(todo.id)
    todos.value = todos.value.filter((item) => item.id !== todo.id)
  }, '待办删除失败，请重试。')
}

const startEditing = async (todo: Todo) => {
  editingId.value = todo.id
  editValue.value = todo.content
  operationError.value = ''
  await nextTick()
  document.getElementById('todo-edit-input')?.focus()
}

const finishEditing = async () => {
  const id = editingId.value
  editingId.value = null
  editValue.value = ''
  operationError.value = ''
  await nextTick()
  document.getElementById(`todo-edit-${id}`)?.focus()
}

const saveEdit = async (todo: Todo) => {
  if (!editValue.value.trim()) {
    operationError.value = '待办内容不能为空。'
    return
  }

  const saved = await mutateTodo(async () => {
    replaceTodo(await updateTodo(todo.id, { content: editValue.value }))
  }, '待办修改保存失败，编辑内容已保留，请重试。')
  if (saved) await finishEditing()
}

onMounted(loadTodos)
</script>

<template>
  <main class="todo-page">
    <header class="page-heading">
      <p class="eyebrow">TODO</p>
      <h1>待办事项</h1>
      <p class="subtitle">记录要做的事。数据保存在当前浏览器，方便下次继续。</p>
    </header>

    <form class="composer card" aria-label="添加待办" @submit.prevent="submitTodos">
      <label for="todo-input" class="section-title">新增待办</label>
      <p id="todo-input-help" class="input-help">
        一行一条；用一对 <code>```</code> 包住正文，可添加一条多行待办。
      </p>
      <textarea
        id="todo-input"
        v-model="inputValue"
        rows="12"
        :placeholder="inputExample"
        :disabled="busy || editingId !== null"
        :aria-invalid="Boolean(addError)"
        :aria-describedby="addError ? 'todo-input-help todo-add-error' : 'todo-input-help'"
        @input="clearAddMessages"
      ></textarea>
      <p v-if="addError" id="todo-add-error" class="error-message" role="alert">{{ addError }}</p>
      <div class="composer-footer">
        <p class="save-message" role="status">{{ successMessage }}</p>
        <button
          type="submit"
          class="button primary-button"
          :disabled="busy || Boolean(loadError) || editingId !== null || !inputValue.trim()"
        >
          添加待办
        </button>
      </div>
    </form>

    <section class="todo-list-section" aria-labelledby="todo-list-heading" :aria-busy="busy">
      <div class="list-toolbar">
        <div class="list-heading">
          <h2 id="todo-list-heading">我的待办</h2>
          <span v-if="!loading && !loadError" class="todo-count">
            {{ activeCount }} 条未完成 · 共 {{ todos.length }} 条
          </span>
        </div>
        <div class="filters" role="group" aria-label="筛选待办">
          <button
            v-for="option in filters"
            :key="option.value"
            type="button"
            :aria-pressed="filter === option.value"
            :disabled="busy || editingId !== null"
            @click="filter = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div v-if="loadError" class="storage-error card">
        <p class="error-message" role="alert">{{ loadError }}</p>
        <button type="button" class="button" :disabled="busy" @click="loadTodos">重试加载</button>
      </div>
      <p v-else-if="loading" class="empty-state card" role="status">正在加载待办…</p>
      <template v-else>
        <p v-if="operationError" class="error-message" role="alert">{{ operationError }}</p>
        <ul v-if="visibleTodos.length" class="todo-list">
          <li
            v-for="todo in visibleTodos"
            :key="todo.id"
            class="todo-item card"
            :class="{ 'is-completed': todo.completed }"
          >
            <input
              :id="`todo-complete-${todo.id}`"
              type="checkbox"
              class="todo-checkbox"
              :checked="todo.completed"
              :disabled="busy || editingId !== null"
              :aria-label="`${todo.completed ? '恢复' : '完成'}待办：${todo.content}`"
              @change="toggleTodo(todo, $event)"
            />
            <form
              v-if="editingId === todo.id"
              class="todo-editor"
              aria-label="修改待办内容"
              @submit.prevent="saveEdit(todo)"
            >
              <label for="todo-edit-input" class="edit-label">编辑待办</label>
              <textarea
                id="todo-edit-input"
                v-model="editValue"
                rows="5"
                :disabled="saving"
              ></textarea>
              <div class="edit-actions">
                <button
                  type="submit"
                  class="button primary-button"
                  :disabled="saving || !editValue.trim()"
                >
                  保存修改
                </button>
                <button type="button" class="button" :disabled="saving" @click="finishEditing">
                  取消
                </button>
              </div>
            </form>
            <template v-else>
              <label :for="`todo-complete-${todo.id}`" class="todo-content">{{
                todo.content
              }}</label>
              <div class="todo-actions">
                <button
                  :id="`todo-edit-${todo.id}`"
                  type="button"
                  class="text-button"
                  :disabled="busy || editingId !== null"
                  :aria-label="`编辑待办：${todo.content}`"
                  @click="startEditing(todo)"
                >
                  编辑
                </button>
                <button
                  type="button"
                  class="text-button delete-button"
                  :disabled="busy || editingId !== null"
                  :aria-label="`删除待办：${todo.content}`"
                  @click="deleteTodo(todo)"
                >
                  删除
                </button>
              </div>
            </template>
          </li>
        </ul>
        <p v-else class="empty-state card">{{ emptyMessage }}</p>
      </template>
    </section>
  </main>
</template>

<style scoped>
.todo-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 36px 24px 48px;
}

.page-heading {
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
}

h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.4;
}

.subtitle,
.input-help {
  margin: 8px 0 0;
  color: var(--color-text-soft);
  font-size: 14px;
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.composer {
  padding: 24px;
  box-shadow: var(--shadow);
}

.section-title,
h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

code {
  padding: 2px 5px;
  background: var(--color-bg);
  border-radius: 4px;
  font-family: var(--font-mono);
}

textarea {
  display: block;
  width: 100%;
  min-height: 120px;
  margin-top: 16px;
  padding: 14px 16px;
  color: var(--color-text);
  background: #fbfcfe;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
}

textarea::placeholder {
  color: var(--color-text-muted);
}

textarea:focus-visible {
  outline-offset: 0;
}

textarea:disabled {
  opacity: 0.65;
}

.composer-footer,
.list-toolbar,
.list-heading,
.edit-actions,
.todo-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.composer-footer {
  justify-content: space-between;
  margin-top: 16px;
}

.save-message {
  margin: 0;
  color: var(--color-text-soft);
  font-size: 13px;
}

button {
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button {
  flex-shrink: 0;
  padding: 9px 16px;
  color: var(--color-text-soft);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-weight: 500;
}

.button:hover:not(:disabled) {
  background: var(--color-bg);
}

.primary-button {
  color: #fff;
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.primary-button:hover:not(:disabled) {
  background: #255fc6;
}

.todo-list-section {
  margin-top: 32px;
}

.list-toolbar {
  flex-wrap: wrap;
  justify-content: space-between;
  margin-bottom: 16px;
}

.list-heading {
  flex-wrap: wrap;
  gap: 8px 12px;
}

.todo-count {
  color: var(--color-text-soft);
  font-size: 12px;
}

.filters {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: #eaf0f7;
  border-radius: 9px;
}

.filters button {
  padding: 6px 12px;
  color: var(--color-text-soft);
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.filters button[aria-pressed='true'] {
  color: var(--color-primary);
  background: var(--color-surface);
  font-weight: 600;
}

.todo-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 20px;
}

.todo-checkbox {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin: 4px 0 0;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.todo-content {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.is-completed .todo-content {
  color: var(--color-text-muted);
  text-decoration: line-through;
}

.todo-actions {
  flex-shrink: 0;
  gap: 4px;
}

.text-button {
  padding: 3px 8px;
  color: var(--color-text-soft);
  background: transparent;
  border: 0;
  border-radius: 5px;
}

.text-button:hover:not(:disabled) {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.delete-button:hover:not(:disabled) {
  color: #b42318;
  background: #fff1f0;
}

.todo-editor {
  flex: 1;
  min-width: 0;
}

.edit-label {
  font-size: 13px;
  font-weight: 500;
}

.todo-editor textarea {
  margin-top: 8px;
}

.edit-actions {
  margin-top: 12px;
}

.empty-state {
  margin: 0;
  padding: 40px 20px;
  color: var(--color-text-soft);
  text-align: center;
  font-size: 14px;
}

.storage-error {
  padding: 20px;
}

.error-message {
  margin: 12px 0;
  color: #b42318;
  font-size: 13px;
}

.storage-error .error-message {
  margin-top: 0;
}

@media (max-width: 700px) {
  .todo-page {
    padding: 24px 16px 32px;
  }

  h1 {
    font-size: 24px;
  }

  .composer {
    padding: 18px 16px;
  }

  .todo-item {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 10px 12px;
    padding: 16px;
  }

  .todo-actions {
    grid-column: 2;
    justify-content: flex-end;
  }
}
</style>
