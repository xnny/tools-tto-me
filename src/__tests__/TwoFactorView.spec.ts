import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TwoFactorView from '../views/TwoFactorView.vue'
import { getTotpState, type TotpRecord } from '../utils/twoFactor'
import {
  addTwoFactorRecord,
  getTwoFactorRecords,
  removeTwoFactorRecord,
} from '../utils/twoFactorStorage'
import { readTwoFactorQr } from '../utils/twoFactorQr'

vi.mock('../utils/twoFactorStorage', () => ({
  addTwoFactorRecord: vi.fn<typeof addTwoFactorRecord>(),
  getTwoFactorRecords: vi.fn<typeof getTwoFactorRecords>(),
  removeTwoFactorRecord: vi.fn<typeof removeTwoFactorRecord>(),
}))
vi.mock('../utils/twoFactorQr', () => ({ readTwoFactorQr: vi.fn<typeof readTwoFactorQr>() }))

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

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(59000)
  vi.mocked(getTwoFactorRecords).mockResolvedValue([])
  vi.mocked(addTwoFactorRecord).mockImplementation(async (config) => ({
    ...config,
    id: 1,
    createdAt: Date.now(),
  }))
  vi.mocked(removeTwoFactorRecord).mockResolvedValue()
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
    const wrapper = await renderView()
    expect(wrapper.text()).toContain('还没有密钥，添加第一个账号吧。')
    expect(wrapper.get<HTMLButtonElement>('.export-actions button').element.disabled).toBe(true)
    expect(wrapper.text()).toContain('未加密')
    expect(wrapper.text()).toContain('明文密钥')
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

  it('hides secrets by default and copies a newly calculated code across a period boundary', async () => {
    vi.mocked(getTwoFactorRecords).mockResolvedValue([record])
    const wrapper = await renderView()
    expect(wrapper.find('.secret-value').exists()).toBe(false)
    await wrapper.get('button[aria-label="查看密钥：alice@example.com"]').trigger('click')
    expect(wrapper.get('.secret-value').text()).toBe(record.secret)
    await wrapper.get('button[aria-label="隐藏密钥：alice@example.com"]').trigger('click')
    expect(wrapper.find('.secret-value').exists()).toBe(false)
    await wrapper.get('button[aria-label="复制密钥：alice@example.com"]').trigger('click')
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(record.secret)
    const shownCode = wrapper.get('.otp-code').text()
    vi.setSystemTime(60000)
    await wrapper.get('.copy-code').trigger('click')
    await flushPromises()
    const freshCode = getTotpState(record, 60000).code
    expect(freshCode).not.toBe(shownCode)
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(freshCode)
    expect(wrapper.text()).toContain('已复制验证码')
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
