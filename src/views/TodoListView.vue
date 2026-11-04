<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { clearExpiredTodos, getTodos, removeTodo, updateTodo, type Todo } from '@/utils/todoStorage'

type TodoFilter = 'all' | 'active' | 'completed'

const filters: { value: TodoFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '未完成' },
  { value: 'completed', label: '已完成' },
]
const todos = ref<Todo[]>([])
const filter = ref<TodoFilter>('all')
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const operationError = ref('')
const editingId = ref(0)
const editValue = ref('')
const busy = computed(() => loading.value || saving.value)
const activeCount = computed(() => todos.value.filter((todo) => todo.completedAt === 0).length)
const todoGroups = computed(() => {
  const groups = new Map<string, Todo[]>()
  for (const todo of todos.value) {
    if (filter.value === 'active' && todo.completedAt > 0) continue
    if (filter.value === 'completed' && todo.completedAt === 0) continue

    const created = new Date(todo.createdAt)
    const date = [
      created.getFullYear(),
      String(created.getMonth() + 1).padStart(2, '0'),
      String(created.getDate()).padStart(2, '0'),
    ].join('-')
    const group = groups.get(date)
    if (group) group.push(todo)
    else groups.set(date, [todo])
  }
  return Array.from(groups, ([date, todos]) => ({ date, todos })).sort((a, b) =>
    b.date.localeCompare(a.date),
  )
})
const emptyMessage = computed(() => {
  if (filter.value === 'active') return '没有未完成的待办。'
  if (filter.value === 'completed') return '还没有已完成的待办。'
  return '还没有待办，去新增第一条吧。'
})

const loadTodos = async () => {
  loading.value = true
  loadError.value = ''
  try {
    await clearExpiredTodos()
    todos.value = await getTodos()
  } catch {
    loadError.value = '无法读取或清理本地待办，请检查浏览器是否允许本地存储后重试。'
  } finally {
    loading.value = false
  }
}

const mutateTodo = async (action: () => Promise<void>, errorMessage: string) => {
  if (busy.value || loadError.value) return false

  saving.value = true
  operationError.value = ''
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
  checkbox.checked = todo.completedAt > 0
  await mutateTodo(async () => {
    replaceTodo(await updateTodo(todo.id, { completedAt: todo.completedAt > 0 ? 0 : Date.now() }))
  }, '完成状态保存失败，请重试。')
}

const toggleRetention = async (todo: Todo, event: Event) => {
  const checkbox = event.target as HTMLInputElement
  checkbox.checked = !todo.autoDelete
  await mutateTodo(async () => {
    replaceTodo(await updateTodo(todo.id, { autoDelete: !todo.autoDelete }))
  }, '自动删除设置保存失败，请重试。')
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
  editingId.value = 0
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
      <h1>我的待办</h1>
      <nav class="todo-nav" aria-label="待办导航">
        <RouterLink to="/todo">新增待办</RouterLink>
        <RouterLink to="/todo/list">我的待办</RouterLink>
      </nav>
    </header>

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
            :disabled="busy || editingId !== 0"
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
        <div v-if="todoGroups.length">
          <section
            v-for="group in todoGroups"
            :key="group.date"
            class="todo-group"
            :aria-labelledby="`todo-date-${group.date}`"
          >
            <h3 :id="`todo-date-${group.date}`">{{ group.date }}</h3>
            <ul class="todo-list">
              <li
                v-for="todo in group.todos"
                :key="todo.id"
                class="todo-item card"
                :class="{ 'is-completed': todo.completedAt > 0 }"
              >
                <input
                  :id="`todo-complete-${todo.id}`"
                  type="checkbox"
                  class="todo-checkbox"
                  :checked="todo.completedAt > 0"
                  :disabled="busy || editingId !== 0"
                  :aria-label="`${todo.completedAt > 0 ? '恢复' : '完成'}待办：${todo.content}`"
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
                    <label class="retention-option">
                      <input
                        type="checkbox"
                        :checked="!todo.autoDelete"
                        :disabled="busy || editingId !== 0"
                        :aria-label="`不自动删除：${todo.content}`"
                        @change="toggleRetention(todo, $event)"
                      />
                      不自动删除
                    </label>
                    <button
                      :id="`todo-edit-${todo.id}`"
                      type="button"
                      class="text-button"
                      :disabled="busy || editingId !== 0"
                      :aria-label="`编辑待办：${todo.content}`"
                      @click="startEditing(todo)"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      class="text-button delete-button"
                      :disabled="busy || editingId !== 0"
                      :aria-label="`删除待办：${todo.content}`"
                      @click="deleteTodo(todo)"
                    >
                      删除
                    </button>
                  </div>
                </template>
              </li>
            </ul>
          </section>
        </div>
        <p v-else class="empty-state card">{{ emptyMessage }}</p>
      </template>
    </section>

    <p class="footnote">完成满 7 天后，在下次打开或刷新页面时自动删除，也可逐条设置保留。</p>
  </main>
</template>

<style scoped src="@/assets/todo.css"></style>
