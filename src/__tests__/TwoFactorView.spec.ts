import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOTP } from 'otpauth'
import TwoFactorView from '../views/TwoFactorView.vue'
import { getTotpState, type TotpRecord } from '../utils/twoFactor'
import {
  addTwoFactorRecord,
  getTwoFactorRecords,
  removeTwoFactorRecord,
} from '../utils/twoFactorStorage'
import { createTwoFactorQr, readTwoFactorQr } from '../utils/twoFactorQr'

vi.mock('../utils/twoFactorStorage', () => ({
  addTwoFactorRecord: vi.fn<typeof addTwoFactorRecord>(),
  getTwoFactorRecords: vi.fn<typeof getTwoFactorRecords>(),
  removeTwoFactorRecord: vi.fn<typeof removeTwoFactorRecord>(),
}))
vi.mock('../utils/twoFactorQr', () => ({
  createTwoFactorQr: vi.fn<typeof createTwoFactorQr>(),
  readTwoFactorQr: vi.fn<typeof readTwoFactorQr>(),
}))

enableAutoUnmount(afterEach)

const record: TotpRecord = {
  id: 1,
  createdAt: 1000,
  issuer: 'Example',
  label: 'alice@example.com',
  secret: 'JBSWY3DPEHPK3PXP',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
}
const uri =
  'otpauth://totp/Example:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA256&digits=8&period=60'
const OriginalURL = URL
const qrImage = 'data:image/png;base64,cXItcG5n'

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(59000)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.mocked(getTwoFactorRecords).mockResolvedValue([])
  vi.mocked(addTwoFactorRecord).mockImplementation(async (config) => ({
    ...config,
    id: 1,
    createdAt: Date.now(),
  }))
  vi.mocked(removeTwoFactorRecord).mockResolvedValue()
  vi.mocked(createTwoFactorQr).mockResolvedValue(qrImage)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined) },
  })
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:two-factor-export')
      static revokeObjectURL = vi.fn<(url: string) => void>()
    },
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const renderView = async () => {
  const wrapper = mount(TwoFactorView)
  await flushPromises()
  return wrapper
}
type View = Awaited<ReturnType<typeof renderView>>
const fillManual = async (wrapper: View) => {
  await wrapper.get('#two-factor-input').setValue('jbsw y3dp ehpk 3pxp')
  await wrapper.get('#two-factor-label').setValue(record.label)
  await wrapper.get('#two-factor-issuer').setValue(record.issuer)
}
const uploadScreenshot = async (wrapper: View) => {
  const input = wrapper.get<HTMLInputElement>('#two-factor-file')
  const file = new File(['sample'], 'qr.png', { type: 'image/png' })
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  return file
}

