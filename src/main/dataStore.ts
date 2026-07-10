import type { OllibeuData } from '../shared/types'
import { loadData, saveData } from './storage'

type ChangeListener = (data: OllibeuData) => void
type TroubleListener = (trouble: boolean) => void

export class DataStore {
  private data: OllibeuData
  private readonly filePath: string
  private queue: Promise<void> = Promise.resolve()
  private changeListeners = new Set<ChangeListener>()
  private troubleListeners = new Set<TroubleListener>()
  private inTrouble = false

  private constructor(filePath: string, initial: OllibeuData) {
    this.filePath = filePath
    this.data = initial
  }

  static async open(filePath: string): Promise<DataStore> {
    const initial = await loadData(filePath)
    return new DataStore(filePath, initial)
  }

  get(): OllibeuData {
    return this.data
  }

  onChange(cb: ChangeListener): () => void {
    this.changeListeners.add(cb)
    return () => this.changeListeners.delete(cb)
  }

  onSaveTrouble(cb: TroubleListener): () => void {
    this.troubleListeners.add(cb)
    return () => this.troubleListeners.delete(cb)
  }

  private save(data: OllibeuData): Promise<void> {
    return saveData(this.filePath, data)
  }

  private notifyChange(snapshot: OllibeuData): void {
    for (const cb of this.changeListeners) {
      try {
        cb(snapshot)
      } catch {
        // listener errors must never affect the store
      }
    }
  }

  private setTrouble(trouble: boolean): void {
    if (this.inTrouble === trouble) return
    this.inTrouble = trouble
    for (const cb of this.troubleListeners) {
      try {
        cb(trouble)
      } catch {
        // listener errors must never affect the store
      }
    }
  }

  async mutate(fn: (d: OllibeuData) => OllibeuData): Promise<void> {
    this.data = fn(this.data)
    const snapshot = this.data
    this.notifyChange(snapshot)
    this.queue = this.queue.then(async () => {
      try {
        await this.save(snapshot)
        this.setTrouble(false)
      } catch {
        this.setTrouble(true)
      }
    })
    await this.queue
  }
}
