// Utilities for the "Troop Members" page.
// Specifically, we may want to restrict to exactly this URL:
//   https://www.traillifeconnect.com/user/index?UserSearch%5Btrailman%5D=1&UserSearch%5Blevel_id%5D=wt&_tog5317d374=all

import { getSubpatrols, getTrailmen, getTrailmenBySubpatrol, Patrol, storeTrailmen, Trailman } from './trailman';
import { assert, assertType, july15, parseDate } from './util';
import * as ui from './ui';
import * as v from 'valibot';

const somePatrol = /Fox|Hawk|Mountain Lion/;

/**
 * Reads list of trailmen from the Troop Members page.
 * Appends/updates any entries (by id) in the database.
 */
export function scrapeTrailmen(): number {
  // Start with the existing database (NOTE: we're purposely not using getById)
  const trailmen = new Map<string, Trailman>(getTrailmen().map(t => [t.id, t]));
  let updateCount = 0;

  // Inspect the header rather than hardcoding the column indices
  let nameColumn;
  let levelColumn;
  let bdayColumn;
  let patrolColumn;
  const header: HTMLElement = document.querySelector('thead.kv-table-header.user_grid > tr:first-child')!;
  for (let i = 0; i < header.children.length; i++) {
    if (header.children[i]!.textContent === 'Name') nameColumn = i;
    if (header.children[i]!.textContent === 'Current Level') levelColumn = i;
    if (header.children[i]!.textContent === 'Birthdate') bdayColumn = i;
    if (header.children[i]!.textContent === 'Patrol') patrolColumn = i;
  }
  if (nameColumn == null || levelColumn == null || bdayColumn == null || patrolColumn == null) {
    throw new Error(`Could not find all columns`);
  }

  // Read all the rows
  for (const tr of document.querySelectorAll('tr.user_grid')) {
    assertType<HTMLElement>(tr);
    const id = tr.dataset.key!;
    const name = tr.children[nameColumn]!.textContent.trim();
    if (!name.includes(', ')) throw new Error(`Bad name: ${name}`);
    const [lastName, firstName, ...rest] = name.split(', ');
    if (rest.length) throw new Error(`Bad name: ${name}`);
    const patrol = v.parse(Patrol, tr.children[levelColumn]!.textContent.trim());
    const subpatrolField = tr.children[patrolColumn]!.textContent;
    let year;
    if (/[12]/.test(subpatrolField) && !/1.*2|2.*1/.test(subpatrolField)) {
      year = subpatrolField.includes('1') ? 1 : 2;
      if (somePatrol.test(subpatrolField) && !subpatrolField.includes(patrol)) {
        throw new Error(`Mismatched subpatrol ${subpatrolField} for level ${patrol}`);
      }
    } else {
      const bday = parseDate(tr.children[bdayColumn]!.textContent.trim());
      const oct31 = july15.with({month: 10, day: 31});
      const age = bday.until(oct31, {smallestUnit: 'years', roundingMode: 'floor'}).years;
      year = (age - 1) % 2 + 1;
      const patrolCheck = ['Fox', 'Hawk', 'Mountain Lion'][((age - year) - 4) >> 1];
      if (patrol !== patrolCheck) throw new Error(`Wrong patrol for ${name}: expected ${patrolCheck} but got ${patrol}`);
    }
    assert(lastName && firstName && id && patrol && year);
    const subpatrol = `${patrol} ${year}`; // clean it up
    const trailman = {lastName, firstName, name, id, patrol, year, subpatrol};
    const prev = trailmen.get(id);
    if (!prev || objDiffers(prev, trailman)) {
      trailmen.set(id, trailman);
      updateCount++;
    }
  }

  const trailmenArr = [...trailmen.values()];
  storeTrailmen(trailmenArr);
  return updateCount;
}

function objDiffers(a: object, b: object): boolean {
  for (const k in a) {
    if (!(k in b)) return true;
    if (a[k as keyof typeof a] !== b[k as keyof typeof b]) return true;
  }
  for (const k in b) {
    if (!(k in a)) return true;
  }
  return false;
}

function formatAllTrailmen(): string {
  function name(t: Trailman): string {
    return `${t.lastName}, ${t.firstName}`;
  }
  function by<T>(fn: (t: T) => string|number): (a: T, b: T) => number {
    return (a: T, b: T) => {
      const fa = fn(a);
      const fb = fn(b);
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    }
  }
  return getSubpatrols()
    .sort()
    .map((patrol) => {
      const trailmen =
        [...getTrailmenBySubpatrol(patrol)!]
          .sort(by(name))
          .map(t => `${name(t)} (${t.id})`)
          .join('\n  ');
      return `${patrol}\n  ${trailmen}`;
    })
    .join('\n\n');
}

function installUi() {
  // Add button to re-read membership list and to show data
  ui.addButtonsToTop({
    Show() {
      // fire and forget
      ui.Dialog.textarea(formatAllTrailmen());
    },
    Scrape() {
      const updated = scrapeTrailmen();
      ui.Dialog.info(`Updated ${updated} entries`);
    },
  });
}

const URL_PREFIX = 'https://www.traillifeconnect.com/user';
if (window.location.href.startsWith(URL_PREFIX)) installUi();
