import { fileURLToPath } from 'node:url'
import { expect, test, type Download, type Page } from '@playwright/test'
import type { TotpRecord } from '../src/utils/twoFactor'

// RFC 6238's public test secret, never a real account credential.
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const qrFixture = fileURLToPath(new URL('./fixtures/two-factor-qr.png', import.meta.url))
const noQrFixture = fileURLToPath(new URL('./fixtures/two-factor-no-qr.png', import.meta.url))

const addAccount = async (page: Page, label: string, input = secret) => {
  await page.locator('#two-factor-input').fill(input)
  await page.getByRole('button', { name: '读取密钥', exact: true }).click()
  await page.locator('#two-factor-label').fill(label)
  await page.getByRole('button', { name: '添加密钥', exact: true }).click()
  await expect(page.locator('.two-factor-item').filter({ hasText: label })).toBeVisible()
}

const readStoredRecords = (page: Page): Promise<TotpRecord[]> =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('tto-2af', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('records', 'readonly')
          const records = transaction.objectStore('records').getAll()
          transaction.oncomplete = () => {
            database.close()
            resolve(records.result)
          }
          transaction.onabort = () => {
            database.close()
            reject(transaction.error)
          }
        }
      }),
  )

const readDownload = async (download: Download) => {
  const stream = await download.createReadStream()
  if (!stream) throw new Error('Download did not provide a readable stream')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

test('persists accounts, shows RFC codes across a period boundary, and copies and deletes records', async ({
  page,
}) => {
  await page.clock.setFixedTime(1_111_111_109_000)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          sessionStorage.setItem('test-copied-text', text)
        },
      },
    })
  })
  await page.goto('/')
  await page.locator('.tool-card').filter({ hasText: '两步验证' }).click()
  await expect(page).toHaveURL(/\/2af$/)
  await expect(page).toHaveTitle('两步验证 · TTO Tools')
  await expect(page.getByRole('button', { name: '导出密钥', exact: true })).toBeDisabled()

  await page.locator('#two-factor-input').fill('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')
  await page.getByRole('button', { name: '读取密钥', exact: true }).click()
  await page.locator('#two-factor-label').fill('alice@example.com')
  await page.locator('#two-factor-issuer').fill('Example')
  await page.getByText('高级选项', { exact: true }).click()
  await page.locator('#two-factor-digits').selectOption('8')
  await page.getByRole('button', { name: '添加密钥', exact: true }).click()
  await expect(page.locator('.otp-code')).toHaveText('07081804')
  await expect(page.locator('.secret-qr')).toHaveCount(0)
  await expect(page.locator('.two-factor-item')).not.toContainText(secret)
  await page.reload()
  await expect(page.locator('.otp-code')).toHaveText('07081804')
  await expect(page.locator('.secret-qr')).toHaveCount(0)
  expect(await readStoredRecords(page)).toEqual([
    expect.objectContaining({
      issuer: 'Example',
      label: 'alice@example.com',
      secret,
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
    }),
  ])

  await page.getByRole('button', { name: '查看密钥：alice@example.com', exact: true }).click()
  await expect(page.getByRole('img', { name: 'alice@example.com 的两步验证二维码' })).toBeVisible()
  await expect(page.locator('.secret-qr')).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect(page.locator('.two-factor-item')).not.toContainText(secret)
  await page.getByRole('button', { name: '复制密钥：alice@example.com', exact: true }).click()
  expect(await page.evaluate(() => sessionStorage.getItem('test-copied-text'))).toBe(secret)
  await page.getByRole('button', { name: '隐藏密钥：alice@example.com', exact: true }).click()
  await expect(page.locator('.secret-qr')).toHaveCount(0)

  await page.clock.setFixedTime(1_111_111_111_000)
  await page.getByRole('button', { name: '复制验证码：alice@example.com', exact: true }).click()
  expect(await page.evaluate(() => sessionStorage.getItem('test-copied-text'))).toBe('14050471')
  await expect(page.locator('.otp-code')).toHaveText('14050471')

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: '删除：alice@example.com', exact: true }).click()
  await expect(page.locator('.two-factor-item')).toHaveCount(1)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '删除：alice@example.com', exact: true }).click()
  await expect(page.locator('.two-factor-item')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('还没有密钥，添加第一个账号吧。')).toBeVisible()
  expect(await readStoredRecords(page)).toEqual([])
})

