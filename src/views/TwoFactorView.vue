<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useVisibleInterval } from '@/composables/useVisibleInterval'
import {
  createTotpStateReader,
  exportTotpRecords,
  getTotpState,
  parseTotpInput,
  validateTotpConfig,
  type TotpConfig,
  type TotpRecord,
} from '@/utils/twoFactor'
import {
  addTwoFactorRecord,
  getTwoFactorRecords,
  removeTwoFactorRecord,
} from '@/utils/twoFactorStorage'
import { createTwoFactorQr, readTwoFactorQr } from '@/utils/twoFactorQr'

const defaultForm = (): TotpConfig => ({
  issuer: '',
  label: '',
  secret: '',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
})
const form = reactive(defaultForm())
const inputValue = ref('')
const activeTab = ref<'manual' | 'qr'>('manual')
const dragging = ref(false)
const records = ref<TotpRecord[]>([])
const loading = ref(true)
const saving = ref(false)
const scanning = ref(false)
const advancedOpen = ref(false)
const loadError = ref('')
const formError = ref('')
const operationError = ref('')
const formMessage = ref('')
const operationMessage = ref('')
type SecretQrState =
  { status: 'loading' } | { status: 'ready'; src: string } | { status: 'error'; message: string }
const secretQrStates = reactive(new Map<number, SecretQrState>())
const secretQrRequests = new Map<number, symbol>()
const activeQrRecordId = ref<number | null>(null)
const copiedStates = reactive(new Map<string, ReturnType<typeof setTimeout>>())
const now = ref(Date.now())
const storageBusy = computed(() => loading.value || saving.value || Boolean(loadError.value))
const activeQrRecord = computed(
  () => records.value.find((record) => record.id === activeQrRecordId.value) ?? null,
)
const activeQrState = computed(() =>
  activeQrRecord.value ? (secretQrStates.get(activeQrRecord.value.id) ?? null) : null,
)
const recordReaders = computed(() =>
  records.value.map((record) => {
    try {
      return { record, readState: createTotpStateReader(record) }
    } catch {
      return { record, readState: null }
    }
  }),
)
const invalidState = {
  code: '',
  remaining: 0,
  error: '无法生成验证码，请删除后重新添加。',
}
const displayedRecords = computed(() =>
  recordReaders.value.map(({ record, readState }) => {
    if (!readState) return { record, ...invalidState }
    try {
      return {
        record,
        ...readState(now.value),
        error: '',
      }
    } catch {
      return { record, ...invalidState }
    }
  }),
)

let active = true
let inputRevision = 0
const downloadCleanup = new Map<string, ReturnType<typeof setTimeout>>()

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const inputChanged = () => {
  inputRevision += 1
  scanning.value = false
  formError.value = ''
  formMessage.value = ''
}

const applyParsedInput = (input: string) => {
  const parsed = parseTotpInput(input, form)
  Object.assign(form, parsed)
  inputValue.value = parsed.secret
  advancedOpen.value = parsed.algorithm !== 'SHA1' || parsed.digits !== 6 || parsed.period !== 30
}

const readInput = () => {
  if (saving.value || scanning.value) return
  formError.value = ''
  formMessage.value = ''
  try {
    applyParsedInput(inputValue.value)
    formMessage.value = '已读取密钥，请确认账号信息后添加。'
  } catch (error) {
    formError.value = errorMessage(error, '无法读取密钥，请检查输入。')
  }
}

const readUriOnChange = () => {
  if (inputValue.value.trim().includes('://')) readInput()
}

const processScreenshotFile = async (file: File) => {
  if (saving.value) return
  inputChanged()
  const revision = inputRevision
  scanning.value = true
  try {
    const decoded = await readTwoFactorQr(file)
    if (!active || revision !== inputRevision) return
    applyParsedInput(decoded)
    formMessage.value = '已识别二维码，请确认账号信息后添加。'
  } catch (error) {
    if (active && revision === inputRevision) {
      formError.value = errorMessage(error, '二维码识别失败，请换一张清晰的截图。')
    }
  } finally {
    if (active && revision === inputRevision) scanning.value = false
  }
}

const readScreenshot = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await processScreenshotFile(file)
}

const onDragEnter = () => {
  if (!saving.value) dragging.value = true
}

const onDragOver = () => {
  if (!saving.value) dragging.value = true
}

