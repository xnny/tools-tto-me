import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface RecentTimezone {
  offsetHours: number
  lastUsedAt: number
}

interface TimezoneHistoryDB extends DBSchema {
  'recent-timezones': {
    key: number
    value: RecentTimezone
  }
}

let databasePromise: Promise<IDBPDatabase<TimezoneHistoryDB>> | undefined

const getDatabase = () => {
  databasePromise ??= openDB<TimezoneHistoryDB>('tto-timezone', 1, {
    upgrade(database) {
      database.createObjectStore('recent-timezones', { keyPath: 'offsetHours' })
    },
    blocking() {
      void databasePromise?.then((database) => database.close())
      databasePromise = undefined
    },
    terminated() {
      databasePromise = undefined
    },
  }).catch((error: unknown) => {
    databasePromise = undefined
    throw error
  })

  return databasePromise
}

export const getRecentTimezones = async (): Promise<RecentTimezone[]> => {
  const database = await getDatabase()
  const timezones = await database.getAll('recent-timezones')
  return timezones.sort((a, b) => a.offsetHours - b.offsetHours)
}

export const saveRecentTimezone = async (offsetHours: number): Promise<void> => {
  const database = await getDatabase()
  await database.put('recent-timezones', { offsetHours, lastUsedAt: Date.now() })
}

export const removeRecentTimezone = async (offsetHours: number): Promise<void> => {
  const database = await getDatabase()
  await database.delete('recent-timezones', offsetHours)
}
