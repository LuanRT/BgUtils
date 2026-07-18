// See https://github.com/nodejs/node/issues/40678#issuecomment-1126944677
class CustomEvent extends Event {
  #detail;

  constructor(type: string, options?: CustomEventInit<any[]>) {
    super(type, options);
    this.#detail = options?.detail ?? null;
  }

  get detail(): any[] | null {
    return this.#detail;
  }
}

export class EventEmitterLike extends EventTarget {
  #legacyListeners = new Map<(...args: any[]) => void, { type: string, wrapper: EventListener }>();

  constructor() {
    super();
  }

  emit(type: string, ...args: any[]) {
    const event = new CustomEvent(type, { detail: args });
    this.dispatchEvent(event);
  }

  on(type: string, listener: (...args: any[]) => void) {
    const wrapper: EventListener = (ev) => {
      if (ev instanceof CustomEvent) {
        listener(...ev.detail as any[]);
      } else {
        listener(ev);
      }
    };
    this.#legacyListeners.set(listener, { type, wrapper });
    this.addEventListener(type, wrapper);
  }

  once(type: string, listener: (...args: any[]) => void) {
    const wrapper: EventListener = (ev) => {
      if (ev instanceof CustomEvent) {
        listener(...ev.detail as any[]);
      } else {
        listener(ev);
      }
      this.off(type, listener);
    };
    this.#legacyListeners.set(listener, { type, wrapper });
    this.addEventListener(type, wrapper);
  }

  off(type: string, listener: (...args: any[]) => void) {
    const listenerData = this.#legacyListeners.get(listener);
    if (listenerData && listenerData.type === type) {
      this.removeEventListener(type, listenerData.wrapper);
      this.#legacyListeners.delete(listener);
    }
  }

  removeAllListeners(type?: string) {
    if (type) {
      for (const [ listener, listenerData ] of this.#legacyListeners.entries()) {
        if (listenerData.type === type) {
          this.removeEventListener(type, listenerData.wrapper);
          this.#legacyListeners.delete(listener);
        }
      }
    } else {
      for (const [ listener, listenerData ] of this.#legacyListeners.entries()) {
        this.removeEventListener(listenerData.type, listenerData.wrapper);
        this.#legacyListeners.delete(listener);
      }
    }
  }
}