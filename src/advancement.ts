// Tools for dealing with advancement UI.

import { ActivityId, Branch, BranchData, ConcreteActivity, getOrScrapeBranchData, selectedBranchName } from './branch';
import { Db } from './db';
import { getTrailmanById, getTrailmen, Trailman, TrailmanId } from './trailman';
import { assertType, exists, isLastYear, parseDate, waitFor } from './util';
import * as ui from './ui';
import * as v from 'valibot';
import { addDocumentChangeListener, handleDocumentChangeImmediately } from './observer';

// TODO - understand how to split out EXTRA from the HTT comments
const AdvancementRecord = v.pipe(v.object({
  trailman: TrailmanId,
  activity: ActivityId,
  concrete: ConcreteActivity,
}), v.readonly());
const Advancements =
  v.pipe(v.record(
    Branch,
    v.pipe(v.record(
      TrailmanId,
      v.array(ConcreteActivity),
    ), v.readonly())
  ), v.readonly());
type Advancements = v.InferOutput<typeof Advancements>;
const advancementsDb = new Db<Advancements>(
  '__sdh__advancements',
  Advancements,
  {},
);
const [] = [advancementsDb];

export function auditTrailmen(): string {
  const errors = [];
  for (const o of $('#trailmen-select option')) {
    assertType<HTMLOptionElement>(o);
    const found = getTrailmanById(o.value);
    if (!found) {
      errors.push(`Missing from member list: ${o.textContent}`);
    } else if (o.textContent !== `${found.lastName}, ${found.firstName}`) {
      errors.push(`Name mismatch: "${found.lastName}, ${found.firstName}" vs "${o.textContent}"`);
    }
  }
  return errors.join('\n');
}

function checkGridView() {
  if (![...document.querySelectorAll('.btn-primary.active')]
         .map(b => b.textContent.trim())
         .includes('Grid View')) {
    throw new Error(`Not in Grid View`);
  }
}
function checkWoodlands() {
  if (![...document.querySelectorAll('.btn-primary.active')]
         .map(b => b.textContent.trim())
         .includes('Woodlands Trail')) {
    throw new Error(`Woodlands Trail not selected`);
  }
}
function checkCurrentLevel() {
  if (![...document.querySelectorAll('.btn-primary.active')]
         .map(b => b.textContent.trim())
         .includes('Trailman\'s Current Level')) {
    throw new Error(`Not in Grid View`);
  }
}

/** Scrape the progress displayed on the current page. */
export function scrapeProgress(
  branchData: BranchData,
): Map<Trailman, ConcreteActivity[]> {
  const selectedTrailmenIds =
    new Set([...document.querySelectorAll('th[data-user-id]')]
              .map(th => (th as HTMLElement).dataset.userId));
  const selectedTrailmen =
    getTrailmen().filter(t => selectedTrailmenIds.has(t.id));
  const map = new Map(selectedTrailmen.map(t => [t, []]));
  for (const e of document.querySelectorAll('.advance-icon[data-value="1"]')) {
    assertType<HTMLElement>(e);
    const [activityId, trailmanId, levelId] = e.id.split(/_/g);
    if (!levelId) throw new Error(`Bad id: ${e.id}`); // TODO - validate?
    const activity = branchData.activities[activityId!];
    if (!activity) throw new Error(`Unknown activity: ${activityId}`);
    const {name, type} = activity;
    const trailman = getTrailmanById(trailmanId!);
    if (!trailman) throw new Error(`Unknown trailman: ${trailmanId}`);
    const note = (e.firstChild as HTMLElement).dataset.originalTitle
      ?.replace(/^.*?<br>/, '') || '';
    const dateElem = e.nextElementSibling;
    if (!dateElem?.classList.contains('completed_on_date')) {
      throw new Error(`Could not find completion date for activity`);
    }
    const date = parseDate(dateElem.textContent);
    const completed: ConcreteActivity[] = map.get(trailman)!;
    completed.push({name, type, date, note});
  }
  return map;
}

/**
 * Selects the given trailmen on the advancement page.  Returns the number of
 * selected trailmen.
 */
