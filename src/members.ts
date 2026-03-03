// Utilities for the "Troop Members" page.
// Specifically, we may want to restrict to exactly this URL:
//   https://www.traillifeconnect.com/user/index?UserSearch%5Btrailman%5D=1&UserSearch%5Blevel_id%5D=wt&_tog5317d374=all

import { storeTrailmen, loadTrailmen } from './db';
import { Patrol, Trailman } from './trailman';
import { july15 } from './util';
import * as v from 'valibot';

const somePatrol = /Fox|Hawk|Mountain Lion/;

/**
 * Reads list of trailmen from the Troop Members page.
 * Appends/updates any entries (by id) in the database.
 */
export function scrapeTrailmen(): Trailman[] {
  // Start with the existing database.
  const trailmen = new Map<string, Trialman>(loadTrailmen().map(t => [t.id, t]));

  // Inspect the header rather than hardcoding the column indices
  let nameColumn;
  let levelColumn;
  let bdayColumn;
  let patrolColumn;
  const header = document.querySelector('thead.kv-table-header.user_grid > tr:first-child');
  for (let i = 0; i < header.children.length; i++) {
    if (header.children[i].textContent === 'Name') nameColumn = i;
    if (header.children[i].textContent === 'Current Level') levelColumn = i;
    if (header.children[i].textContent === 'Birthdate') bdayColumn = i;
    if (header.children[i].textContent === 'Patrol') patrolColumn = i;
  }

  // Read all the rows
  for (const tr of document.querySelectorAll('tr.user_grid')) {
    const id = tr.dataset.key;
    const name = tr.children[nameColumn].textContent.trim();
    if (!name.includes(', ')) throw new Error(`Bad name: ${name}`);
    const [lastName, firstName, ...rest] = name.split(', ');
    if (rest.length) throw new Error(`Bad name: ${name}`);
    const patrol = v.parse(Patrol, tr.children[levelColumn].textContent.trim());
    const subpatrol = tr.children[patrolColumn].textContent;
    let year;
    if (/[12]/.test(subpatrol) && !/1.*2|2.*1/.test(subpatrol)) {
      year = subpatrol.includes('1') ? 1 : 2;
      if (somePatrol.test(subpatrol) && !subpatrol.includes(patrol)) {
        throw new Error(`Mismatched subpatrol ${subpatrol} for level ${patrol}`);
      }
    } else {
      const bdayStr = tr.children[bdayColumn].textContent.trim();
      const bdayMatch = /^(\d\d?)\/(\d\d?)\/(\d\d\d\d)$/.exec(bdayStr);
      if (!bdayMatch) throw new Error(`Bad birthday for ${name}: ${bdayStr}`);
      let [, bdayMonth,, bdayYear] = [...bdayMatch].map(Number);
      if (bdayMonth > 10) bdayYear++;
      const ageOnOct31 = july15.getFullYear() - bdayYear;
      year = (ageOnOct31 - 1) % 2 + 1;
      const patrolCheck = ['Fox', 'Hawk', 'Mountain Lion'][((ageOnOct31 - year) - 4) >> 1];
      if (patrol !== patrolCheck) throw new Error(`Wrong patrol for ${name}: expected ${patrolCheck} but got ${patrol}`);
    }
    const trailman = {lastName, firstName, id, patrol, year};
    trailmen.set(id, trailman);
  }

  const trailmenArr = [...trailmen.values()];
  storeTrailmen(trailmenArr);
  return trailmenArr;
}
window.scrapeTrailmen = scrapeTrailmen;
