// Inspired by https://danilafe.com/blog/typescript_typesafe_events/
// but using Map, Set, adding `once` and an async version
// `typed-emitter` no longer works properly.

export class EventEmitter<E extends string, T extends Record<E, (...args: any[]) => void>> {
  private __on: { [eventName in keyof T]?: Set<T[eventName]> }
  private __once: { [eventName in keyof T]?: Set<T[eventName]> }

  constructor () {
    this.__on = {}
    this.__once = {}
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): boolean {
    const __on = this.__on[event]
    const __once = this.__once[event]
    delete this.__once[event]
    const count: number = (__on?.size ?? 0) + (__once?.size ?? 0)
    __on?.forEach(h => { h(...args) })
    __once?.forEach(h => { h(...args) })
    return count > 0
  }

  on<K extends keyof T>(event: K, handler: T[K]): this {
    if (this.__on[event] == null) {
      this.__on[event] = new Set()
    }
    this.__on[event]?.add(handler)
    return this
  }

  once<K extends keyof T>(event: K, handler: T[K]): this {
    if (this.__once[event] == null) {
      this.__once[event] = new Set()
    }
    this.__once[event]?.add(handler)
    return this
  }

  async __onceAsync<K extends keyof T>(event: K): Promise<Parameters<T[K]>> {
    // FIXME `as T[K]` might not be needed but I do not know how to address the problem it works around.
    const resolver = (resolve: (_: Parameters<T[K]>) => void): T[K] =>
      ((...args: Parameters<T[K]>): void => { resolve(args) }) as T[K]
    return await new Promise((resolve) => this.once(event, resolver(resolve)))
  }

  removeListener<K extends keyof T>(event: K, handler: T[K]): void {
    this.__on[event]?.delete(handler)
    this.__once[event]?.delete(handler)
  }

  removeAllListeners (): void {
    this.__on = {}
    this.__once = {}
  }
}

export const once = async <
    E extends string,
    T extends Record<string, (...args: any[]) => void>,
    K extends keyof T
    >(emitter: EventEmitter<E, T>, event: K): Promise<Parameters<T[K]>> => await emitter.__onceAsync(event)
