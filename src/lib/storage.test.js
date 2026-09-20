import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as storage from './storage.js'

/**
 * Отметка о переезде — единственное, что мешает локальному расписанию
 * попасть во второй аккаунт на том же компьютере. Проверяем её отдельно,
 * в том числе поведение в приватном режиме, где localStorage бросает.
 */

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
}

function install(impl) {
  Object.defineProperty(globalThis, 'localStorage', { value: impl, configurable: true, writable: true })
}

beforeEach(() => install(fakeStorage()))

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original)
  else delete globalThis.localStorage
})

describe('отметка о переезде в аккаунт', () => {
  it('на чистом браузере переезда ещё не было', () => {
    expect(storage.migratedTo()).toBeNull()
  })

  it('запоминает, в какой аккаунт уехало расписание', () => {
    storage.markMigrated('33634725-f203-4e14-aa61-8e396d252cdc')

    expect(storage.migratedTo()).toBe('33634725-f203-4e14-aa61-8e396d252cdc')
  })

  it('отметка переживает смену аккаунта: второй вход её видит', () => {
    storage.markMigrated('первый')

    // Другой пользователь на том же компьютере — отметка на месте.
    expect(storage.migratedTo()).not.toBeNull()
  })

  it('локальный снимок при этом не стирается: он остаётся копией', () => {
    storage.saveNow({ version: 2, bells: [{ id: 'b1' }] })
    storage.markMigrated('кто-то')

    expect(storage.load()).not.toBeNull()
  })

  it('в приватном режиме не падает, а честно говорит «переезда не было»', () => {
    install({
      getItem: () => {
        throw new Error('доступ к хранилищу запрещён')
      },
      setItem: () => {
        throw new Error('доступ к хранилищу запрещён')
      },
      removeItem: () => {},
    })

    expect(() => storage.markMigrated('кто-то')).not.toThrow()
    expect(storage.migratedTo()).toBeNull()
  })
})
