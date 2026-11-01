import { expect, test } from '@playwright/test'

test('persists recent time zones, removes duplicates, and reuses them without clearing input', async ({
  page,
}) => {
  const labels = page.locator('.recent-timezone-label')

  await page.goto('/timezone')
  await expect(labels).toHaveText(['UTC'])

  await page.goto('/timezone/utc+8')
  await expect(labels).toHaveText(['UTC+8', 'UTC'])

  await page.goto('/timezone/utc-5')
  await expect(labels).toHaveText(['UTC-5', 'UTC+8', 'UTC'])
  await page.getByLabel('输入', { exact: true }).fill('0')

  await page.getByRole('link', { name: /^UTC\+8 / }).click()
  await expect(page).toHaveURL(/\/timezone\/utc\+8$/)
  await expect(labels).toHaveText(['UTC+8', 'UTC-5', 'UTC'])
  await expect(page.getByLabel('输入', { exact: true })).toHaveValue('0')
  await expect(page.getByLabel('结果', { exact: true })).toHaveValue('1970-01-01 08:00:00')

  await page.reload()
  await expect(labels).toHaveText(['UTC+8', 'UTC-5', 'UTC'])

  await page.goto('/timezone/utc+08')
  await expect(labels).toHaveText(['UTC+8', 'UTC-5', 'UTC'])
})

test('deletes individual records without navigating and keeps them deleted on later visits', async ({
  page,
}) => {
  const labels = page.locator('.recent-timezone-label')

  await page.goto('/timezone/utc+8')
  await expect(labels).toHaveText(['UTC+8'])
  await page.goto('/timezone/utc-5')
  await expect(labels).toHaveText(['UTC-5', 'UTC+8'])
  await page.getByLabel('输入', { exact: true }).fill('0')

  await page.getByRole('button', { name: '删除 UTC-5 时区记录', exact: true }).click()
  await expect(labels).toHaveText(['UTC+8'])
  await expect(page).toHaveURL(/\/timezone\/utc-5$/)
  await expect(page.getByLabel('结果', { exact: true })).toHaveValue('1969-12-31 19:00:00')

  await page.getByRole('link', { name: 'TTO Tools 首页' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('简单好用的在线小工具')
  await page.goto('/timezone')
  await expect(labels).toHaveText(['UTC', 'UTC+8'])
  await page.reload()
  await expect(labels).toHaveText(['UTC', 'UTC+8'])

  await page.getByRole('button', { name: '删除 UTC+8 时区记录', exact: true }).click()
  await expect(labels).toHaveText(['UTC'])
  await page.reload()
  await expect(labels).toHaveText(['UTC'])

  await page.getByRole('button', { name: '删除 UTC 时区记录', exact: true }).click()
  await expect(labels).toHaveCount(0)
  await expect(page.getByText('暂无最近使用的时区。')).toBeVisible()
})

test('keeps timestamp conversion available when browser storage is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined })
  })

  await page.goto('/timezone/utc+8')
  await expect(page.getByRole('alert')).toHaveText('最近使用的时区暂时无法保存，请稍后再试。')
  await page.getByLabel('输入', { exact: true }).fill('0')
  await expect(page.getByLabel('结果', { exact: true })).toHaveValue('1970-01-01 08:00:00')
})
