import { expect, test, type Page } from '@playwright/test'
import type { Todo } from '../src/utils/todoStorage'

test('persists batches, multiline content, edits, completion, and deletion across reloads', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('.tool-card').filter({ hasText: '待办事项' }).click()
  await expect(page).toHaveURL(/\/todo$/)
  await expect(page).toHaveTitle('待办事项 · TTO Tools')
  await expect(page.getByLabel('新增待办', { exact: true })).toBeEnabled()

  const input = page.getByLabel('新增待办', { exact: true })
  const contents = page.locator('.todo-content')
  await input.fill('买牛奶\n```\n准备周报\n  整理进展\n\n  下周计划\n```\n回复邮件')
  await page.getByRole('button', { name: '添加待办', exact: true }).click()
  await expect(page.locator('.save-message')).toHaveText('已添加 3 条待办。')
  await expect(input).toHaveValue('')
  await page.getByRole('link', { name: '查看我的待办 →', exact: true }).click()
  await expect(page).toHaveURL(/\/todo\/list$/)
  await expect(page).toHaveTitle('我的待办 · TTO Tools')
  await expect(contents).toHaveText(['买牛奶', '准备周报\n  整理进展\n\n  下周计划', '回复邮件'])
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
  expect(await readStoredTodos(page)).toEqual([])

  await input.fill(`${draft}\n\`\`\``)
  await page.getByRole('button', { name: '添加待办', exact: true }).click()
  await expect(page.locator('.save-message')).toHaveText('已添加 2 条待办。')
  await page.getByRole('link', { name: '我的待办', exact: true }).click()
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
  await expect(page.getByLabel('新增待办', { exact: true })).toBeEnabled()
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
  expect(await readStoredTodos(page)).toEqual([])
  await page.reload()
  await expect(page.getByLabel('新增待办', { exact: true })).toBeEnabled()

  await input.fill('第一条\n第二条')
  await page.getByRole('button', { name: '添加待办', exact: true }).click()
  await expect(page.locator('.save-message')).toHaveText('已添加 2 条待办。')
  await page.getByRole('link', { name: '我的待办', exact: true }).click()
  await expect(page.locator('.todo-content')).toHaveText(['第一条', '第二条'])
  expect(pageErrors).toEqual([])
})

test('shows an actionable error when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined })
  })

  await page.goto('/todo')
  await expect(page.getByRole('alert')).toContainText('无法读取或清理本地待办')
  await page.getByLabel('新增待办', { exact: true }).fill('待保存的内容')
  await expect(page.getByRole('button', { name: '添加待办', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('无法读取或清理本地待办')
  await expect(page.getByLabel('新增待办', { exact: true })).toHaveValue('待保存的内容')
})

const readStoredTodos = (page: Page): Promise<Todo[]> =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('tto-todos', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('todos', 'readonly')
          const records = transaction.objectStore('todos').getAll()
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

const seedTodos = (page: Page, todos: Todo[]) =>
  page.evaluate(
    (records) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('tto-todos', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('todos', 'readwrite')
          records.forEach((record) => transaction.objectStore('todos').put(record))
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onabort = () => {
            database.close()
            reject(transaction.error)
          }
        }
      }),
    todos,
  )