export function selectTrailmen(names: string[], quiet = false): number {
  // TODO - verify preconditions, better error handling
  //   - but we do need to handle missing names somewhat gracefully...
  //     maybe keep track though? log?
  checkGridView();
  checkWoodlands();
  checkCurrentLevel();

  const opts =
    new Map([...$('#trailmen-select option')]
              .filter(o => !o.textContent.includes('|'))
              .map(o => [o.textContent, (o as HTMLOptionElement).value]));
  const ids = names.map(n => opts.get(n)).filter(exists);
  $('#trailmen-select').val(ids).trigger('change');

  // Do some extra error reporting
  const missing = names.filter(n => !opts.has(n));
  const optsTranspose = new Map([...opts].map(([a, b]) => [b, a]));
  const unknown =
    [...opts.values()]
      .filter(id => !getTrailmanById(id))
      .map(id => optsTranspose.get(id)!);
  const messages = [];
  if (missing.length) messages.push(`Missing trailmen from select:\n  ${missing.join('\n  ')}`);
  if (unknown.length) messages.push(`Unknown trailmen, please rescrape:\n  ${unknown.join('\n  ')}`);
  if (!quiet && messages.length) ui.Dialog.textarea(messages.join('\n\n'));
  return ids.length;
};

/** Selects the given branch.  Returns true if successful. */
export function selectBranch(branch: string): boolean {
  const id = [...$('#badge-select option')].flatMap(o =>
    o.textContent.includes(branch) ? [(o as HTMLOptionElement).value] : [])[0];
  if (!id) {
    console.error(`Could not find branch: ${branch}`);
    return false;
  }
  $('#badge-select').val(id).trigger('change');
  return true;
};

// NOTE: THIS IS FOR STANDARD VIEW
// /** Selects trailmen and waits for the page to redraw. */
// export async function switchTrailman(name: string): Promise<boolean> {
//   selectTrailmen([]);
//   await waitFor(() => [...$('#award_html input')].length === 0);
//   if (!selectTrailmen([name])) return false;
//   await waitFor(() => [...$('#award_html input')].length > 0);
//   return true;
// }

// export async function switchTrailmen(names: string[]): Promise<boolean> {
//   selectTrailmen([]);
//   await waitFor(() => [...$('#award_html input')].length === 0);
//   if (!selectTrailmen(names)) return false;
//   await waitFor(() => [...$('#award_html input')].length > 0);
//   return true;
// }

/** Selects branch and waits for the page to redraw. */
export async function switchBranch(branch: string): Promise<boolean> {
  if (!selectBranch(branch)) return false;
  const queries = [
    '.panel-title',
    '#table_header tr:first-child th:first-child h4',
  ];
  await waitFor(() =>
    queries.flatMap(q => [...document.querySelectorAll(q)])
      .some(e => e.textContent.includes(branch)));
  handleDocumentChangeImmediately();
  return true;
}

function filterTrailmen(pred: (t: Trailman) => boolean): string[] {
  auditTrailmen();
  const names = [];
  for (const t of getTrailmen()) {
    if (pred(t)) names.push(`${t.lastName}, ${t.firstName}`);
  }
  return names;
}

function pickRow(): Promise<HTMLElement> {
  return ui.pickElement('#award_html tr.row-highlight', 'filterable row');
}

async function uncheckAll() {
  const row = await pickRow();
  const label = row.firstElementChild!.firstChild!;
  // TODO - show all the names, dates, and comments?
  await ui.Dialog.confirm(`Uncheck all "${label.textContent}"?`);
  for (const i of row.querySelectorAll('.advance-icon[data-value="1"] i')) {
    (i as HTMLElement).click();
  }
}

async function checkAll() {
  const row = await pickRow();
  const label = row.firstElementChild!.firstChild!;
  // TODO - show all the names, dates, and comments?
  await ui.Dialog.confirm(`Check all "${label.textContent}"?`);
  for (const i of row.querySelectorAll('.advance-icon[data-value="0"] i')) {
    (i as HTMLElement).click();
  }
}

async function pickEventDetails() {
    const event = await ui.pickElement('td:has(.advance-icon[data-value="1"])', 'valid event');
    setDetailsFromEvent(event);
}
function setDetailsFromEvent(event: HTMLElement) {
    const [, comment] = event.querySelector('i')!.dataset['originalTitle']!.split('<br>');
    const date = event.querySelector('.completed_on_date')!.textContent;
    $('input#date-specified').val(date);
    $('textarea#comment-specified').val(comment || '');
}

