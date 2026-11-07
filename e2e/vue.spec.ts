import { test, expect } from '@playwright/test'

// See here how to get started:
// https://playwright.dev/docs/intro
test('visits the app root url', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('简单好用的在线小工具')
  await expect(page.locator('.tool-card')).toHaveCount(4)
  await expect(page.locator('.tool-card').filter({ hasText: '两步验证' })).toHaveAttribute(
    'href',
    '/2af',
  )
  await expect(page.locator('.tool-card').filter({ hasText: '待办事项' })).toHaveAttribute(
    'href',
    '/todo/list',
  )
})
