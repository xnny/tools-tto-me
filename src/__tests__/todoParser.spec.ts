import { describe, expect, it } from 'vitest'
import { parseTodoInput } from '../utils/todoParser'

describe('todo input parsing', () => {
  it.each([
    { name: 'empty input', input: '', items: [] },
    { name: 'whitespace', input: '  \n\t\n', items: [] },
    { name: 'ordinary lines', input: ' 买牛奶 \n\n 回复邮件\t', items: ['买牛奶', '回复邮件'] },
    { name: 'duplicates', input: '买牛奶\n买牛奶', items: ['买牛奶', '买牛奶'] },
    { name: 'inline fences', input: '```todo data```', items: ['todo data'] },
    {
      name: 'multiline blocks mixed with ordinary lines',
      input: '买牛奶\n```\n准备周报\n  整理进展\n\n  下周计划\n```\n回复邮件',
      items: ['买牛奶', '准备周报\n  整理进展\n\n  下周计划', '回复邮件'],
    },
    {
      name: 'multiple blocks and adjacent text',
      input: '前面```第一条\n详情```中间\n```第二条\n详情```后面',
      items: ['前面', '第一条\n详情', '中间', '第二条\n详情', '后面'],
    },
    {
      name: 'blank boundary lines with indentation preserved',
      input: '```\n \n  标题  \n\t详情\n\t\n```',
      items: ['  标题  \n\t详情'],
    },
    { name: 'empty blocks', input: '``````\n```\n \n```\n保留', items: ['保留'] },
    {
      name: 'Windows and old Mac line endings',
      input: '第一条\r\n```\r\n第二条\r详情\r\n```\r第三条',
      items: ['第一条', '第二条\n详情', '第三条'],
    },
    { name: 'no special todo language marker', input: '```todo\n详情```', items: ['todo\n详情'] },
    {
      name: 'single and double backticks',
      input: '`代码`\n``正文``',
      items: ['`代码`', '``正文``'],
    },
  ])('parses $name', ({ input, items }) => {
    expect(parseTodoInput(input)).toEqual({ items, error: null })
  })

  it.each(['```', '第一条\n```第二条\n详情', '```完整```\n普通行\n```未完成'])(
    'rejects the whole batch when a fence is unclosed: %s',
    (input) => {
      const result = parseTodoInput(input)
      expect(result.items).toEqual([])
      expect(result.error).toContain('尚未闭合')
    },
  )
})
