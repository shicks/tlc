// Utilities for adding UI elements.

import { assertType } from './util';

export type ButtonFn<T> = (resolve: (value: T) => void, reject: (err: Error) => void) => void;

export interface DialogOpts<T> {
  contents: HTMLElement[];
  buttons: Record<string, ButtonFn<T>>;
  keys?: Record<string, ButtonFn<T>>;
}

const RESOLVE: ButtonFn<void> = (resolve) => resolve();
const CANCEL: ButtonFn<any> = (_resolve, reject) => reject(new Error('Cancalled'));

export class Dialog<T> {
  private readonly reject: (err: Error) => void;
  readonly result: Promise<T>;
  readonly then: Promise<T>['then']; // Make this thenable, for convenience.

  constructor({contents, buttons, keys}: DialogOpts<T>) {
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    for (const e of contents) {
      dialog.appendChild(e);
    }
    const buttonContainer = document.createElement('div');
    dialog.appendChild(buttonContainer);
    Object.assign(dialog.style, {
      display: 'grid',
      gridTemplateColumns: '1fr', // Single column
      gridAutoFlow: 'row',        // Ensures children stack vertically
      gap: '1rem',                // Space between children
      padding: '1.5rem',          // Padding inside the dialog
      alignItems: 'start'         // Prevents children from stretching vertically if not needed
    });
    Object.assign(buttonContainer.style, {
      display: 'grid',
      gridAutoFlow: 'column',      // Forces children into a row
      gridAutoColumns: 'max-content', // Buttons only take as much space as their text
      justifyContent: 'end',       // Aligns the entire grid to the right
      gap: '0.5rem',               // Space between buttons
      marginTop: '1rem'            // Separation from the content above
    });

    let saveReject!: (err: Error) => void;
    this.result = new Promise<T>((resolve, reject) => {
      saveReject = reject;
      let lastButton;
      for (const [label, action] of Object.entries(buttons)) {
        const button = lastButton = document.createElement('button');
        button.textContent = label;
        button.addEventListener('click', () => {
          action(resolve, reject);
        });
        buttonContainer.appendChild(button);
      }
      if (keys) {
        dialog.addEventListener('keydown', (e) => {
          const handler = keys[e.key];
          if (handler) {
            handler(resolve, reject);
            e.preventDefault();
          }
        });
      }
      dialog.showModal();
      if (lastButton) lastButton.focus();
    }).finally(() => {
      dialog.close();
      dialog.remove();
    });
    this.reject = saveReject;
    this.then = this.result.then.bind(this.result);
  }

  cancel(err?: Error): void {
    this.reject(err ?? new Error('Cancelled'));
  }

  static info(message: string): Dialog<void> {
    const p = document.createElement('p');
    p.textContent = message;
    return new Dialog<void>({
      contents: [p],
      buttons: {OK: RESOLVE},
      keys: {Escape: RESOLVE},
    });
  }

  static confirm(message: string): Dialog<void> {
    const p = document.createElement('p');
    p.textContent = message;
    return new Dialog<void>({
      contents: [p],
      buttons: {Cancel: CANCEL, OK: RESOLVE},
      keys: {Escape: CANCEL},
    });
  }

  static textarea(
    text: string,
    buttons: Record<string, (value: string) => string> = {},
  ): Dialog<void> {
    const e = document.createElement('textarea');
    e.value = text;
    e.spellcheck = false;
    e.readOnly = true;
    Object.assign(e.style, {
      width: '800px',
      height: '600px',
      fontFamily: 'monospace',
    });
    return new Dialog<void>({
      contents: [e],
      buttons: {
        ...Object.fromEntries(Object.entries(buttons).map(([label, action]) => {
          return [label, () => e.value = action(e.value)];
        })),
        Copy: () => navigator.clipboard.writeText(e.value),
        OK: RESOLVE,
      },
      keys: {Escape: RESOLVE},
    });
  }

  static editableTextarea(
    text: string,
    buttons: Record<string, (value: string) => string> = {},
  ): Dialog<string> {
    const e = document.createElement('textarea');
    e.value = text;
    e.spellcheck = false;
    Object.assign(e.style, {
      width: '800px',
      height: '600px',
      fontFamily: 'monospace',
    });
    const d = new Dialog<string>({
      contents: [e],
      buttons: {
        ...Object.fromEntries(Object.entries(buttons).map(([label, action]) => {
          return [label, () => e.value = action(e.value)];
        })),
        Cancel: CANCEL,
        OK: (resolve) => resolve(e.value!),
      },
      keys: {Escape: CANCEL},
    });
    preventUnloadUntil(d.result);
    return d;
  }