function splitDates() {
    // Highlight all check marks based on whether they're before or after Aug 1
  for (const event of document.querySelectorAll('td:has(.advance-icon[data-value="1"])')) {
    const date = parseDate((event as HTMLElement).querySelector('.completed_on_date')!.textContent);
    (event as HTMLElement).style.setProperty(
      'background-color',
      isLastYear(date) ? '#faa' : '#afa',
      'important',
    );
  }
  for (const event of document.querySelectorAll('td:has(.advance-icon[data-value="0"])')) {
    Object.assign(
      (event as HTMLElement).style,
      {backgroundColor: undefined},
    );
  }
}

// Returns a new list of trailmen
async function filterByRow() {
    const row = await pickRow();
    const isAttendance = row?.firstChild?.textContent === 'Attended Event';
    const query = isAttendance ? 'i.fa-check' : '.advance-icon[data-value="1"]';
    const checked = [...row.querySelectorAll(query)].flatMap((el) => {
        const id = el.id.split(isAttendance ? /-/g : /_/g)[1];
        const header = document.querySelector(`tbody#table_header th[data-user-id="${id}"]`);
        if (!header) return [];
        return [header.textContent.trim()];
    });
    return selectTrailmen(checked);
};

// async function removeOneTrailman() {
//     const headers = [...document.querySelectorAll('tbody#table_header th[data-user-id]')];
//     const names = headers.map(h => h.textContent.trim());
//     const header = await pickElement('th[data-user-id]', 'removable column');
//     return names.filter(n => n !== ancestor.textContent.trim());
// };

function updateMemoizedProgress() {



  if (1 < 2) return; // TODO - this is a mess!



  const [] = [AdvancementRecord];
  const branch = selectedBranchName();
  if (!v.is(Branch, branch)) {
    // TODO - update award status
    return;
  }
  const data = getOrScrapeBranchData(branch);
  const progress = scrapeProgress(data);

  // BUT... what about EXTRA htt? doesn't map to ID :-(

  advancementsDb.update(a => ({
    ...a,
    [branch]: {
      ...a[branch],
      ...Object.fromEntries([...progress].map(([t, a]) => [t.id, a])),
    },
  }));

}
addDocumentChangeListener('/advancement/index', updateMemoizedProgress);

function installUi() {
  // Listen for top-level ctrl-click events, for "pick" action.
  document.body.addEventListener(
    'click',
    (e) => {
      if (!e.ctrlKey) return;
      const event = (e.target as HTMLElement)?.closest('td:has(.advance-icon[data-value="1"])');
      if (event) setDetailsFromEvent(event as HTMLElement);
    },
    {capture: true},
  );
  // Add buttons
  function selectByFilter(pred: (t: Trailman) => boolean): void {
    // NOTE: audit happens in filter
    selectTrailmen(filterTrailmen(pred));
  }
  ui.addButtonsAfter(/^Select Trailmen:/, {
    'Fox 1'() { selectByFilter((t: Trailman) => t.patrol === 'Fox' && t.year === 1); },
    'Fox 2'() { selectByFilter((t: Trailman) => t.patrol === 'Fox' && t.year === 2); },
    'Hawk 1'() { selectByFilter((t: Trailman) => t.patrol === 'Hawk' && t.year === 1); },
    'Hawk 2'() { selectByFilter((t: Trailman) => t.patrol === 'Hawk' && t.year === 2); },
    'ML 1'() { selectByFilter((t: Trailman) => t.patrol === 'Mountain Lion' && t.year === 1); },
    'ML 2'() { selectByFilter((t: Trailman) => t.patrol === 'Mountain Lion' && t.year === 2); },
    'Year 1'() { selectByFilter((t: Trailman) => t.year === 1); },
    'Year 2'() { selectByFilter((t: Trailman) => t.year === 2); },
    'All'() { selectByFilter(() => true); },
  });
  ui.addButtonsToTop({
    'Filter': filterByRow,
    'Pick': pickEventDetails,
    'Split': splitDates,
    'Uncheck all': uncheckAll,
    'Check all': checkAll,
  });
}

const URL_PREFIX = 'https://www.traillifeconnect.com/advancement';
if (window.location.href.startsWith(URL_PREFIX)) installUi();

