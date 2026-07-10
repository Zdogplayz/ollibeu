import type { OllibeuData } from '@shared/types'

declare global {
  interface Window {
    ollibeu: {
      loadData(): Promise<OllibeuData>
      saveData(data: OllibeuData): Promise<void>
    }
  }
}

export {}
