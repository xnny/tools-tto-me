export interface TodoParseResult {
  items: string[]
  error: string | null
}

export const parseTodoInput = (input: string): TodoParseResult => {
  const segments = input.replace(/\r\n?/g, '\n').split('```')

  if (segments.length % 2 === 0) {
    return { items: [], error: '多行待办的三反引号尚未闭合，请补齐后再添加。' }
  }

  const items: string[] = []

  segments.forEach((segment, index) => {
    const lines = segment.split('\n')

    if (index % 2 === 0) {
      items.push(...lines.map((line) => line.trim()).filter(Boolean))
      return
    }

    // Only remove blank boundary lines: indentation inside a block is meaningful.
    const start = lines.findIndex((line) => line.trim() !== '')
    if (start === -1) return

    let end = lines.length
    while (end > start && lines[end - 1]?.trim() === '') end--
    items.push(lines.slice(start, end).join('\n'))
  })

  return { items, error: null }
}
