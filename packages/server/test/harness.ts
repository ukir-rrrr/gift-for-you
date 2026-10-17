import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { createApp } from '../src/app'
import type { Env } from '../src/env'

/** Enough of D1 for the worker, backed by node:sqlite so the real SQL runs. */
class Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: SQLInputValue[] = [],
  ) {}

  bind(...params: unknown[]) {
    for (const value of params) if (value === undefined) throw new Error('D1_TYPE_ERROR: undefined bind')
    return new Statement(this.db, this.sql, params as SQLInputValue[])
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null
  }

  async all<T>(): Promise<{ results: T[]; success: true }> {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true }
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.params)
    return { success: true, meta: { changes: Number(result.changes) } }
  }
}

export function fakeD1(): D1Database {
  const db = new DatabaseSync(':memory:')
  // D1 enforces foreign keys; so does the fake.
  db.exec('PRAGMA foreign_keys = ON')
  const dir = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(dir).sort()) db.exec(readFileSync(new URL(file, dir), 'utf8'))
  return {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (statements: Statement[]) => {
      db.exec('BEGIN')
      try {
        const out = []
        for (const statement of statements) out.push(await statement.run())
        db.exec('COMMIT')
        return out
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },
  } as unknown as D1Database
}

export type FakeBucket = R2Bucket & { objects: Map<string, { bytes: Uint8Array; contentType?: string }> }

export function fakeR2(): FakeBucket {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>()
  const bucket = {
    objects,
    async put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { bytes: new Uint8Array(value), contentType: options?.httpMetadata?.contentType })
      return { key }
    },
    async get(key: string) {
      const entry = objects.get(key)
      if (!entry) return null
      return {
        key,
        httpMetadata: { contentType: entry.contentType },
        body: new Blob([entry.bytes]).stream(),
        arrayBuffer: async () => entry.bytes.slice().buffer,
      }
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key)
    },
    async list({ prefix = '' }: { prefix?: string } = {}) {
      return { objects: [...objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })), truncated: false }
    },
  }
  return bucket as unknown as FakeBucket
}

export function deviceKey(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
}

export function setup(overrides: Partial<Env> = {}) {
  const clock = { now: Date.parse('2026-10-16T00:00:00Z') }
  const env: Env = {
    DB: fakeD1(),
    PHOTOS: fakeR2(),
    PUBLIC_ORIGIN: 'https://gift.example',
    CORS_ORIGINS: 'http://127.0.0.1:8081',
    MODERATION: 'mock',
    PURCHASE: 'sandbox-mock',
    NOTIFIER: 'mock',
    MOCK_INSPECT: '1',
    ...overrides,
  }
  const app = createApp({ now: () => clock.now })
  const request = (path: string, init: RequestInit & { key?: string } = {}) => {
    const headers = new Headers(init.headers)
    if (init.key) headers.set('authorization', `Device ${init.key}`)
    return app.fetch(new Request(`https://gift.example${path}`, { ...init, headers }), env)
  }
  return { env, clock, request, bucket: env.PHOTOS as FakeBucket }
}