  // TODO - prompt, etc
}

let preventUnloadCount = 0;
window.addEventListener('beforeunload', (event) => {
  if (preventUnloadCount <= 0) return;
  event.preventDefault();
  event.returnValue = '';
});

export function preventUnloadUntil(p: Promise<any>) {
  preventUnloadCount++;
  p.finally(() => {
    preventUnloadCount--;
  });
}

////////////////////////////////////////////////////////////////

function makeButton(
  label: string,
  action: ButtonAction,
): HTMLElement {
  if (typeof action !== 'function') return makeSubmenu(label, action);
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.addEventListener('click', (e) => {
    (async () => {
      try {
        await action();
      } catch (err: unknown) {
        Dialog.textarea(`FAILURE\n${(err as Error)?.stack || err}`);
      }
    })();
    e.preventDefault();
    e.stopPropagation();
    return false;
  });
  return btn;
}

function makeSubmenu(
  label: string,
  items: ButtonActionMap,
): HTMLElement {
  const mainBtn = dom('button', {
    textContent: `${label} ▼`,
    // style: {
    //   backgroundColor: '#4CAF50',
    //   color: 'white',
    //   padding: '10px 16px',
    //   border: 'none',
    //   cursor: 'pointer',
    //   borderRadius: '4px',
    //   fontWeight: 'bold'
    // },
  });
  const menu = dom(
    'div',
    {
      style: {
        display: 'none', // Hidden by default
        position: 'absolute',
        right: '0',
        backgroundColor: '#f9f9f9',
        minWidth: '160px',
        boxShadow: '0px 8px 16px 0px rgba(0,0,0,0.2)',
        zIndex: '1',
        borderRadius: '4px',
        marginTop: '5px',
        padding: '5px 0'
      },
    },
    ...Object.entries(items).map(([key, action]) => {
      const subBtn = makeButton(key, action);
      Object.assign(subBtn.style, {
        color: 'black',
        padding: '12px 16px',
        display: 'block',
        width: '100%',
        border: 'none',
        background: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'background 0.2s'
      });
      subBtn.addEventListener('mouseenter', () => subBtn.style.backgroundColor = '#f1f1f1');
      subBtn.addEventListener('mouseleave', () => subBtn.style.backgroundColor = 'transparent');
      subBtn.addEventListener('click', (e) => {
        menu.style.display = 'none';
        e.stopPropagation();
      });
      return subBtn;
    }),
  );
  // 5. Toggle Logic
  mainBtn.addEventListener('click', (e) => {
    const isVisible = menu.style.display === 'block';
    menu.style.display = isVisible ? 'none' : 'block';
    e.stopPropagation();
  });

  // Close menu when clicking elsewhere
  window.addEventListener('click', () => {
    menu.style.display = 'none';
  });

  return dom('div', mainBtn, menu);
}

export function appendButtons(
  container: HTMLElement,
  buttons: ButtonActionMap,
): void {
  for (const [label, action] of Object.entries(buttons)) {
    if (container.firstChild) container.appendChild(document.createTextNode(' '));
    container.appendChild(makeButton(label, action));
  }
}

function prependButtons(
  container: HTMLElement,
  buttons: ButtonActionMap,
): void {
  for (const [label, action] of Object.entries(buttons).reverse()) {
    if (container.firstChild) {
      container.insertBefore(document.createTextNode(' '), container.firstChild);
    }
    container.insertBefore(makeButton(label, action), container.firstChild);
  }
}

type ElementSelector = string | RegExp | ((text: string) => boolean);
export function addButtonsAfter(
  heading: ElementSelector,
  buttons: ButtonActionMap,
): void {
  const span = document.createElement('span');
  appendButtons(span, buttons);
  const pred =
    typeof heading === 'function' ? heading :
    heading instanceof RegExp ? ((t: string) => heading.test(t)) :
    ((t: string) => t === heading);
  // TODO - consider other headings/selectors than just h4
  const title = [...$('h4')].find(h => pred(h.textContent.trim()));
  if (!title) return; // log?
  if (title.childElementCount) {
    title.insertBefore(span, title.firstElementChild);
  } else {
    title.appendChild(span);
  }
}

interface ButtonActionMap {
  [label: string]: ButtonAction;
}
type ButtonAction = (() => any) | ButtonActionMap;

