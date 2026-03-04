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

/**
 * The most recent July 15 (in the past).  This is useful for
 * determining whether a date was "this" year or "last" year.
 */
export const july15: Date = (() => {
    const now = new Date();
    let d = new Date(now.getFullYear(), 6, 15);
    if (now < d) d = new Date(now.getFullYear() - 1, 6, 15);
    return d;
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
