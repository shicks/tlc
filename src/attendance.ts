// Tools for tracking attendance from a CSV file.

import { Dialog, dom } from './ui';
import { assertType, queryAll } from './util';
import * as ui from './ui';

import * as fuzz from 'fuzzball';
import * as Papa from 'papaparse';

let dryRun = false;

export function installUi() {
  const group = document.querySelector('.btn-group');
  const dropzone = dom(
    'button', {
      type: 'button',
      className: 'btn btn-primary',
      style: 'margin-left: 1px;padding-left: 8px;padding-right: 8px',
      onclick: () => {
        fileInput.click();
      },
      parent: group!,
    },
    dom('small', dom('strong', {textContent: 'Import CSV'})),
  );
  const fileInput = dom(
    'input', {
      type: 'file',
      style: 'display: none',
      parent: document.body,
    },
  );
  ui.addButtonsToTop({
    'Mode: change': (ctl: ui.ButtonController) => {
      dryRun = !dryRun;
      ctl.setLabel(`Mode: ${dryRun ? 'dry run' : 'change'}`);
    },
  });

  // --- 1. Handle Click Logic ---

  // When a file is selected via the browser picker
  fileInput.addEventListener('change', (e: Event) => {
    assertType<HTMLInputElement>(e.target);
    if (e.target.files!.length > 0) {
      processFile(e.target.files![0]!);
    }
  });

  // --- 2. Handle Drag & Drop Logic ---

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const dt = e.dataTransfer!;

    // 1. Standard local file drop
    if (dt.files && dt.files.length > 0) {
      processFile(dt.files[0]!);
    }
    // 2. Dragging a link (like from Gmail or another tab)
    else {
      const url = dt.getData('text/uri-list') || dt.getData('text/plain');

      if (url && url.startsWith('http')) {
        console.log("Detected a URL drop:", url);
        try {
          const response = await fetch(url);
          const text = await response.text();
          handle(text);
        } catch (err) {
          console.error("Could not fetch file from URL (likely CORS or Auth issue):", err);
          alert("Cannot grab files directly from other websites due to security restrictions.");
        }
      }
    }
  });

  // 1. Handle Paste Event
  document.addEventListener('paste', (e) => {
    // Get the text from the clipboard
    const text = (e.clipboardData || (window as any).clipboardData).getData('text');
    if (text) {
      console.log("Data received via paste");
      handle(text);
    }
  });

}

// --- 3. Shared Processing Logic ---

function processFile(file: File) {
  file.text()
    .then(content => {
      handle(content);
    })
    .catch(err => {
      console.error("Error reading file:", err);
    });
}

function handle(text: string) {
  processCsv(Papa.parse(text, {
    header: true,
    transformHeader: (h: string) => h.replace(/\s/g, '').toLowerCase(),
    skipEmptyLines: true,
  }).data as Array<Record<CsvHeader, string>>);
}

