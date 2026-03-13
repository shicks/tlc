/**
 * Initiates a download in the browser.
 */
export function downloadData(
  data: Uint8Array,
  filename: string,
  type: string = 'text/csv',
): void {
  const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: type });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();

  // Clean up: remove the link and revoke the URL to free memory
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function isBefore(t1: Temporal.PlainDate, t2: Temporal.PlainDate): boolean {
  return Temporal.PlainDate.compare(t1, t2) < 0;
}

export function isLastYear(t: Temporal.PlainDate): boolean {
  return isBefore(t, july15);
}

export function isThisYear(t: Temporal.PlainDate): boolean {
  return !isBefore(t, july15);
}

export function parseDate(s: string): Temporal.PlainDate {
  const match = /^(\d\d?)\/(\d\d?)\/(\d\d\d?\d?)$/.exec(s);
  if (!match) throw new Error(`Bad date string: ${s}`);
  const [, monthStr, dayStr, yearStr] = match;
  const month = Number(monthStr);
  const day = Number(dayStr);
  const year = Number(yearStr!.length < 4 ? '20' + yearStr : yearStr);
  return Temporal.PlainDate.from({month, day, year});
}

export const today: Temporal.PlainDate = Temporal.Now.plainDateISO();

/**
 * The most recent July 15 (in the past).  This is useful for
 * determining whether a date was "this" year or "last" year.
 */
export const july15: Temporal.PlainDate = (() => {
  const thisJuly = today.with({month: 7, day: 15});
  return isBefore(thisJuly, today) ? thisJuly : thisJuly.subtract({years: 1});
})();

/** Returns a promise that resolves after the given number of seconds */
export function sleep(secs: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, secs * 1000));
}

type OrFalsy<T> = T | false | undefined | null;
export function waitFor<T>(pred: () => OrFalsy<T>): Promise<T> {
  return new Promise<T>(resolve => {
    function check() {
      const result = pred();
      if (result) return resolve(result);
      setTimeout(check, 250);
    }
    check();
  });
}

export function exists<T>(arg: T|undefined|null): arg is T {
  return arg != null;
}
export function assertType<T>(_arg: unknown): asserts _arg is T {}
export function assert(arg: unknown): asserts arg {
  if (!arg) throw new Error(`Assertion failed`);
}

export function queryAll(query: string): HTMLElement[];
export function queryAll<E extends Element = HTMLElement>(query: string, ctor: {new(): E, prototype: E}): E[];
export function queryAll(query: string, ctor = HTMLElement): Element[] {
  return [...document.querySelectorAll(query)].filter(e => e instanceof ctor);
}
