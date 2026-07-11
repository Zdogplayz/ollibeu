import { describe, expect, it } from 'vitest'
import { GoogleApi } from '../src/main/google/api'

function stubFetch(routes: Record<string, unknown | ((url: string, init?: unknown) => unknown)>) {
  const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = []
  const impl = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, init })
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' }
    const val = routes[key]
    const body = typeof val === 'function' ? (val as (u: string, i?: unknown) => unknown)(url, init) : val
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
  }
  return { impl, calls }
}

const token = async (): Promise<string> => 'tok-123'

describe('GoogleApi', () => {
  it('lists events with auth header and query params, mapping and dropping junk', async () => {
    const { impl, calls } = stubFetch({
      '/calendars/primary/events': {
        items: [
          { id: 'e1', summary: 'Dentist', status: 'confirmed', start: { dateTime: '2026-07-10T16:00:00' }, end: { dateTime: '2026-07-10T17:00:00' } },
          { id: 'gone', status: 'cancelled', start: { date: '2026-07-10' }, end: { date: '2026-07-11' } },
          { junk: true }
        ]
      }
    })
    const api = new GoogleApi(token, impl)
    const events = await api.listEvents('2026-07-10T00:00:00Z', '2026-07-12T00:00:00Z')
    expect(events.map((e) => e.id)).toEqual(['e1'])
    expect(calls[0].init?.headers?.Authorization).toBe('Bearer tok-123')
    expect(calls[0].url).toContain('singleEvents=true')
    expect(calls[0].url).toContain('timeMin=')
  })

  it('follows nextPageToken up to a bounded number of pages', async () => {
    let page = 0
    const { impl, calls } = stubFetch({
      '/calendars/primary/events': () => {
        page += 1
        return page < 5
          ? { items: [{ id: `e${page}`, status: 'confirmed', start: { dateTime: '2026-07-10T10:00:00' }, end: { dateTime: '2026-07-10T11:00:00' } }], nextPageToken: 'next' }
          : { items: [] }
      }
    })
    const api = new GoogleApi(token, impl)
    const events = await api.listEvents('a', 'b')
    expect(events.length).toBeLessThanOrEqual(3)
    expect(calls.length).toBeLessThanOrEqual(3)
  })

  it('aggregates tasks across lists', async () => {
    const { impl } = stubFetch({
      '/users/@me/lists': { items: [{ id: 'L1' }, { id: 'L2' }] },
      '/lists/L1/tasks': { items: [{ id: 'g1', title: 'One', status: 'needsAction' }] },
      '/lists/L2/tasks': { items: [{ id: 'g2', title: 'Two', status: 'completed', due: '2026-07-15T00:00:00.000Z' }, { title: 'no id' }] }
    })
    const api = new GoogleApi(token, impl)
    const tasks = await api.listAllTasks()
    expect(tasks).toEqual([
      { id: 'g1', listId: 'L1', title: 'One', due: undefined, completed: false },
      { id: 'g2', listId: 'L2', title: 'Two', due: '2026-07-15T00:00:00.000Z', completed: true }
    ])
  })

  it('patches completion and throws a status error on failure', async () => {
    const { impl, calls } = stubFetch({ '/lists/L1/tasks/g1': {} })
    const api = new GoogleApi(token, impl)
    await api.patchTaskCompleted('L1', 'g1')
    expect(calls[0].init?.method).toBe('PATCH')
    expect(calls[0].init?.body).toContain('completed')

    const bad = new GoogleApi(token, async () => ({ ok: false, status: 403, json: async () => ({}), text: async () => 'nope' }))
    await expect(bad.patchTaskCompleted('L1', 'g1')).rejects.toThrow('google-api:403')
  })
})
