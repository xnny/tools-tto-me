import { describe, expect, it } from 'vitest'
import router from '../router'
import worker from '../../public/_worker.js'

const html = () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
const env = { ASSETS: { fetch: async () => html() } }

describe('Pages SPA response status', () => {
  it.each([
    '/', '/calendar', '/CALENDAR/', '/timezone', '/timezone/',
    '/timezone/utc', '/TIMEZONE/UTC/', '/timezone/utc+8', '/TIMEZONE/UTC-8/', '/timezone/utc+99',
    '/timezone/utf-8', '/timezone/utc8', '/timezone/utc+100',
    '/calendar/extra', '/unknown', '/assets/missing.js',
  ])('matches the client router for %s', async (path) => {
    const response = await worker.fetch(new Request(`https://example.com${path}`), env)
    expect(response.status).toBe(router.resolve(path).name === 'NotFound' ? 404 : 200)
  })

  it('serves the UTC route successfully', async () => {
    expect(router.resolve('/timezone/utc').name).toBe('TimezoneConverter')
    const response = await worker.fetch(new Request('https://example.com/timezone/utc'), env)
    expect(response.status).toBe(200)
  })

  it('preserves static assets and their existing errors', async () => {
    const assetEnv = { ASSETS: { fetch: async () => new Response('asset', { headers: { 'content-type': 'application/javascript' } }) } }
    expect((await worker.fetch(new Request('https://example.com/assets/app.js'), assetEnv)).status).toBe(200)
    const missingEnv = { ASSETS: { fetch: async () => new Response('missing', { status: 404 }) } }
    expect((await worker.fetch(new Request('https://example.com/assets/missing.js'), missingEnv)).status).toBe(404)
  })
})
