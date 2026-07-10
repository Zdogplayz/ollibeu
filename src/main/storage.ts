import { promises as fs } from 'fs'
import path from 'path'
import { DEFAULT_SETTINGS, type OllibeuData } from '../shared/types'

export function emptyData(): OllibeuData {
  return {
    tasks: [],
    settings: { ...DEFAULT_SETTINGS, idleDing: { ...DEFAULT_SETTINGS.idleDing } },
    appState: {}
  }
}

export async function loadData(filePath: string): Promise<OllibeuData> {
  let parsed: Partial<OllibeuData>
  try {
    parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return emptyData()
  }
  const base = emptyData()
  return {
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    settings: {
      ...base.settings,
      ...parsed.settings,
      idleDing: { ...base.settings.idleDing, ...parsed.settings?.idleDing }
    },
    appState: { ...parsed.appState }
  }
}

export async function saveData(filePath: string, data: OllibeuData): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}