const onDragLeave = (event: DragEvent) => {
  const currentTarget = event.currentTarget as HTMLElement | null
  const relatedTarget = event.relatedTarget as Node | null
  if (!currentTarget || !relatedTarget || !currentTarget.contains(relatedTarget)) {
    dragging.value = false
  }
}

const onDropScreenshot = (event: DragEvent) => {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) void processScreenshotFile(file)
}

const extractClipboardFile = (clipboardData: DataTransfer | null): File | undefined => {
  if (!clipboardData) return undefined
  for (const item of Array.from(clipboardData.items ?? [])) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return clipboardData.files?.[0]
}

const onPasteScreenshot = (event: ClipboardEvent) => {
  if (saving.value || event.defaultPrevented) return
  const file = extractClipboardFile(event.clipboardData)
  if (!file) return
  event.preventDefault()
  activeTab.value = 'qr'
  void processScreenshotFile(file)
}

const onDocumentPaste = (event: ClipboardEvent) => {
  if (activeTab.value !== 'qr') return
  onPasteScreenshot(event)
}

const loadRecords = async () => {
  if (saving.value) return
  loading.value = true
  loadError.value = ''
  try {
    const loaded = await getTwoFactorRecords()
    if (active) records.value = loaded
  } catch {
    if (active) loadError.value = '无法读取本地密钥，请检查浏览器是否允许本地存储后重试。'
  } finally {
    if (active) loading.value = false
  }
}

const addRecord = async () => {
  if (storageBusy.value || scanning.value) return
  formError.value = ''
  formMessage.value = ''
  let config: TotpConfig
  try {
    config = validateTotpConfig(parseTotpInput(inputValue.value, form))
  } catch (error) {
    formError.value = errorMessage(error, '请检查密钥和账号信息。')
    return
  }

  saving.value = true
  try {
    const added = await addTwoFactorRecord(config)
    if (!active) return
    records.value = [added, ...records.value]
    inputValue.value = ''
    Object.assign(form, defaultForm())
    advancedOpen.value = false
    now.value = Date.now()
    formMessage.value = '已添加 1 条密钥。'
  } catch {
    if (active) formError.value = '密钥保存失败，输入已保留，请重试。'
  } finally {
    if (active) saving.value = false
  }
}

const hideSecretQr = (id?: number) => {
  const targetId = id ?? activeQrRecordId.value
  if (targetId === null || targetId === undefined) return
  secretQrRequests.delete(targetId)
  secretQrStates.delete(targetId)
  if (activeQrRecordId.value === targetId) activeQrRecordId.value = null
}

const showSecretQr = async (record: TotpRecord) => {
  if (activeQrRecordId.value !== null && activeQrRecordId.value !== record.id) {
    hideSecretQr(activeQrRecordId.value)
  }
  activeQrRecordId.value = record.id
  const request = Symbol()
  secretQrRequests.set(record.id, request)
  secretQrStates.set(record.id, { status: 'loading' })
  try {
    const src = await createTwoFactorQr(record)
    if (active && secretQrRequests.get(record.id) === request) {
      secretQrStates.set(record.id, { status: 'ready', src })
    }
  } catch (error) {
    if (active && secretQrRequests.get(record.id) === request) {
      secretQrStates.set(record.id, {
        status: 'error',
        message: errorMessage(error, '二维码生成失败，请重试。'),
      })
    }
  }
}

const toggleSecret = (record: TotpRecord) => {
  if (activeQrRecordId.value === record.id && secretQrStates.has(record.id)) {
    hideSecretQr(record.id)
  } else {
    void showSecretQr(record)
  }
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && activeQrRecordId.value !== null) {
    hideSecretQr()
  }
}

const clearCopiedState = (key: string) => {
  const timerId = copiedStates.get(key)
  if (timerId !== undefined) {
    clearTimeout(timerId)
    copiedStates.delete(key)
  }
}

const markCopied = (id: number, kind: 'secret' | 'code') => {
  const key = `${id}:${kind}`
  clearCopiedState(key)
  copiedStates.set(
    key,
    setTimeout(() => {
      copiedStates.delete(key)
    }, 1500),
  )
}

const isCopied = (id: number, kind: 'secret' | 'code') => copiedStates.has(`${id}:${kind}`)

const copyValue = async (record: TotpRecord, kind: 'secret' | 'code') => {
  operationError.value = ''
  operationMessage.value = ''
  try {
    const value = kind === 'secret' ? record.secret : getTotpState(record, Date.now()).code
    await navigator.clipboard.writeText(value)
    if (active) markCopied(record.id, kind)
  } catch {
    if (active) operationError.value = '复制失败，请允许剪贴板访问或手动复制。'
  }
}