describe('two-factor view', () => {
  it('shows an empty list and disables export until records exist', async () => {
    const interval = vi.spyOn(globalThis, 'setInterval')
    const wrapper = await renderView()
    expect(wrapper.text()).toContain('还没有密钥，添加第一个账号吧。')
    expect(wrapper.get<HTMLButtonElement>('.export-actions button').element.disabled).toBe(true)
    expect(wrapper.find('.export-help').exists()).toBe(false)
    expect(wrapper.find('.subtitle').exists()).toBe(false)
    expect(wrapper.find('.input-help').exists()).toBe(false)
    expect(wrapper.find('.footnote').exists()).toBe(false)
    // Vue's development renderer may schedule a one-off DevTools timeout on first mount.
    expect(interval).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(interval).not.toHaveBeenCalled()
  })

  it('retains input and allows retry when loading browser storage fails', async () => {
    vi.mocked(getTwoFactorRecords).mockRejectedValueOnce(new Error('blocked'))
    const wrapper = await renderView()
    expect(wrapper.get('[role="alert"]').text()).toContain('无法读取本地密钥')
    await fillManual(wrapper)
    expect(wrapper.get<HTMLButtonElement>('button[type="submit"]').element.disabled).toBe(true)
    await wrapper.get('.storage-error button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get<HTMLInputElement>('#two-factor-label').element.value).toBe(record.label)
    expect(wrapper.get<HTMLButtonElement>('button[type="submit"]').element.disabled).toBe(false)
    expect(getTwoFactorRecords).toHaveBeenCalledTimes(2)
  })

  it('requires a valid secret and account name before saving', async () => {
    const wrapper = await renderView()
    await wrapper.get('#two-factor-input').setValue('invalid!')
    await wrapper.get('.two-factor-form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('Base32')
    await wrapper.get('#two-factor-input').setValue(record.secret)
    await wrapper.get('.two-factor-form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('账号名称')
    expect(addTwoFactorRecord).not.toHaveBeenCalled()
  })

  it('reads a URI into editable fields without saving it automatically', async () => {
    const wrapper = await renderView()
    await wrapper.get('#two-factor-input').setValue(uri)
    expect(wrapper.get<HTMLTextAreaElement>('#two-factor-input').element.value).toBe(record.secret)
    expect(wrapper.get<HTMLInputElement>('#two-factor-label').element.value).toBe(record.label)
    expect(wrapper.get<HTMLInputElement>('#two-factor-issuer').element.value).toBe('Example')
    expect(wrapper.get<HTMLSelectElement>('#two-factor-algorithm').element.value).toBe('SHA256')
    expect(wrapper.get<HTMLSelectElement>('#two-factor-digits').element.value).toBe('8')
    expect(wrapper.get<HTMLInputElement>('#two-factor-period').element.value).toBe('60')
    expect(wrapper.get<HTMLDetailsElement>('details').element.open).toBe(true)
    expect(addTwoFactorRecord).not.toHaveBeenCalled()
    await wrapper.get('#two-factor-label').setValue('renamed')
    await wrapper.get('.two-factor-form').trigger('submit')
    await flushPromises()
    expect(addTwoFactorRecord).toHaveBeenCalledExactlyOnceWith({
      issuer: 'Example',
      label: 'renamed',
      secret: record.secret,
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
    })
  })

  it('keeps a failed submission and clears it only after a successful retry', async () => {
    vi.mocked(addTwoFactorRecord).mockRejectedValueOnce(new Error('full'))
    const wrapper = await renderView()
    await fillManual(wrapper)
    await wrapper.get('.two-factor-form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('输入已保留')
    expect(wrapper.get<HTMLTextAreaElement>('#two-factor-input').element.value).toBe(
      'jbsw y3dp ehpk 3pxp',
    )
    expect(wrapper.findAll('.two-factor-item')).toHaveLength(0)
    await wrapper.get('.two-factor-form').trigger('submit')
    await flushPromises()
    expect(wrapper.findAll('.two-factor-item')).toHaveLength(1)
    expect(wrapper.get<HTMLTextAreaElement>('#two-factor-input').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('#two-factor-label').element.value).toBe('')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('已添加 1 条密钥。')
  })

  it('prevents duplicate submissions while the storage transaction is pending', async () => {
    let resolveSave!: (record: TotpRecord) => void
    vi.mocked(addTwoFactorRecord).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )
    const wrapper = await renderView()
    await fillManual(wrapper)
    await wrapper.get('.two-factor-form').trigger('submit')
    expect(wrapper.get<HTMLTextAreaElement>('#two-factor-input').element.disabled).toBe(true)
    await wrapper.get('.two-factor-form').trigger('submit')
    expect(addTwoFactorRecord).toHaveBeenCalledTimes(1)
    resolveSave(record)
    await flushPromises()
    expect(wrapper.findAll('.two-factor-item')).toHaveLength(1)
  })

  it('fills the form from a screenshot and waits for explicit saving', async () => {
    vi.mocked(readTwoFactorQr).mockResolvedValue(uri)
    const wrapper = await renderView()
    const file = await uploadScreenshot(wrapper)
    await flushPromises()
    expect(readTwoFactorQr).toHaveBeenCalledExactlyOnceWith(file)
    expect(wrapper.get<HTMLInputElement>('#two-factor-label').element.value).toBe(record.label)
    expect(wrapper.get<HTMLInputElement>('#two-factor-period').element.value).toBe('60')
    expect(wrapper.text()).toContain('已识别二维码')
    expect(addTwoFactorRecord).not.toHaveBeenCalled()
    await wrapper.get('.two-factor-form').trigger('submit')
    await flushPromises()
    expect(addTwoFactorRecord).toHaveBeenCalledOnce()
  })

  it('keeps the existing form and records when screenshot decoding fails', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    vi.mocked(readTwoFactorQr).mockRejectedValue(new Error('未找到可识别的二维码。'))
    const wrapper = await renderView()
    await fillManual(wrapper)
    await uploadScreenshot(wrapper)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('未找到可识别的二维码')
    expect(wrapper.get<HTMLInputElement>('#two-factor-label').element.value).toBe(record.label)
    expect(wrapper.findAll('.two-factor-item')).toHaveLength(1)
    expect(addTwoFactorRecord).not.toHaveBeenCalled()
  })

  it('ignores a delayed screenshot result after the user changes the input', async () => {
    let resolveScan!: (text: string) => void
    vi.mocked(readTwoFactorQr).mockReturnValue(
      new Promise((resolve) => {
        resolveScan = resolve
      }),
    )
    const wrapper = await renderView()
    await uploadScreenshot(wrapper)
    expect(wrapper.text()).toContain('正在识别二维码')
    await wrapper.get('#two-factor-input').setValue('MY======')
    await wrapper.get('#two-factor-label').setValue('new draft')
    resolveScan(uri)
    await flushPromises()
    expect(wrapper.get<HTMLTextAreaElement>('#two-factor-input').element.value).toBe('MY======')
    expect(wrapper.get<HTMLInputElement>('#two-factor-label').element.value).toBe('new draft')
    expect(wrapper.text()).not.toContain('已识别二维码')
  })

  it('switches between manual and QR tabs and supports drag-and-drop and clipboard paste', async () => {
    vi.mocked(readTwoFactorQr).mockResolvedValue(uri)
    const wrapper = await renderView()
    const manualTab = wrapper.get('#two-factor-tab-manual')
    const qrTab = wrapper.get('#two-factor-tab-qr')
    expect(manualTab.attributes('aria-selected')).toBe('true')
    expect(qrTab.attributes('aria-selected')).toBe('false')

    await qrTab.trigger('click')
    expect(manualTab.attributes('aria-selected')).toBe('false')
    expect(qrTab.attributes('aria-selected')).toBe('true')

    const droppedFile = new File(['dropped'], 'dropped.png', { type: 'image/png' })
    const dropzone = wrapper.get('.qr-dropzone')
    await dropzone.trigger('dragenter')
    expect(dropzone.classes()).toContain('dragging')
    await dropzone.trigger('drop', {
      dataTransfer: { files: [droppedFile] },
    })
    await flushPromises()
    expect(dropzone.classes()).not.toContain('dragging')
    expect(readTwoFactorQr).toHaveBeenLastCalledWith(droppedFile)
    expect(wrapper.get<HTMLInputElement>('#two-factor-label').element.value).toBe(record.label)

    const pastedFile = new File(['pasted'], 'pasted.png', { type: 'image/png' })
    await dropzone.trigger('paste', {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => pastedFile }],
        files: [pastedFile],
      },
    })
    await flushPromises()
    expect(readTwoFactorQr).toHaveBeenLastCalledWith(pastedFile)
  })

  it('shows a QR image in a modal dialog on demand and briefly marks copy buttons as 已复制', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    const wrapper = await renderView()
    expect(wrapper.find('.secret-qr').exists()).toBe(false)
    expect(createTwoFactorQr).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain(record.secret)
    const viewButton = wrapper.get('.account-heading button[aria-label="查看密钥：alice@example.com"]')
    expect(viewButton.classes()).toContain('text-button')
    await viewButton.trigger('click')
    await flushPromises()
    expect(createTwoFactorQr).toHaveBeenCalledExactlyOnceWith(record)
    const dialog = wrapper.get('.qr-modal-backdrop [role="dialog"].secret-qr-panel')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(wrapper.get('.secret-qr').attributes('src')).toBe(qrImage)
    expect(wrapper.get('.secret-qr').attributes('alt')).toBe('alice@example.com 的两步验证二维码')
    expect(wrapper.text()).not.toContain(record.secret)
    expect(wrapper.text()).toContain('使用验证器扫描此二维码添加账号')
    await wrapper.get('button[aria-label="隐藏密钥：alice@example.com"]').trigger('click')
    expect(wrapper.find('.secret-qr-panel').exists()).toBe(false)

    const shownCode = wrapper.get('.otp-code').text()
    const copySecretBtn = wrapper.get('button[aria-label="复制密钥：alice@example.com"]')
    const copyCodeBtn = wrapper.get('.copy-code')
    expect(copySecretBtn.classes()).toContain('text-button')
    expect(copyCodeBtn.classes()).toContain('text-button')
    expect(copySecretBtn.text()).toBe('复制密钥')
    await copySecretBtn.trigger('click')
    await flushPromises()
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(record.secret)
    expect(copySecretBtn.text()).toBe('已复制')
    expect(wrapper.find('.operation-message').exists()).toBe(false)

    vi.setSystemTime(60000)
    expect(copyCodeBtn.text()).toBe('复制验证码')
    await copyCodeBtn.trigger('click')
    await flushPromises()
    const freshCode = getTotpState(record, 60000).code
    expect(freshCode).not.toBe(shownCode)
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(freshCode)
    expect(copyCodeBtn.text()).toBe('已复制')
    expect(wrapper.find('.operation-message').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(1500)
    expect(copySecretBtn.text()).toBe('复制密钥')
    expect(copyCodeBtn.text()).toBe('复制验证码')
  })

  it('shows QR generation progress and lets the user retry a failure', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    let rejectQr!: (error: Error) => void
    vi.mocked(createTwoFactorQr).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectQr = reject
      }),
    )
    const wrapper = await renderView()
    await wrapper.get('button[aria-label="查看密钥：alice@example.com"]').trigger('click')
    expect(wrapper.get('.secret-qr-panel').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('.secret-qr-panel [role="status"]').text()).toBe('正在生成二维码…')
    const failureMessage = '无法生成二维码，请重试；账号信息过长时可使用 JSON 导出。'
    rejectQr(new Error(failureMessage))
    await flushPromises()
    expect(wrapper.get('.secret-qr-panel [role="alert"]').text()).toBe(failureMessage)
    expect(wrapper.text()).not.toContain(record.secret)
    await wrapper.get('button[aria-label="重试生成二维码：alice@example.com"]').trigger('click')
    await flushPromises()
    expect(createTwoFactorQr).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.secret-qr').attributes('src')).toBe(qrImage)
    expect(wrapper.find('.secret-qr-panel [role="alert"]').exists()).toBe(false)
  })

  it('ignores a late QR result after hiding and generates a new image when reopened', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    let resolveQr!: (src: string) => void
    vi.mocked(createTwoFactorQr).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveQr = resolve
      }),
    )
    const wrapper = await renderView()
    await wrapper.get('button[aria-label="查看密钥：alice@example.com"]').trigger('click')
    await wrapper.get('button[aria-label="隐藏密钥：alice@example.com"]').trigger('click')
    resolveQr('data:image/png;base64,b2xk')
    await flushPromises()
    expect(wrapper.find('.secret-qr-panel').exists()).toBe(false)
    await wrapper.get('button[aria-label="查看密钥：alice@example.com"]').trigger('click')
    await flushPromises()
    expect(createTwoFactorQr).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.secret-qr').attributes('src')).toBe(qrImage)
  })

  it('does not restore a QR panel after the account is deleted', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    let resolveQr!: (src: string) => void
    vi.mocked(createTwoFactorQr).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveQr = resolve
      }),
    )
    const wrapper = await renderView()
    await wrapper.get('button[aria-label="查看密钥：alice@example.com"]').trigger('click')
    await wrapper.get('.delete-button').trigger('click')
    await flushPromises()
    resolveQr(qrImage)
    await flushPromises()
    expect(wrapper.find('.two-factor-item').exists()).toBe(false)
    expect(wrapper.find('.secret-qr-panel').exists()).toBe(false)
  })

  it('clears QR state on unmount and ignores the pending result', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    let resolveQr!: (src: string) => void
    vi.mocked(createTwoFactorQr).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveQr = resolve
      }),
    )
    const wrapper = await renderView()
    await wrapper.get('button[aria-label="查看密钥：alice@example.com"]').trigger('click')
    wrapper.unmount()
    resolveQr(qrImage)
    await flushPromises()
    const reopened = await renderView()
    expect(reopened.find('.secret-qr-panel').exists()).toBe(false)
    expect(createTwoFactorQr).toHaveBeenCalledTimes(1)
  })

  it('reports clipboard failures without changing records', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'))
    const wrapper = await renderView()
    await wrapper.get('.copy-code').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('复制失败')
    expect(wrapper.findAll('.two-factor-item')).toHaveLength(1)
  })

  it('deletes only after confirmation and preserves the record on failure', async () => {
    const interval = vi.spyOn(globalThis, 'setInterval')
    const clear = vi.spyOn(globalThis, 'clearInterval')
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    const wrapper = await renderView()
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await wrapper.get('.delete-button').trigger('click')
    expect(removeTwoFactorRecord).not.toHaveBeenCalled()
    vi.mocked(removeTwoFactorRecord).mockRejectedValueOnce(new Error('blocked'))
    await wrapper.get('.delete-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('删除失败')
    expect(wrapper.findAll('.two-factor-item')).toHaveLength(1)
    await wrapper.get('.delete-button').trigger('click')
    await flushPromises()
    expect(removeTwoFactorRecord).toHaveBeenLastCalledWith(record.id)
    expect(wrapper.findAll('.two-factor-item')).toHaveLength(0)
    expect(wrapper.text()).toContain('已删除密钥')
    expect(clear).toHaveBeenCalledWith(interval.mock.results[0]?.value)
  })

  it('updates the countdown without regenerating the code until its period changes', async () => {
    vi.setSystemTime(30000)
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    const generate = vi.spyOn(TOTP.prototype, 'generate')
    const wrapper = await renderView()
    const initialCode = wrapper.get('.otp-code').text()
    await vi.advanceTimersByTimeAsync(20000)
    expect(wrapper.get('.countdown').text()).toBe('10 秒后刷新')
    expect(wrapper.get('.otp-code').text()).toBe(initialCode)
    expect(generate).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10000)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.countdown').text()).toBe('30 秒后刷新')
  })

  it('stops work while hidden and immediately refreshes the latest code when visible', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    const interval = vi.spyOn(globalThis, 'setInterval')
    const clear = vi.spyOn(globalThis, 'clearInterval')
    const generate = vi.spyOn(TOTP.prototype, 'generate')
    const wrapper = await renderView()
    const initialCode = wrapper.get('.otp-code').text()
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(clear).toHaveBeenCalledWith(interval.mock.results[0]?.value)
    await vi.advanceTimersByTimeAsync(91000)
    expect(wrapper.get('.otp-code').text()).toBe(initialCode)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(interval).toHaveBeenCalledTimes(1)

    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(generate).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.otp-code').text()).toBe(getTotpState(record, 150000).code)
    expect(wrapper.get('.countdown').text()).toBe('30 秒后刷新')
    expect(interval).toHaveBeenCalledTimes(2)
  })

  it('waits to start the clock when the page is initially hidden', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    const interval = vi.spyOn(globalThis, 'setInterval')
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const wrapper = await renderView()
    expect(interval).not.toHaveBeenCalled()
    vi.setSystemTime(90000)
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(wrapper.get('.otp-code').text()).toBe(getTotpState(record, 90000).code)
    expect(interval).toHaveBeenCalledTimes(1)
  })

  it('isolates an invalid stored record while valid account codes continue updating', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([
      { ...record, id: 2, secret: 'invalid!' },
      record,
    ])
    const wrapper = await renderView()
    expect(wrapper.findAll('.two-factor-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('无法生成验证码，请删除后重新添加。')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('.otp-code').text()).toBe(getTotpState(record, 60000).code)
  })

  it('updates each second and on focus or visibility, then cleans up on unmount', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    const wrapper = await renderView()
    expect(wrapper.get('.countdown').text()).toBe('1 秒后刷新')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('.otp-code').text()).toBe(getTotpState(record, 60000).code)
    expect(wrapper.get('.countdown').text()).toBe('30 秒后刷新')
    vi.setSystemTime(90000)
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.get('.otp-code').text()).toBe(getTotpState(record, 90000).code)
    vi.setSystemTime(120000)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(wrapper.get('.otp-code').text()).toBe(getTotpState(record, 120000).code)
    const windowRemove = vi.spyOn(window, 'removeEventListener')
    const documentRemove = vi.spyOn(document, 'removeEventListener')
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(windowRemove).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(documentRemove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('downloads JSON directly and releases its object URL', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    let filename = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filename = this.download
      expect(this.href).toBe('blob:two-factor-export')
      expect(this.isConnected).toBe(true)
    })
    const wrapper = await renderView()
    expect(wrapper.find('#two-factor-export-format').exists()).toBe(false)
    await wrapper.get('.export-actions button').trigger('click')
    expect(filename).toMatch(/\.json$/)
    expect(URL.createObjectURL).toHaveBeenCalledExactlyOnceWith(expect.any(Blob))
    expect(wrapper.text()).toContain('已导出 1 条密钥')
    expect(document.querySelector('a[download]')).toBeNull()
    await vi.advanceTimersByTimeAsync(1000)
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:two-factor-export')
  })
})