export function insertButtonsAtStart(
  selector: string,
  buttons: ButtonActionMap,
): void {
  const [container, ...rest] = document.querySelectorAll(selector);
  assertType<HTMLElement>(container);
  if (!container) throw new Error(`Not found: ${selector}`);
  if (rest.length) throw new Error(`Not unique: ${selector}`);
  prependButtons(container, buttons);
}

export function addButtonsToTop(buttons: ButtonActionMap): void {
  const bar = document.querySelector('.nav.navbar-nav.navbar-left')!;
  for (const [label, action] of Object.entries(buttons)) {
    const li = document.createElement('li');
    const button = makeButton(label, action);
    Object.assign(button.style, {
      margin: '4px',
    });
    li.appendChild(button);
    bar.appendChild(li);
  }
}

export function pickElement(query: string, name = 'valid element'): Promise<HTMLElement> {
  // TODO - change cursor, maybe add a mousemove listener to highlight?
  return new Promise((resolve, reject) => {
    function listener(e: Event) {
      const ancestor = (e.target as HTMLElement).closest(query);
      if (!ancestor) return reject(new Error(`Not a ${name}: ${e.target}`));
      resolve(ancestor as HTMLElement);
    }
    document.body.addEventListener('click', listener, {capture: true, once: true});
  });
}

interface ExtraAttrs {
  parent: Element;
  style: string|Record<string, string>;
}
type DomAttrs<E> = {
  [K in keyof E|keyof ExtraAttrs]?:
  K extends keyof ExtraAttrs ? ExtraAttrs[K] :
    K extends keyof E ? E[K] : never
};
type DomArg<K extends keyof HTMLElementTagNameMap> =
    string|Node|DomAttrs<HTMLElementTagNameMap[K]>;
export function dom<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  ...rest: DomArg<K>[]
): HTMLElementTagNameMap[K];
export function dom<K extends 'text'>(tag: K, value: string): Text;
export function dom(tag: string, ...rest: any[]): Node {
  const e = tag === 'text' ?
    document.createTextNode(rest[0] as string) :
    document.createElement(tag);
  for (const attr of rest) {
    if (attr instanceof Node) {
      e.appendChild(attr);
    } else if (typeof attr === 'string') {
      e.appendChild(document.createTextNode(attr));
    } else if (typeof attr === 'object') {
      for (const [key, val] of Object.entries(attr)) {
        if (key === 'parent') {
          (val as HTMLElement).appendChild(e);
        } else if (key === 'style' && typeof val === 'object') {
          Object.assign((e as any).style, val);
        } else if (key.startsWith('on')) {
          e.addEventListener(key.substring(2), val as any);
        } else {
          (e as any)[key] = val;
        }
      }
    }
  }
  return e;
}

// Basic idea here: pickElement sets up an overlay to "intercept" all click events, with an
// [X] button and ESC handler to cancel?  But this is a bit more complicated than a simple
// {once: true} setting.
////////
// // Dim the page while picking an element.
// function addDimmer() {
//   if (document.querySelector('.dimmer')) return;

//   const dimmer = document.createElement('div');
//   dimmer.className = 'dimmer';
  
//   // Basic styles to cover the screen
//   Object.assign(dimmer.style, {
//     position: 'fixed',
//     top: '0',
//     left: '0',
//     width: '100vw',
//     height: '100vh',
//     backgroundColor: 'rgba(0, 0, 0, 0.7)',
//     zIndex: '999999',
//     pointerEvents: 'none', // Allows clicking through the "hole"
//     transition: 'clip-path 0.3s ease' // Smooth transition between elements
//   });

//   document.body.appendChild(dimmer);
// }

// /**
//  * Function 2: Clips a hole in the dimmer for a specific element.
//  * Passing null removes the hole.
//  */
// function highlightElement(el) {
//   const dimmer = document.querySelector('.dimmer');
//   if (!dimmer) return;

//   if (!el) {
//     dimmer.style.clipPath = 'none';
//     return;
//   }

//   const rect = el.getBoundingClientRect();
  
//   // The "Even-Odd" Polygon Trick:
//   // We draw the outer screen (clockwise) and then the inner hole (counter-clockwise).
//   // This tells the browser to "subtract" the inner rectangle.
//   const top = rect.top;
//   const left = rect.left;
//   const bottom = rect.bottom;
//   const right = rect.right;
//   const w = window.innerWidth;
//   const h = window.innerHeight;

//   const path = `polygon(
//     0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%, 
//     ${left}px ${top}px, 
//     ${right}px ${top}px, 
//     ${right}px ${bottom}px, 
//     ${left}px ${bottom}px, 
//     ${left}px ${top}px
//   )`;

//   dimmer.style.clipPath = path;
// }