test('saves drafts after an idle second and restores them across reloads and page navigation', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-04T08:00:00Z') })
  await page.goto('/todo')
  await expect(page.getByLabel('新增待办', { exact: true })).toBeEnabled()
  await page.clock.pauseAt(new Date('2026-11-04T09:00:00Z'))
  const input = page.getByLabel('新增待办', { exact: true })
  await input.fill('第一行')
  await page.clock.runFor(999)
  expect(await page.evaluate(() => localStorage.getItem('tto-tools-todo-draft'))).toBeNull()
  const draft = '普通待办\n```\n  多行草稿\n第二行\n```'
  await input.fill(draft)
  await page.clock.runFor(999)
  expect(await page.evaluate(() => localStorage.getItem('tto-tools-todo-draft'))).toBeNull()
  await page.clock.runFor(1)
  expect(await page.evaluate(() => localStorage.getItem('tto-tools-todo-draft'))).toBe(draft)
  expect(await readStoredTodos(page)).toEqual([])
  await page.reload()
  await expect(input).toHaveValue(draft)

  await input.fill(draft + '\n离开前的输入')
  await page.getByRole('link', { name: '我的待办', exact: true }).click()
  await expect(page.getByText('还没有待办，去新增第一条吧。')).toBeVisible()
  await page.getByRole('link', { name: '新增待办', exact: true }).click()
  await expect(input).toHaveValue(draft + '\n离开前的输入')
  await page.getByRole('button', { name: '添加待办', exact: true }).click()
  await expect(page.locator('.save-message')).toHaveText('已添加 3 条待办。')
  await page.clock.runFor(1000)
  expect(await page.evaluate(() => localStorage.getItem('tto-tools-todo-draft'))).toBeNull()
  await page.reload()
  await expect(input).toHaveValue('')
  expect(
    (await readStoredTodos(page)).map(({ completedAt, autoDelete }) => ({
      completedAt,
      autoDelete,
    })),
  ).toEqual(Array.from({ length: 3 }, () => ({ completedAt: 0, autoDelete: true })))
})

