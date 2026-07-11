import type { CalendarEvent } from '../../shared/types'
import { mapGoogleEvent } from '../../shared/gcal'
import type { RemoteGtask } from '../../shared/gtasksMerge'

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>

const CAL = 'https://www.googleapis.com/calendar/v3'
const TASKS = 'https://tasks.googleapis.com/tasks/v1'
const MAX_PAGES = 3

export class GoogleApi {
  constructor(
    private readonly getToken: () => Promise<string>,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike
  ) {}

  private async request(url: string, init?: { method?: string; body?: string }): Promise<unknown> {
    const tokenValue = await this.getToken()
    const res = await this.fetchImpl(url, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${tokenValue}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(init?.body ? { body: init.body } : {})
    })
    if (!res.ok) throw new Error(`google-api:${res.status}`)
    return res.json()
  }

  async listEvents(timeMinIso: string, timeMaxIso: string): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = []
    let pageToken: string | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '100',
        timeMin: timeMinIso,
        timeMax: timeMaxIso,
        ...(pageToken ? { pageToken } : {})
      })
      const body = (await this.request(`${CAL}/calendars/primary/events?${params}`)) as {
        items?: unknown[]
        nextPageToken?: string
      }
      for (const item of body.items ?? []) {
        const mapped = mapGoogleEvent(item)
        if (mapped) events.push(mapped)
      }
      pageToken = body.nextPageToken
      if (!pageToken) break
    }
    return events
  }

  async listAllTasks(): Promise<{ tasks: RemoteGtask[]; complete: boolean }> {
    const listsBody = (await this.request(`${TASKS}/users/@me/lists?maxResults=50`)) as {
      items?: { id?: unknown }[]
    }
    const out: RemoteGtask[] = []
    let complete = true
    for (const list of listsBody.items ?? []) {
      if (typeof list.id !== 'string') continue
      let pageToken: string | undefined
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const params = new URLSearchParams({
          showCompleted: 'true',
          showHidden: 'true',
          maxResults: '100',
          ...(pageToken ? { pageToken } : {})
        })
        const body = (await this.request(
          `${TASKS}/lists/${encodeURIComponent(list.id)}/tasks?${params}`
        )) as { items?: { id?: unknown; title?: unknown; due?: unknown; status?: unknown }[]; nextPageToken?: string }
        for (const item of body.items ?? []) {
          if (typeof item.id !== 'string') continue
          out.push({
            id: item.id,
            listId: list.id,
            title: typeof item.title === 'string' ? item.title : '',
            due: typeof item.due === 'string' ? item.due : undefined,
            completed: item.status === 'completed'
          })
        }
        pageToken = body.nextPageToken
        if (!pageToken) break
        if (page === MAX_PAGES - 1) {
          complete = false
          console.warn('[ollibeu] task list truncated; skipping deletion pass this sync')
        }
      }
    }
    return { tasks: out, complete }
  }

  async patchTaskCompleted(listId: string, taskId: string): Promise<void> {
    await this.request(
      `${TASKS}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }
    )
  }
}
