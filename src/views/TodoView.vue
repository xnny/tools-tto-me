<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { parseTodoInput } from '@/utils/todoParser'
import { addTodos, clearExpiredTodos } from '@/utils/todoStorage'

const DRAFT_KEY = 'tto-tools-todo-draft'
const inputExample = [
  '买牛奶',
  '```',
  '准备周报',
  '  整理本周进展',
  '  列出下周计划',
  '```',
  '回复邮件',
].join('\n')

const inputValue = ref('')
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const addError = ref('')
const draftError = ref('')
const draftStatus = ref('')
const successMessage = ref('')
let draftTimer: ReturnType<typeof setTimeout> | undefined
let draftDirty = false

const saveDraft = () => {
  clearTimeout(draftTimer)
  if (!draftDirty) return

  try {
    if (inputValue.value) localStorage.setItem(DRAFT_KEY, inputValue.value)
    else localStorage.removeItem(DRAFT_KEY)
    draftDirty = false
    draftError.value = ''
    draftStatus.value = inputValue.value ? '草稿已保存到本地。' : ''
  } catch {
    draftStatus.value = ''
    draftError.value = '草稿保存失败，请检查浏览器是否允许本地存储。仍可尝试添加待办。'
  }
}

const handleInput = () => {
  addError.value = ''
  successMessage.value = ''
  draftStatus.value = '等待保存草稿…'
  draftDirty = true
  clearTimeout(draftTimer)
  if (inputValue.value) draftTimer = setTimeout(saveDraft, 1000)
  else saveDraft()
}

const initializeStorage = async () => {
  loading.value = true
  loadError.value = ''
  try {
    await clearExpiredTodos()
  } catch {
    loadError.value = '无法读取或清理本地待办，请检查浏览器是否允许本地存储后重试。'
  } finally {
    loading.value = false
  }
}

const submitTodos = async () => {
  if (loading.value || saving.value || loadError.value) return

  addError.value = ''
  successMessage.value = ''
  saveDraft()
  const result = parseTodoInput(inputValue.value)
  if (result.error || result.items.length === 0) {
    addError.value = result.error ?? '请输入至少一条非空待办。'
    return
  }

  saving.value = true
  try {
    const added = await addTodos(result.items)
    inputValue.value = ''
    draftDirty = true
    saveDraft()
    successMessage.value = `已添加 ${added.length} 条待办。`
  } catch {
    addError.value = '待办保存失败，输入已保留，请重试。'
  } finally {
    saving.value = false
  }
}

const saveHiddenDraft = () => {
  if (document.visibilityState === 'hidden') saveDraft()
}

onMounted(() => {
  try {
    inputValue.value = localStorage.getItem(DRAFT_KEY) ?? ''
    if (inputValue.value) draftStatus.value = '已恢复本地草稿。'
  } catch {
    draftError.value = '无法读取本地草稿，仍可输入并添加待办。'
  }
  window.addEventListener('pagehide', saveDraft)
  document.addEventListener('visibilitychange', saveHiddenDraft)
  void initializeStorage()
})

onBeforeUnmount(() => {
  saveDraft()
  window.removeEventListener('pagehide', saveDraft)
  document.removeEventListener('visibilitychange', saveHiddenDraft)
})
</script>

<template>
  <main class="todo-page">
    <header class="page-heading">
      <p class="eyebrow">TODO</p>
      <h1>待办事项</h1>
      <p class="subtitle">记录要做的事。停止输入 1 秒后自动保存草稿，点击添加后成为正式待办。</p>
      <nav class="todo-nav" aria-label="待办导航">
        <RouterLink to="/todo">新增待办</RouterLink>
        <RouterLink to="/todo/list">我的待办</RouterLink>
      </nav>
    </header>

    <div v-if="loadError" class="storage-error card">
      <p class="error-message" role="alert">{{ loadError }}</p>
      <button type="button" class="button" :disabled="loading" @click="initializeStorage">
        重试加载
      </button>
    </div>

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
        :disabled="saving"
        :aria-invalid="Boolean(addError)"
        :aria-describedby="addError ? 'todo-input-help todo-add-error' : 'todo-input-help'"
        @input="handleInput"
      ></textarea>
      <p class="draft-status" role="status">{{ draftStatus }}</p>
      <p v-if="draftError" class="error-message" role="alert">{{ draftError }}</p>
      <p v-if="addError" id="todo-add-error" class="error-message" role="alert">{{ addError }}</p>
      <div class="composer-footer">
        <div>
          <p class="save-message" role="status">{{ successMessage }}</p>
          <RouterLink v-if="successMessage" to="/todo/list">查看我的待办 →</RouterLink>
        </div>
        <button
          type="submit"
          class="button primary-button"
          :disabled="loading || saving || Boolean(loadError) || !inputValue.trim()"
        >
          添加待办
        </button>
      </div>
    </form>
  </main>
</template>

<style scoped src="@/assets/todo.css"></style>
