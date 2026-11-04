import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface Todo {
  id: number
  content: string
  createdAt: number
  completedAt: number
  autoDelete: boolean
}

interface TodoDatabase extends DBSchema {
  todos: {
    key: number
    value: Omit<Todo, 'id'> & { id?: number }
  }
}

let databasePromise: Promise<IDBPDatabase<TodoDatabase>> | undefined

const getDatabase = async (): Promise<IDBPDatabase<TodoDatabase>> => {
  if (!databasePromise) {
    const opening = openDB<TodoDatabase>('tto-tools-todos', 1, {
      upgrade(database) {
        database.createObjectStore('todos', { keyPath: 'id', autoIncrement: true })
      },
      blocking() {
        void opening.then((database) => database.close())
        if (databasePromise === opening) databasePromise = undefined
      },
      terminated() {
        if (databasePromise === opening) databasePromise = undefined
      },
    })

    databasePromise = opening
    void opening.catch(() => {
      if (databasePromise === opening) databasePromise = undefined
    })
  }

  return databasePromise
}

export const getTodos = async (): Promise<Todo[]> => {
  const database = await getDatabase()
  const records = await database.getAll('todos')

  // getAll returns records in primary-key order, preserving insertion order.
  return records.map((record) => {
    if (record.id === undefined) throw new Error('Todo is missing its ID')
    return { ...record, id: record.id }
  })
}

// Called only when a todo page is opened (or its failed initialization is retried).
export const clearExpiredTodos = async (): Promise<void> => {
  const database = await getDatabase()
  const transaction = database.transaction('todos', 'readwrite')
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000

  await Promise.all([
    transaction.store.getAll().then((records) =>
      Promise.all(
        records
          .filter((todo) => todo.autoDelete && todo.completedAt > 0 && todo.completedAt <= cutoff)
          .map((todo) => {
            if (todo.id === undefined) throw new Error('Todo is missing its ID')
            return transaction.store.delete(todo.id)
          }),
      ),
    ),
    transaction.done,
  ])
}

export const addTodos = async (contents: string[]): Promise<Todo[]> => {
  if (contents.length === 0) return []

  const createdAt = Date.now()
  const records = contents.map((content) => ({
    content,
    createdAt,
    completedAt: 0,
    autoDelete: true,
  }))
  const database = await getDatabase()
  const transaction = database.transaction('todos', 'readwrite')

  // Observe both request errors and the commit; a failed request rolls back the batch.
  const [todos] = await Promise.all([
    Promise.all(
      records.map(async (record) => ({ ...record, id: await transaction.store.add(record) })),
    ),
    transaction.done,
  ])

  return todos
}

export const updateTodo = async (
  id: number,
  changes: Partial<Pick<Todo, 'content' | 'completedAt' | 'autoDelete'>>,
): Promise<Todo> => {
  const database = await getDatabase()
  const transaction = database.transaction('todos', 'readwrite')
  const [todo] = await Promise.all([
    transaction.store.get(id).then(async (record) => {
      if (!record) throw new Error('Todo no longer exists')
      const updated = { ...record, ...changes, id }
      await transaction.store.put(updated)
      return updated
    }),
    transaction.done,
  ])

  return todo
}

export const removeTodo = async (id: number): Promise<void> => {
  const database = await getDatabase()
  await database.delete('todos', id)
}