test.describe('date groups and expiration', () => {
  test.use({ timezoneId: 'Asia/Shanghai' })
  const now = new Date('2026-11-04T12:00:00+08:00').getTime()
  const week = 7 * 24 * 60 * 60 * 1000
  const previousDay = new Date('2026-11-03T23:59:00+08:00').getTime()
  const today = new Date('2026-11-04T00:00:00+08:00').getTime()
  const todo = (id: number, content: string, changes: Partial<Todo> = {}): Todo => ({
    id,
    content,
    createdAt: previousDay,
    completedAt: 0,
    autoDelete: true,
    ...changes,
  })

  test('groups by local day and deletes only eligible records at the seven-day boundary', async ({
    page,
  }) => {
    await page.clock.setFixedTime(now)
    await page.goto('/todo/list')
    await expect(page.getByText('还没有待办，去新增第一条吧。')).toBeVisible()
    await seedTodos(page, [
      todo(1, '未完成'),
      todo(2, '尚差一毫秒', { completedAt: now - week + 1 }),
      todo(3, '恰好七天', { completedAt: now - week }),
      todo(4, '已经过期', { completedAt: now - week - 1 }),
      todo(5, '永久保留', { completedAt: now - week - 1, autoDelete: false }),
      todo(6, '今天第一条', { createdAt: today }),
      todo(7, '今天第二条', { createdAt: today + 1000 }),
    ])
    await page.reload()
    await expect(page.locator('.todo-group h3')).toHaveText(['2026-11-04', '2026-11-03'])
    await expect(page.locator('.todo-content')).toHaveText([
      '今天第一条',
      '今天第二条',
      '未完成',
      '尚差一毫秒',
      '永久保留',
    ])
    expect((await readStoredTodos(page)).map((record) => record.id)).toEqual([1, 2, 5, 6, 7])
    await expect(page.getByRole('checkbox', { name: /^自动删除：/ })).toHaveCount(0)
    await page.getByRole('button', { name: '已完成', exact: true }).click()
    await expect(page.locator('.todo-group h3')).toHaveText(['2026-11-03'])

    await page.getByRole('button', { name: '编辑待办：永久保留', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: '自动删除：永久保留', exact: true }),
    ).not.toBeChecked()
    await expect(page.locator('.deletion-countdown')).toHaveCount(0)
    await page.getByRole('checkbox', { name: '自动删除：永久保留', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: '自动删除：永久保留', exact: true }),
    ).toBeChecked()
    await expect(page.locator('.deletion-countdown')).toHaveText('7 天 00:00:00 后删除')
    await page.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(page.locator('.todo-content')).toHaveText(['尚差一毫秒', '永久保留'])
    expect((await readStoredTodos(page)).find((record) => record.id === 5)).toMatchObject({
      completedAt: now - week - 1,
      autoDelete: true,
      autoDeleteStartedAt: now,
    })
    await page.getByRole('link', { name: '新增待办', exact: true }).click()
    await expect(page.getByRole('button', { name: '添加待办', exact: true })).toBeDisabled()
    await expect
      .poll(async () => (await readStoredTodos(page)).map((record) => record.id))
      .toEqual([1, 2, 5, 6, 7])
    await page.getByRole('link', { name: '我的待办', exact: true }).click()
    await page.getByRole('button', { name: '编辑待办：永久保留', exact: true }).click()
    await expect(page.locator('.deletion-countdown')).toHaveText('7 天 00:00:00 后删除')
    await page.clock.setFixedTime(now + week - 1)
    await page.reload()
    await expect(page.locator('.todo-content')).toContainText(['永久保留'])
    await page.clock.setFixedTime(now + week)
    await page.reload()
    await expect(page.locator('.todo-content')).toHaveText(['今天第一条', '今天第二条', '未完成'])
    expect((await readStoredTodos(page)).map((record) => record.id)).toEqual([1, 6, 7])
  })

  test('does not clean up while open or on visibility changes, but cleans up on refresh', async ({
    page,
  }) => {
    await page.clock.install({ time: now - 60 * 60 * 1000 })
    await page.goto('/todo/list')
    await expect(page.getByText('还没有待办，去新增第一条吧。')).toBeVisible()
    await page.clock.pauseAt(now)
    await seedTodos(page, [todo(1, '即将到期', { completedAt: now - week + 1000 })])
    await page.reload()
    await expect(page.locator('.todo-content')).toHaveText(['即将到期'])
    await page.getByRole('button', { name: '编辑待办：即将到期', exact: true }).click()
    await expect(page.locator('.deletion-countdown')).toHaveText('00:00:01 后删除')
    await page.clock.runFor(2 * 60 * 1000)
    await expect(page.locator('.deletion-countdown')).toHaveText('下次打开或刷新时删除')
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(page.locator('.todo-content')).toHaveText(['即将到期'])
    expect(await readStoredTodos(page)).toHaveLength(1)
    await page.reload()
    await expect(page.getByText('还没有待办，去新增第一条吧。')).toBeVisible()
    expect(await readStoredTodos(page)).toEqual([])
  })

  test('persists retention settings and restarts the period after restoring and completing a todo', async ({
    page,
  }) => {
    await page.clock.setFixedTime(now)
    await page.goto('/todo/list')
    await expect(page.getByText('还没有待办，去新增第一条吧。')).toBeVisible()
    await seedTodos(page, [todo(1, '保留此条'), todo(2, '重新完成')])
    await page.reload()
    await expect(page.getByRole('checkbox', { name: /^自动删除：/ })).toHaveCount(0)
    await page.getByRole('button', { name: '编辑待办：保留此条', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: '自动删除：保留此条', exact: true }),
    ).toBeChecked()
    await expect(page.locator('.deletion-countdown')).toHaveText('完成后 7 天删除')
    await page.getByRole('checkbox', { name: '自动删除：保留此条', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: '自动删除：保留此条', exact: true }),
    ).not.toBeChecked()
    await expect(page.locator('.deletion-countdown')).toHaveCount(0)
    await page.getByRole('button', { name: '取消', exact: true }).click()
    expect((await readStoredTodos(page))[0]?.autoDelete).toBe(true)
    await page.getByRole('button', { name: '编辑待办：保留此条', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: '自动删除：保留此条', exact: true }),
    ).toBeChecked()
    await page.getByRole('checkbox', { name: '自动删除：保留此条', exact: true }).click()
    await page.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: /^自动删除：/ })).toHaveCount(0)
    await page.reload()
    await page.getByRole('button', { name: '编辑待办：保留此条', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: '自动删除：保留此条', exact: true }),
    ).not.toBeChecked()
    await expect(page.locator('.deletion-countdown')).toHaveCount(0)
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('checkbox', { name: '完成待办：保留此条', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: '恢复待办：保留此条', exact: true }),
    ).toBeChecked()
    await page.getByRole('checkbox', { name: '完成待办：重新完成', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: '恢复待办：重新完成', exact: true }),
    ).toBeChecked()
    await page.clock.setFixedTime(now + week - 1000)
    await page.reload()
    await expect(page.locator('.todo-content')).toHaveText(['保留此条', '重新完成'])
    await page.getByRole('checkbox', { name: '恢复待办：重新完成', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: '完成待办：重新完成', exact: true }),
    ).not.toBeChecked()
    expect((await readStoredTodos(page))[1]?.completedAt).toBe(0)
    await page.getByRole('checkbox', { name: '完成待办：重新完成', exact: true }).click()
    await expect(
      page.getByRole('checkbox', { name: '恢复待办：重新完成', exact: true }),
    ).toBeChecked()
    expect((await readStoredTodos(page))[1]?.completedAt).toBe(now + week - 1000)
    await page.clock.setFixedTime(now + week + 1000)
    await page.reload()
    await expect(page.locator('.todo-content')).toHaveText(['保留此条', '重新完成'])
    await page.clock.setFixedTime(now + 2 * week)
    await page.reload()
    await expect(page.locator('.todo-content')).toHaveText(['保留此条'])
    await page.getByRole('button', { name: '删除待办：保留此条', exact: true }).click()
    await expect(page.getByText('还没有待办，去新增第一条吧。')).toBeVisible()
  })

  test('resets the countdown when toggled off and on in one edit, saving only on submit', async ({
    page,
  }) => {
    await page.clock.setFixedTime(now)
    await page.goto('/todo/list')
    await expect(page.getByText('还没有待办，去新增第一条吧。')).toBeVisible()
    const original = todo(1, '重置倒计时', { completedAt: now - week + 60 * 60 * 1000 })
    await seedTodos(page, [original])
    await page.reload()
    const automaticDeletion = page.getByRole('checkbox', {
      name: '自动删除：重置倒计时',
      exact: true,
    })
    const countdown = page.locator('.deletion-countdown')

    await page.getByRole('button', { name: '编辑待办：重置倒计时', exact: true }).click()
    await expect(automaticDeletion).toBeChecked()
    await expect(countdown).toHaveText('01:00:00 后删除')
    await automaticDeletion.click()
    await expect(countdown).toHaveCount(0)
    await automaticDeletion.click()
    await expect(countdown).toHaveText('7 天 00:00:00 后删除')
    await page.getByRole('button', { name: '取消', exact: true }).click()
    expect(await readStoredTodos(page)).toEqual([original])

    await page.getByRole('button', { name: '编辑待办：重置倒计时', exact: true }).click()
    await expect(countdown).toHaveText('01:00:00 后删除')
    await automaticDeletion.click()
    await automaticDeletion.click()
    await page.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(page.locator('.todo-content')).toHaveText(['重置倒计时'])
    expect(await readStoredTodos(page)).toEqual([{ ...original, autoDeleteStartedAt: now }])
    await page.clock.setFixedTime(now + 60 * 60 * 1000)
    await page.reload()
    await page.getByRole('button', { name: '编辑待办：重置倒计时', exact: true }).click()
    await expect(automaticDeletion).toBeChecked()
    await expect(countdown).toHaveText('6 天 23:00:00 后删除')
  })

  test('rolls back failed expiration cleanup and retries without losing records', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.clock.setFixedTime(now)
    await page.goto('/todo/list')
    await expect(page.getByText('还没有待办，去新增第一条吧。')).toBeVisible()
    await seedTodos(page, [
      todo(1, '过期一', { completedAt: now - week }),
      todo(2, '过期二', { completedAt: now - week }),
      todo(3, '未完成'),
    ])
    await page.evaluate(() => {
      const originalDelete = IDBObjectStore.prototype.delete
      let deletes = 0
      IDBObjectStore.prototype.delete = function (key) {
        const request = originalDelete.call(this, key)
        if (this.name === 'todos' && ++deletes === 2) this.transaction.abort()
        return request
      }
    })
    await page.getByRole('link', { name: '新增待办', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('无法读取或清理本地待办')
    expect((await readStoredTodos(page)).map((record) => record.id)).toEqual([1, 2, 3])
    await page.getByRole('button', { name: '重试加载', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect((await readStoredTodos(page)).map((record) => record.id)).toEqual([3])
    expect(pageErrors).toEqual([])
  })
})