const deleteRecord = async (record: TotpRecord) => {
  if (storageBusy.value) return
  if (!window.confirm(`确定删除“${record.label}”的密钥？请确认已保留备份或其他登录方式。`)) return
  operationError.value = ''
  operationMessage.value = ''
  saving.value = true
  try {
    await removeTwoFactorRecord(record.id)
    if (!active) return
    records.value = records.value.filter((item) => item.id !== record.id)
    hideSecretQr(record.id)
    clearCopiedState(`${record.id}:code`)
    clearCopiedState(`${record.id}:secret`)
    operationMessage.value = '已删除密钥。'
  } catch {
    if (active) operationError.value = '密钥删除失败，请重试。'
  } finally {
    if (active) saving.value = false
  }
}

const releaseDownload = (url: string) => {
  clearTimeout(downloadCleanup.get(url))
  downloadCleanup.delete(url)
  URL.revokeObjectURL(url)
}

const exportRecords = () => {
  if (storageBusy.value || records.value.length === 0) return
  operationError.value = ''
  operationMessage.value = ''
  let url: string | undefined
  const link = document.createElement('a')
  try {
    const output = exportTotpRecords(records.value)
    url = URL.createObjectURL(new Blob([output.content], { type: output.mimeType }))
    link.href = url
    link.download = output.filename
    document.body.append(link)
    link.click()
    operationMessage.value = `已导出 ${records.value.length} 条密钥。`
  } catch {
    operationError.value = '密钥导出失败，请重试。'
  } finally {
    link.remove()
    if (url) {
      const downloadUrl = url
      downloadCleanup.set(
        downloadUrl,
        setTimeout(() => releaseDownload(downloadUrl), 1000),
      )
    }
  }
}

const refreshTime = () => {
  now.value = Date.now()
}
useVisibleInterval(refreshTime, 1000, () => records.value.length > 0)

onMounted(() => {
  void loadRecords()
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('paste', onDocumentPaste)
})

onBeforeUnmount(() => {
  active = false
  inputRevision += 1
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('paste', onDocumentPaste)
  secretQrStates.clear()
  secretQrRequests.clear()
  for (const timerId of copiedStates.values()) clearTimeout(timerId)
  copiedStates.clear()
  for (const url of downloadCleanup.keys()) releaseDownload(url)
})
</script>

