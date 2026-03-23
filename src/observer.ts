// Install observers to scrape the page when something changes.

import { timeout } from './util';

type Handler = () => void;
const observers = new Map<string, Handler[]>();

const DELAY = Temporal.Duration.from({seconds: 2});
let queued: AbortController|undefined = undefined;

async function callback() {
  let q = queued;
  if (q) {
    q.abort(new Error('waiting'));
  }
  q = queued = new AbortController();
  try {
    await timeout(DELAY, {signal: queued.signal});
    handleChange();
  } catch {
    // ignore
  }
  if (queued === q) {
    q.abort(new Error('obsolete'));
    queued = undefined;
  }    
}

function handleChange() {
  for (const handler of observers.get(location.pathname) || []) {
    handler();
  }
}

new MutationObserver(callback).observe(document.body, {
  childList: true,
  subtree: true,
})

// Trigger a mutation on first load
if (document.readyState === 'complete') {
  void callback();
} else {
  document.addEventListener('load', callback, {once: true});
}

/** If a change is queued, handle it now. */
export function handleDocumentChangeImmediately() {
  if (!queued) return;
  queued.abort(new Error('forced'));
  try {
    handleChange();
  } catch (err: unknown) {
    // rethrow the error asynchronously
    setTimeout(() => { throw err; }, 0);
  }
}

/** Add a handler to run any time the document changes. */
export function addDocumentChangeListener(path: string, handler: () => void) {
  observers.getOrInsert(path, []).push(handler);
}
