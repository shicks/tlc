// Manages database in localStorage.

import * as v from 'valibot';

export class Db<T> {
  private fresh = false;
  private json = 'X';
  private value: T|undefined = undefined;

  constructor(
    private readonly key: string,
    private readonly schema: v.GenericSchema<T>,
    private readonly start: T,
    private readonly update: (value: T) => void = () => {},
  ) {}

  markFresh() {
    this.fresh = true;
    Promise.resolve().then(() => this.fresh = false);
  }

  get(): T {
    if (this.fresh) return this.value!;
    let stored = localStorage.getItem(this.key);
    if (stored == undefined) {
      this.markFresh();
      stored = JSON.stringify((this.value = this.start));
      this.update(this.value);
      localStorage.setItem(this.key, stored);
      return this.value;
    }
    this.markFresh();
    if (this.json === stored) return this.value!;
    this.update((this.value = v.parse(this.schema, JSON.parse((this.json = stored)))));
    return this.value;
  }

  set(value: T): void {
    this.markFresh();
    this.update((this.value = value));
    localStorage.setItem(this.key, (this.json = JSON.stringify(value)));
  }
}
