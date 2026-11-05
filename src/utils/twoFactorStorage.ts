import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { validateTotpConfig, type TotpConfig, type TotpRecord } from './twoFactor'

interface TwoFactorDatabase extends DBSchema {
  records: {
    key: number
    value: Omit<TotpRecord, 'id'> & { id?: number }
  }
}

let databasePromise: Promise<IDBPDatabase<TwoFactorDatabase>> | undefined

const getDatabase = async (): Promise<IDBPDatabase<TwoFactorDatabase>> => {
  if (!databasePromise) {
    const opening = openDB<TwoFactorDatabase>('tto-2af', 1, {
      upgrade(database) {
        database.createObjectStore('records', { keyPath: 'id', autoIncrement: true })
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

export const getTwoFactorRecords = async (): Promise<TotpRecord[]> => {
  const database = await getDatabase()
  const records = await database.getAll('records')
  return records
    .map((record) => {
      if (record.id === undefined) throw new Error('Two-factor record is missing its ID')
      return { ...validateTotpConfig(record), id: record.id, createdAt: record.createdAt }
    })
    .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
}

export const addTwoFactorRecord = async (config: TotpConfig): Promise<TotpRecord> => {
  const record = { ...validateTotpConfig(config), createdAt: Date.now() }
  const database = await getDatabase()
  const transaction = database.transaction('records', 'readwrite')
  const [id] = await Promise.all([transaction.store.add(record), transaction.done])
  return { ...record, id }
}

export const removeTwoFactorRecord = async (id: number): Promise<void> => {
  const database = await getDatabase()
  await database.delete('records', id)
}