<template>
  <main class="two-factor-page">
    <header class="page-heading">
      <p class="eyebrow">TWO-FACTOR AUTHENTICATION</p>
      <h1>两步验证</h1>
    </header>

    <div v-if="loadError" class="storage-error card">
      <p class="error-message" role="alert">{{ loadError }}</p>
      <button type="button" class="button" :disabled="loading" @click="loadRecords">
        重试加载
      </button>
    </div>

    <form
      class="two-factor-form card"
      aria-label="新增密钥"
      novalidate
      @paste="onPasteScreenshot"
      @submit.prevent="addRecord"
    >
      <h2>新增密钥</h2>
      <div class="input-tabs" role="tablist" aria-label="密钥导入方式">
        <button
          id="two-factor-tab-manual"
          type="button"
          role="tab"
          class="tab-button"
          :class="{ active: activeTab === 'manual' }"
          :aria-selected="activeTab === 'manual'"
          aria-controls="two-factor-panel-manual"
          @click="activeTab = 'manual'"
        >
          密钥或 otpauth 链接
        </button>
        <button
          id="two-factor-tab-qr"
          type="button"
          role="tab"
          class="tab-button"
          :class="{ active: activeTab === 'qr' }"
          :aria-selected="activeTab === 'qr'"
          aria-controls="two-factor-panel-qr"
          @click="activeTab = 'qr'"
        >
          二维码
        </button>
      </div>

      <div
        id="two-factor-panel-manual"
        v-show="activeTab === 'manual'"
        role="tabpanel"
        aria-labelledby="two-factor-tab-manual"
        class="tab-panel"
      >
        <div class="field">
          <label for="two-factor-input">密钥或 otpauth 链接</label>
          <textarea
            id="two-factor-input"
            v-model="inputValue"
            rows="3"
            placeholder="JBSWY3DPEHPK3PXP 或 otpauth://totp/…"
            autocomplete="off"
            autocapitalize="off"
            :spellcheck="false"
            :disabled="saving"
            :aria-invalid="Boolean(formError)"
            @input="inputChanged"
            @change="readUriOnChange"
          ></textarea>
        </div>
        <div class="import-actions">
          <button
            type="button"
            class="button"
            :disabled="saving || scanning || !inputValue.trim()"
            @click="readInput"
          >
            读取密钥
          </button>
        </div>
      </div>

      <div
        id="two-factor-panel-qr"
        v-show="activeTab === 'qr'"
        role="tabpanel"
        aria-labelledby="two-factor-tab-qr"
        class="tab-panel"
      >
        <div
          class="qr-dropzone"
          :class="{ dragging, disabled: saving }"
          tabindex="0"
          role="region"
          aria-label="二维码上传区域"
          @dragenter.prevent="onDragEnter"
          @dragover.prevent="onDragOver"
          @dragleave.prevent="onDragLeave"
          @drop.prevent="onDropScreenshot"
          @paste="onPasteScreenshot"
        >
          <input
            id="two-factor-file"
            class="sr-only-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            :disabled="saving"
            aria-label="二维码截图"
            @change="readScreenshot"
          />
          <p class="dropzone-title">拖拽二维码图片到此处，或直接粘贴剪贴板图片</p>
          <p class="dropzone-hint">支持 PNG、JPEG、WebP 格式</p>
          <label
            for="two-factor-file"
            class="button dropzone-button"
            :class="{ disabled: saving }"
          >
            选择二维码截图
          </label>
        </div>
      </div>

      <p v-if="scanning" class="save-message" role="status">正在识别二维码…</p>

      <div class="field-grid">
        <div class="field">
          <label for="two-factor-label">账号名称 <span class="required">必填</span></label>
          <input
            id="two-factor-label"
            v-model="form.label"
            type="text"
            placeholder="例如 name@example.com"
            autocomplete="off"
            :disabled="saving"
            required
            @input="inputChanged"
          />
        </div>
        <div class="field">
          <label for="two-factor-issuer">服务名称 <span class="optional">可选</span></label>
          <input
            id="two-factor-issuer"
            v-model="form.issuer"
            type="text"
            placeholder="例如 GitHub"
            autocomplete="off"
            :disabled="saving"
            @input="inputChanged"
          />
        </div>
      </div>
      <details
        class="advanced-options"
        :open="advancedOpen"
        @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary>高级选项</summary>
        <div class="field-grid advanced-grid">
          <div class="field">
            <label for="two-factor-algorithm">算法</label>
            <select
              id="two-factor-algorithm"
              v-model="form.algorithm"
              :disabled="saving"
              @change="inputChanged"
            >
              <option value="SHA1">SHA1</option>
              <option value="SHA256">SHA256</option>
              <option value="SHA512">SHA512</option>
            </select>
          </div>
          <div class="field">
            <label for="two-factor-digits">验证码位数</label>
            <select
              id="two-factor-digits"
              v-model="form.digits"
              :disabled="saving"
              @change="inputChanged"
            >
              <option :value="6">6 位</option>
              <option :value="8">8 位</option>
            </select>
          </div>
          <div class="field">
            <label for="two-factor-period">刷新周期（秒）</label>
            <input
              id="two-factor-period"
              v-model.number="form.period"
              type="number"
              min="1"
              step="1"
              :disabled="saving"
              @input="inputChanged"
            />
          </div>
        </div>
      </details>
      <p v-if="formError" class="error-message" role="alert">{{ formError }}</p>
      <div class="composer-footer">
        <p class="save-message" role="status">{{ formMessage }}</p>
        <button
          type="submit"
          class="button primary-button"
          :disabled="storageBusy || scanning || !inputValue.trim()"
        >
          {{ saving ? '正在保存…' : '添加密钥' }}
        </button>
      </div>
    </form>

    <section
      class="records-section"
      aria-labelledby="two-factor-list-heading"
      :aria-busy="loading || saving"
    >
      <div class="list-toolbar">
        <div class="list-heading">
          <h2 id="two-factor-list-heading">我的密钥</h2>
          <span v-if="!loading && !loadError" class="record-count"
            >{{ records.length }} 个账号</span
          >
        </div>
        <div class="export-actions">
          <button
            type="button"
            class="button"
            :disabled="storageBusy || !records.length"
            @click="exportRecords"
          >
            导出密钥
          </button>
        </div>
      </div>
      <p v-if="operationError" class="error-message" role="alert">{{ operationError }}</p>
      <p v-if="operationMessage" class="save-message operation-message" role="status">
        {{ operationMessage }}
      </p>
      <p v-if="loading" class="empty-state card" role="status">正在加载密钥…</p>
      <template v-else-if="!loadError">
        <ul v-if="displayedRecords.length" class="two-factor-list">
          <li
            v-for="{ record, code, remaining, error } in displayedRecords"
            :key="record.id"
            class="two-factor-item card"
          >
            <div class="account-info">
              <p v-if="record.issuer" class="issuer">{{ record.issuer }}</p>
              <div class="account-heading">
                <h3>{{ record.label }}</h3>
                <button
                  type="button"
                  class="text-button"
                  :aria-label="`查看密钥：${record.label}`"
                  :aria-expanded="activeQrRecordId === record.id"
                  :aria-controls="`two-factor-qr-${record.id}`"
                  @click="toggleSecret(record)"
                >
                  查看密钥
                </button>
              </div>
              <p class="record-settings">
                {{ record.algorithm }} · {{ record.digits }} 位 · {{ record.period }} 秒
              </p>
            </div>
            <div class="token-info">
              <p v-if="error" class="error-message" role="alert">{{ error }}</p>
              <template v-else>
                <span class="otp-code" :aria-label="`当前验证码：${code}`">{{ code }}</span>
                <div class="countdown">
                  <progress
                    :value="remaining"
                    :max="record.period"
                    :aria-label="`${record.label} 验证码剩余时间`"
                  ></progress
                  ><span>{{ remaining }} 秒后刷新</span>
                </div>
              </template>
            </div>
            <div class="record-actions">
              <button
                type="button"
                class="text-button copy-code"
                :disabled="Boolean(error)"
                :aria-label="`复制验证码：${record.label}`"
                @click="copyValue(record, 'code')"
              >
                {{ isCopied(record.id, 'code') ? '已复制' : '复制验证码' }}
              </button>
              <button
                type="button"
                class="text-button copy-secret"
                :aria-label="`复制密钥：${record.label}`"
                @click="copyValue(record, 'secret')"
              >
                {{ isCopied(record.id, 'secret') ? '已复制' : '复制密钥' }}
              </button>
              <button
                type="button"
                class="text-button delete-button"
                :disabled="storageBusy"
                :aria-label="`删除：${record.label}`"
                @click="deleteRecord(record)"
              >
                删除
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="empty-state card">还没有密钥，添加第一个账号吧。</p>
      </template>
    </section>

    <div
      v-if="activeQrRecord && activeQrState"
      class="qr-modal-backdrop"
      @click.self="hideSecretQr()"
    >
      <div
        :id="`two-factor-qr-${activeQrRecord.id}`"
        class="secret-qr-panel card"
        role="dialog"
        aria-modal="true"
        :aria-label="`${activeQrRecord.label} 的密钥二维码`"
        :aria-busy="activeQrState.status === 'loading'"
      >
        <div class="qr-modal-header">
          <div class="qr-modal-title">
            <p v-if="activeQrRecord.issuer" class="issuer">{{ activeQrRecord.issuer }}</p>
            <h3>{{ activeQrRecord.label }}</h3>
          </div>
          <button
            type="button"
            class="text-button"
            :aria-label="`隐藏密钥：${activeQrRecord.label}`"
            @click="hideSecretQr(activeQrRecord.id)"
          >
            关闭
          </button>
        </div>
        <p v-if="activeQrState.status === 'loading'" class="save-message" role="status">
          正在生成二维码…
        </p>
        <template v-else-if="activeQrState.status === 'error'">
          <p class="error-message" role="alert">{{ activeQrState.message }}</p>
          <button
            type="button"
            class="button"
            :aria-label="`重试生成二维码：${activeQrRecord.label}`"
            @click="showSecretQr(activeQrRecord)"
          >
            重试生成二维码
          </button>
        </template>
        <template v-else>
          <img
            class="secret-qr"
            :src="activeQrState.src"
            :alt="`${activeQrRecord.label} 的两步验证二维码`"
            width="288"
            height="288"
          />
          <p class="qr-help">使用验证器扫描此二维码添加账号。</p>
        </template>
      </div>
    </div>
  </main>
</template>

<style scoped src="@/assets/twoFactor.css"></style>