const LOCALSTORAGE_KEY = '__sdh__attendance_corrections';
function getCorrections() {
  try {
    return JSON.parse(localStorage.getItem(LOCALSTORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function storeCorrections(c: Record<string, string>) {
  localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(c));
}

function isCheckboxChecked(button: HTMLInputElement): boolean {
  // 1. Native checked property or attribute
  if (button.checked) return true;
  if (button.hasAttribute('checked')) return true;

  // 2. Check the Krajee cbx-container wrapper classes and icons
  const container = button.closest('.cbx-container') || button.parentElement?.closest('.cbx-container');
  if (container) {
    if (container.classList.contains('cbx-checked') || container.classList.contains('cbx-active')) {
      return true;
    }
    // // Icon presence inside the container indicating checked state
    // if (container.querySelector('.glyphicon-ok, .fa-check, [class*="ok"], [class*="check"]')) {
    //   return true;
    // }
  }

  // 3. For non-native-checkbox or custom widgets where value holds "1" vs "0"
  if (button.type !== 'checkbox') {
    const val = $(button).val();
    return val === '1' || val === 'true';
  }

  return false;
}

type CsvHeader = 'group' | 'lastname' | 'firstname';
async function processCsv(data: Array<Record<CsvHeader, string>>) {
  // Map names to IDs
  const buttonMap = new Map(queryAll('.cbx-container input', HTMLInputElement).map(b => [b.id.split('-')[0], b]));
  const idEntries = queryAll('.user-row')
    .map(r => [r.innerText, r.dataset.user!] satisfies [string, string]);
  const idMap = new Map(idEntries.map(([name, id]) => [name.toLowerCase().trim(), id]));
  const missed: string[] = [];
  const lapsed: string[] = [];
  const buttons = new Map<HTMLInputElement, string>();
  const corrections = getCorrections();
  const toClick: string[] = [];
  for (const entry of data) {
    // Only look at trailmen (Woodlands, Navigators, Adventurers)
    if (
      entry.group &&
        !/(Trail Life - )?(Fox(es)?|Hawk(s)?|Mountain Lion(s)?|Nav(igator(s)?)?|Adv(enturer(s)?)?)/i.test(entry.group)
    ) {
      continue;
    }
    const group = (entry.group || 'n/a').replace(/^Trail Life - /i, '').replace(/\s*\(\d+\)$/, '');
    let name = `${entry.lastname}, ${entry.firstname}`;
    if (name in corrections) name = corrections[name];
    if (name === 'IGNORE') continue;
    const id = idMap.get(name.toLowerCase());
    if (id) {
      const button = buttonMap.get(id);
      if (button) {
        buttons.set(button, name);
      } else {
        lapsed.push(`${name} (${group})`);
      }
    } else {
      missed.push(`${name} (${group})`);
    }
  }

  if (missed.length) {
    const allNames = queryAll('.user-row').map(r => r.innerText);
    const allNormalized = allNames.map(n => n.toLowerCase().trim());
    const div = dom('div', {style: `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    `});
    const selects: HTMLSelectElement[] = [];
    for (const name of missed) {
      const normalized = name.replace(/ \(.*/, '').toLowerCase().trim();
      dom('span', name, {parent: div});
      const select = dom('select', {parent: div});
      select.dataset['name'] = name.replace(/ \(.*/, '');
      selects.push(select);
      const ranking = fuzz.extract(
        normalized, allNormalized, {scorer: fuzz.token_set_ratio}).slice(0, 5);
      for (const [,, i] of ranking) {
        dom('option', allNames[i]!, {parent: select, value: String(i)});
      }
      dom('option', 'SKIP', {parent: select, value: '-1'});
      dom('option', 'IGNORE', {parent: select, value: '-2'});
      // TODO - offer a way to type with completion?
    }
    let cancelled = false;
    await new Dialog<void>({
      contents: [div],
      buttons: {
        Cancel(resolve) { cancelled = true; resolve(undefined); },
        OK(resolve) { resolve(undefined); }
      }
    });
    if (cancelled) return;
    for (const select of selects) {
      const index = Number(select.value);
      const name = select.dataset.name!;
      if (index === -1) continue;
      if (index === -2) {
        corrections[name] = 'IGNORE';
        continue;
      }
      
      const corrected = allNames[index]!;
      corrections[name] = corrected;
      const id = idMap.get(corrected.toLowerCase());
      if (!id) throw new Error(`Button disappeared? ${corrected}`);
      const button = buttonMap.get(id);
      if (button) {
        buttons.set(button, name);
      } else {
        lapsed.push(corrected);
      }
    }
    storeCorrections(corrections);
  }
  let already = 0;
  let clicked = 0;
  for (const [button, name] of buttons) {
    if (isCheckboxChecked(button)) {
      //toClick.push(`<br>${name}: already clicked`);
      already++;
    } else {
      toClick.push(name);
      if (!dryRun) {
        alert('whoops');
        // $(button).click();
      }
      clicked++;
    }
  }

  const alreadyText = already > 0 ? `, ${already} already clicked` : '';
  const lapsedList = lapsed.length > 0 ? `, ${lapsed.length} lapsed:\n  ${lapsed.join('\n  ')}` : '';
  Dialog.info(`Clicked ${clicked} buttons${alreadyText}${lapsedList}: ${toClick.join(' ; ')}`);
}

const URL_PREFIX = 'https://www.traillifeconnect.com/attendance';
if (window.location.href.startsWith(URL_PREFIX)) installUi();
