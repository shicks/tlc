// Manages database in localStorage.

import * as v from 'valibot';

interface DbOptions<T> {
  onUpdate?: (value: T) => void;
  replacer?: (key: string, val: unknown) => unknown;
}

export class Db<T> {
  private fresh = false;
  private json = 'X';
  private value: T|undefined = undefined;

  private readonly onUpdate: (value: T) => void;
  private readonly replacer: ((key: string, val: unknown) => unknown) | undefined;

  constructor(
    private readonly key: string,
    private readonly schema: v.BaseSchema<any, T, any>,
    private readonly start: T,
    opts: DbOptions<T> = {},
  ) {
    this.onUpdate = opts?.onUpdate || (() => {});
    this.replacer = opts?.replacer;
  }

  markFresh() {
    this.fresh = true;
    Promise.resolve().then(() => this.fresh = false);
  }

  get(): T {
    if (this.fresh) return this.value!;
    let stored = localStorage.getItem(this.key);
    if (stored == undefined) {
      this.markFresh();
      stored = JSON.stringify((this.value = this.start), this.replacer);
      this.onUpdate(this.value);
      localStorage.setItem(this.key, stored);
      return this.value;
    }
    this.markFresh();
    if (this.json === stored) return this.value!;
    this.onUpdate((this.value = v.parse(this.schema, JSON.parse((this.json = stored)))));
    return this.value;
  }

  set(value: T): void {
    this.markFresh();
    this.onUpdate((this.value = value));
    localStorage.setItem(this.key, (this.json = JSON.stringify(value, this.replacer)));
  }

  update(fn: (value: T) => T): void {
    if (this.fresh) return this.set(fn(this.value!));
    let stored = localStorage.getItem(this.key);
    if (stored == undefined) stored = JSON.stringify((this.value = this.start), this.replacer);
    const value = this.json === stored ? this.value! :
      v.parse(this.schema, JSON.parse(stored));
    this.set(fn(value));
  }
}
