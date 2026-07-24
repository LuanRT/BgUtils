type Listener = (...args: any[]) => void;

export class EventEmitterLike {
  #listeners = new Map<string, Set<Listener>>();
  #onceWrappers = new Map<Listener, Map<string, Listener>>();

  emit(type: string, ...args: any[]) {
    const listeners = this.#listeners.get(type);
    if (!listeners || listeners.size === 0)
      return;

    // Snaapshot listeners so removals during emit do not affect current iteration.
    for (const listener of [ ...listeners ]) {
      listener(...args);
    }
  }

  on(type: string, listener: Listener) {
    let listeners = this.#listeners.get(type);

    if (!listeners) {
      listeners = new Set<Listener>();
      this.#listeners.set(type, listeners);
    }

    listeners.add(listener);
  }

  once(type: string, listener: Listener) {
    const wrapper: Listener = (...args: any[]) => {
      this.off(type, listener);
      listener(...args);
    };

    let wrappersByType = this.#onceWrappers.get(listener);

    if (!wrappersByType) {
      wrappersByType = new Map<string, Listener>();
      this.#onceWrappers.set(listener, wrappersByType);
    }

    wrappersByType.set(type, wrapper);
    this.on(type, wrapper);
  }

  off(type: string, listener: Listener) {
    const listeners = this.#listeners.get(type);
    if (!listeners)
      return;

    let target = listener;
    const wrappersByType = this.#onceWrappers.get(listener);

    if (wrappersByType) {
      const onceWrapper = wrappersByType.get(type);

      if (onceWrapper) {
        target = onceWrapper;
        wrappersByType.delete(type);

        if (wrappersByType.size === 0)
          this.#onceWrappers.delete(listener);
      }
    }

    listeners.delete(target);

    if (listeners.size === 0)
      this.#listeners.delete(type);
  }

  removeAllListeners(type?: string) {
    if (!type) {
      this.#listeners.clear();
      this.#onceWrappers.clear();
      return;
    }

    this.#listeners.delete(type);

    for (const [ listener, wrappersByType ] of this.#onceWrappers.entries()) {
      wrappersByType.delete(type);

      if (wrappersByType.size === 0)
        this.#onceWrappers.delete(listener);
    }
  }
}