test('round-trips a real QR image through the worker decoder and downloads a complete JSON backup', async ({
  page,
}) => {
  // Exercise the bundled decoder even in browsers with native BarcodeDetector support.
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'BarcodeDetector')
  })
  await page.goto('/2af')
  await expect(page.getByText('还没有密钥，添加第一个账号吧。')).toBeVisible()
  await page.locator('#two-factor-file').setInputFiles(qrFixture)
  await expect(page.locator('#two-factor-label')).toHaveValue('alice@example.com')
  await expect(page.locator('#two-factor-issuer')).toHaveValue('Example')
  await expect(page.locator('#two-factor-algorithm')).toHaveValue('SHA256')
  await expect(page.locator('#two-factor-digits')).toHaveValue('8')
  await expect(page.locator('#two-factor-period')).toHaveValue('45')
  expect(await readStoredRecords(page)).toEqual([])
  await page.getByRole('button', { name: '添加密钥', exact: true }).click()
  await expect(page.locator('.two-factor-item')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.two-factor-item')).toHaveCount(1)
  expect(await readStoredRecords(page)).toEqual([
    expect.objectContaining({ secret, algorithm: 'SHA256', digits: 8, period: 45 }),
  ])
  const storedBeforeRoundTrip = await readStoredRecords(page)
  await page.getByRole('button', { name: '查看密钥：alice@example.com', exact: true }).click()
  const generatedQr = page.getByRole('img', { name: 'alice@example.com 的两步验证二维码' })
  await expect(generatedQr).toBeVisible()
  await expect(generatedQr).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect(page.locator('.two-factor-item')).not.toContainText(secret)
  const renderedQrScreenshot = await generatedQr.screenshot()
  await page.locator('#two-factor-file').setInputFiles({
    name: 'generated-account-qr.png',
    mimeType: 'image/png',
    buffer: renderedQrScreenshot,
  })
  await expect(page.locator('#two-factor-input')).toHaveValue(secret)
  await expect(page.locator('#two-factor-label')).toHaveValue('alice@example.com')
  await expect(page.locator('#two-factor-issuer')).toHaveValue('Example')
  await expect(page.locator('#two-factor-algorithm')).toHaveValue('SHA256')
  await expect(page.locator('#two-factor-digits')).toHaveValue('8')
  await expect(page.locator('#two-factor-period')).toHaveValue('45')
  await expect(page.locator('.two-factor-item')).toHaveCount(1)
  expect(await readStoredRecords(page)).toEqual(storedBeforeRoundTrip)
  await page.reload()
  await expect(page.locator('.two-factor-item')).toHaveCount(1)
  await expect(page.locator('.secret-qr')).toHaveCount(0)
  await addAccount(page, 'second account')
  await expect(page.locator('.two-factor-item')).toHaveCount(2)

  const jsonDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出密钥', exact: true }).click()
  const jsonDownload = await jsonDownloadPromise
  expect(jsonDownload.suggestedFilename()).toMatch(/\.json$/)
  const backup = JSON.parse(await readDownload(jsonDownload))
  expect(backup.version).toBe(1)
  expect(Number.isNaN(Date.parse(backup.exportedAt))).toBe(false)
  expect(backup.entries).toEqual(expect.arrayContaining(await readStoredRecords(page)))
  expect(backup.entries).toHaveLength(2)
})

test('rejects invalid secrets and unreadable images without changing saved accounts', async ({
  page,
}) => {
  await page.goto('/2af')
  await expect(page.getByText('还没有密钥，添加第一个账号吧。')).toBeVisible()
  await page.locator('#two-factor-label').fill('keep this draft')
  await page.locator('#two-factor-input').fill('NOT-A-VALID-SECRET!')
  await page.getByRole('button', { name: '读取密钥', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('#two-factor-input')).toHaveValue('NOT-A-VALID-SECRET!')
  expect(await readStoredRecords(page)).toEqual([])

  await page.locator('#two-factor-file').setInputFiles(noQrFixture)
  await expect(page.getByRole('alert')).toContainText('二维码')
  await expect(page.locator('#two-factor-label')).toHaveValue('keep this draft')
  await page.locator('#two-factor-file').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  })
  await expect(page.getByRole('alert')).toContainText('图片')
  expect(await readStoredRecords(page)).toEqual([])
  await addAccount(page, 'valid after errors')
  expect(await readStoredRecords(page)).toHaveLength(1)
})

test('keeps the form after a real IndexedDB transaction failure and successfully retries', async ({
  page,
}) => {
  await page.goto('/2af')
  await expect(page.getByText('还没有密钥，添加第一个账号吧。')).toBeVisible()
  await page.evaluate(() => {
    const originalAdd = IDBObjectStore.prototype.add
    let aborted = false
    IDBObjectStore.prototype.add = function (value, key) {
      const request = originalAdd.call(this, value, key)
      if (this.name === 'records' && !aborted) {
        aborted = true
        this.transaction.abort()
      }
      return request
    }
  })
  await page.locator('#two-factor-input').fill(secret)
  await page.locator('#two-factor-label').fill('retry account')
  await page.getByRole('button', { name: '添加密钥', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('输入已保留')
  await expect(page.locator('#two-factor-input')).toHaveValue(secret)
  await expect(page.locator('#two-factor-label')).toHaveValue('retry account')
  expect(await readStoredRecords(page)).toEqual([])
  await page.getByRole('button', { name: '添加密钥', exact: true }).click()
  await expect(page.locator('.two-factor-item')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.two-factor-item')).toHaveCount(1)
})

test('shows a retryable storage error instead of an empty list when IndexedDB is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined })
  })
  await page.goto('/2af')
  await expect(page.getByRole('alert')).toContainText('无法读取')
  await page.locator('#two-factor-input').fill(secret)
  await page.locator('#two-factor-label').fill('unsaved account')
  await expect(page.getByRole('button', { name: '添加密钥', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('无法读取')
  await expect(page.locator('#two-factor-input')).toHaveValue(secret)
})

test('keeps long account names, generated QR images and controls within a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/2af')
  await expect(page.getByText('还没有密钥，添加第一个账号吧。')).toBeVisible()
  const label = 'very-long-account-name-for-small-screen@example.com'
  await addAccount(page, label)
  await page.getByRole('button', { name: `查看密钥：${label}`, exact: true }).click()
  await expect(page.getByRole('img', { name: `${label} 的两步验证二维码` })).toBeVisible()
  await expect(page.locator('.two-factor-item')).not.toContainText(secret)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await expect(page.getByRole('button', { name: '导出密钥', exact: true })).toBeEnabled()
})
