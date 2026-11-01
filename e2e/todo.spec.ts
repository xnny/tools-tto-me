import { expect, test } from '@playwright/test'

test('persists batches, multiline content, edits, completion, and deletion across reloads', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('.tool-card').filter({ hasText: '待办事项' }).click()
  await expect(page).toHaveURL(/\/todo$/)
  await expect(page).toHaveTitle('待办事项 · TTO Tools')
  await expect(page.getByText('还没有待办，从上方添加第一条吧。')).toBeVisible()

  const input = page.getByLabel('新增待办', { exact: true })
  const contents = page.locator('.todo-content')
  await input.fill('买牛奶\n```\n准备周报\n  整理进展\n\n  下周计划\n```\n回复邮件')
  await page.getByRole('button', { name: '添加待办', exact: true }).click()
  await expect(contents).toHaveText(['买牛奶', '准备周报\n  整理进展\n\n  下周计划', '回复邮件'])
  await expect(input).toHaveValue('')
  await page.reload()
  await expect(contents).toHaveCount(3)
  await expect(contents.nth(1)).toHaveJSProperty(
    'textContent',
    '准备周报\n  整理进展\n\n  下周计划',
  )

  await page.getByRole('checkbox', { name: '完成待办：买牛奶', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: '恢复待办：买牛奶', exact: true })).toBeChecked()
  await page.getByRole('button', { name: '未完成', exact: true }).click()
  await expect(contents).toHaveCount(2)
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  await expect(contents).toHaveText(['买牛奶'])
  await page.reload()
  await expect(page.getByRole('checkbox', { name: '恢复待办：买牛奶', exact: true })).toBeChecked()

  await page.getByRole('button', { name: /^编辑待办：准备周报/ }).click()
  const edited = '更新周报\n```原样保存```\n  <b>纯文本</b>'
  await page.getByLabel('编辑待办', { exact: true }).fill(edited)
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(contents.nth(1)).toHaveJSProperty('textContent', edited)
  await expect(contents.nth(1).locator('b')).toHaveCount(0)
  await page.reload()
  await expect(contents.nth(1)).toHaveJSProperty('textContent', edited)

  await page.getByRole('checkbox', { name: '恢复待办：买牛奶', exact: true }).click()
  await expect(
    page.getByRole('checkbox', { name: '完成待办：买牛奶', exact: true }),
  ).not.toBeChecked()
  await page.getByRole('button', { name: '删除待办：回复邮件', exact: true }).click()
  await expect(contents).toHaveCount(2)
  await page.reload()
  await expect(contents).toHaveText(['买牛奶', edited])
  await expect(
    page.getByRole('checkbox', { name: '完成待办：买牛奶', exact: true }),
  ).not.toBeChecked()
})

test('retains unmatched fences and commits nothing until they are closed', async ({ page }) => {
  await page.goto('/todo')
  const input = page.getByLabel('新增待办', { exact: true })
  const draft = '普通待办\n```多行\n内容'
  await input.fill(draft)
  await page.getByRole('button', { name: '添加待办', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('尚未闭合')
  await expect(input).toHaveValue(draft)
  await expect(page.locator('.todo-item')).toHaveCount(0)

  await input.fill(`${draft}\n\`\`\``)
  await page.getByRole('button', { name: '添加待办', exact: true }).click()
  await expect(page.locator('.todo-content')).toHaveText(['普通待办', '多行\n内容'])
  await page.reload()
  await expect(page.locator('.todo-item')).toHaveCount(2)
})

test('rolls back the entire batch on a database write failure and keeps the draft', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/todo')
  await expect(page.getByText('还没有待办，从上方添加第一条吧。')).toBeVisible()
  await page.evaluate(() => {
    const originalAdd = IDBObjectStore.prototype.add
    let writes = 0
    IDBObjectStore.prototype.add = function (value, key) {
      // Force a real IndexedDB constraint error on the second record in this batch.
      if (this.name === 'todos' && ++writes === 2) {
        return originalAdd.call(this, { ...value, id: 1 })
      }
      return originalAdd.call(this, value, key)
    }
  })

  const input = page.getByLabel('新增待办', { exact: true })
  await input.fill('第一条\n第二条')
  await page.getByRole('button', { name: '添加待办', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('输入已保留')
  await expect(input).toHaveValue('第一条\n第二条')
  await expect(page.locator('.todo-item')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('还没有待办，从上方添加第一条吧。')).toBeVisible()

  await input.fill('第一条\n第二条')
  await page.getByRole('button', { name: '添加待办', exact: true }).click()
  await expect(page.locator('.todo-content')).toHaveText(['第一条', '第二条'])
  expect(pageErrors).toEqual([])
})

test('shows an actionable error when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined })
  })

  await page.goto('/todo')
  await expect(page.getByRole('alert')).toContainText('无法读取本地待办')
  await page.getByLabel('新增待办', { exact: true }).fill('待保存的内容')
  await expect(page.getByRole('button', { name: '添加待办', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('无法读取本地待办')
  await expect(page.getByLabel('新增待办', { exact: true })).toHaveValue('待保存的内容')
})
