// Utilities for the "Troop Members" page.
// Specifically, we may want to restrict to exactly this URL:
//   https://www.traillifeconnect.com/user/index?UserSearch%5Btrailman%5D=1&UserSearch%5Blevel_id%5D=wt&_tog5317d374=all

import { storeTrailmen, loadTrailmen } from './db';
import { Patrol, Trailman } from './trailman';
import { assert, assertType, july15 } from './util';
import * as ui from './ui';
import * as v from 'valibot';

const somePatrol = /Fox|Hawk|Mountain Lion/;

/**
 * Reads list of trailmen from the Troop Members page.
 * Appends/updates any entries (by id) in the database.
 */
export function scrapeTrailmen(): number {
  // Start with the existing database.
  const trailmen = new Map<string, Trailman>(loadTrailmen().map(t => [t.id, t]));
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
    const subpatrol = tr.children[patrolColumn]!.textContent;
    let year;
    if (/[12]/.test(subpatrol) && !/1.*2|2.*1/.test(subpatrol)) {
      year = subpatrol.includes('1') ? 1 : 2;
      if (somePatrol.test(subpatrol) && !subpatrol.includes(patrol)) {
        throw new Error(`Mismatched subpatrol ${subpatrol} for level ${patrol}`);
      }
    } else {
      const bdayStr = tr.children[bdayColumn]!.textContent.trim();
      const bdayMatch = /^(\d\d?)\/(\d\d?)\/(\d\d\d\d)$/.exec(bdayStr);
      if (!bdayMatch) throw new Error(`Bad birthday for ${name}: ${bdayStr}`);
      let [, bdayMonth,, bdayYear] = [...bdayMatch].map(Number);
      if (bdayMonth! > 10) bdayYear!++;
      const ageOnOct31 = july15.getFullYear() - bdayYear!;
      year = (ageOnOct31 - 1) % 2 + 1;
      const patrolCheck = ['Fox', 'Hawk', 'Mountain Lion'][((ageOnOct31 - year) - 4) >> 1];
      if (patrol !== patrolCheck) throw new Error(`Wrong patrol for ${name}: expected ${patrolCheck} but got ${patrol}`);
    }
    assert(lastName && firstName && id && patrol && year);
    const trailman = {lastName, firstName, id, patrol, year};
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
  const patrols = Map.groupBy(loadTrailmen(), ({patrol, year}) => `${patrol} ${year}`);
  
  return [...patrols.keys()]
    .sort()
    .map((patrol) => {
      const trailmen =
        patrols.get(patrol)!
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
