// Schema for branch metadata

import * as v from 'valibot';
import { assertType } from './util';
import { Db } from './db';
import { Dialog } from './ui';
import { addDocumentChangeListener } from './observer';

export const HERITAGE = 'Heritage Branch';
export const LIFE = 'Life Skills Branch';
export const SCIENCE = 'Science & Technology Branch';
export const HOBBIES = 'Hobbies Branch';
export const VALUES = 'Values Branch';
export const SPORTS = 'Sports & Fitness Branch';
export const OUTDOOR = 'Outdoor Skills Branch';

export const BRANCHES = [HERITAGE, LIFE, SCIENCE, HOBBIES, VALUES, SPORTS, OUTDOOR] as const;
export const Branch = v.picklist(BRANCHES);
export type Branch = v.InferOutput<typeof Branch>;

export const ActivityId = v.string();
export type ActivityId = v.InferOutput<typeof ActivityId>;

// Activities
export const ActivityType = v.picklist(['core', 'elective', 'htt', 'home']);
export type ActivityType = v.InferOutput<typeof ActivityType>;

export const Activity = v.pipe(v.object({
  name: v.string(),
  id: ActivityId,
  type: ActivityType,
}), v.readonly());
export type Activity = v.InferOutput<typeof Activity>;

export const BranchData = v.pipe(v.object({
  needCoreSteps: v.number(),
  needElectives: v.number(),
  activities: v.pipe(v.record(ActivityId, Activity), v.readonly()),
}), v.readonly());
export type BranchData = v.InferOutput<typeof BranchData>;

export const AllBranchData = v.pipe(v.record(Branch, BranchData), v.readonly());
export type AllBranchData = v.InferOutput<typeof AllBranchData>;

const db = new Db<AllBranchData>(
  '__sdh__all_branch_data',
  AllBranchData,
  {},
);
export function getBranchData(b: Branch): BranchData {
  const result = db.get()[b];
  if (result == undefined) throw new Error(`Missing branch data for ${b}`);
  return result;
}
export function getOrScrapeBranchData(b: Branch): BranchData {
  try {
    return getBranchData(b);
  } catch {
    if (b === selectedBranchName()) return scrapeBranch();
    throw new Error(`Branch ${b} not selected`);
  }
}

// Activities are stored as a string, but we allow %y and %i
// within the string, to indicate that the activity is repeated
// across or within the year, e.g. "Elective - %y (%i)"
// will have %y replaced with "Year 1" or "Year 2" and
// %i replaced with "1 of 2" or "2 of 2".  We will automatically
// select the appropriate version when analyzing or logging.

// export const Activity = z.object({
//   // NOTE: may be of the form "Elective - %y ()"
//   // If this is the case
//   name: z.string(),
//   type: ActivityType,
//   id: z.string(),
// });

export const ConcreteActivity = v.object({
  name: v.string(), // NOTE: may include "1 of 2" or "Year 1"
  type: ActivityType,
  date: v.instance(Temporal.PlainDate),
  note: v.string(),
  // year: v.optional(v.number()),
  // index: v.optional(v.number()),
});
export type ConcreteActivity = v.InferOutput<typeof ConcreteActivity>;

export function selectedBranchName(): string|undefined {
  const branchId = $('#badge-select').val();
  return [...$(`#badge-select option[value="${branchId}"]`)][0]
    ?.textContent?.split('|')?.[0];
}

/** Scrapes the current advancement page to find metadata about a branch. */
export function scrapeBranch(): BranchData {
  const branch = selectedBranchName();
  // Scrape the list of activities
  const activities: Record<string, Activity> = {};
  let type: ActivityType|undefined;
  const foundTypes = new Set<ActivityType>();
  for (const row of $('tbody#table_items > tr')) {
    assertType<HTMLElement>(row);
    const name = row?.firstChild?.firstChild?.textContent?.trim();
    if (!name) continue;
    if (name === 'Core Steps') {
      type = 'core';
    } else if (name === 'Elective Steps') {
      type = 'elective';
    } else if (name === 'Hit The Trail Activities') {
      type = 'htt';
    } else if (name === 'Family Home Activities') {
      type = 'home';
    } else if (row.classList.contains('row-highlight')) {
      if (!type) throw new Error(`Activity without type`);
      foundTypes.add(type);
      const id = row.querySelector('.advance-icon')!.id.split('_')[0]!;
      activities[id] = {name, type, id};
    }
  }
  if (foundTypes.size !== 4) {
    throw new Error(`Missing activity type: found ${[...foundTypes].join(', ')}`);
  }
  // Scrape the requirements grid
  const needGrid = querySingleton('.simple_grid_box_advancement.text-left');
  if (needGrid.textContent !== 'Branch\u00a0Pin') {
    throw new Error(`Unexpected element: ${needGrid.textContent}`);
  }
  const needCoreSteps = Number(needGrid.nextElementSibling?.textContent);
  const needElectives = Number(needGrid.nextElementSibling?.nextElementSibling?.textContent);
  if (isNaN(needCoreSteps) || isNaN(needElectives)) {
    throw new Error(`Could not scrape requirements grid`);
  }
  const result = {needCoreSteps, needElectives, activities};
  if (v.is(Branch, branch)) {
    db.update(infos => ({...infos, [branch]: result}));
  } else {
    Dialog.info(`Not a valid branch: ${branch}`);
  }
  return result;
}
addDocumentChangeListener('/advancement/index', scrapeBranch);

function querySingleton(query: string): HTMLElement {
  const [e, ...rest] = document.querySelectorAll(query);
  if (!e) throw new Error(`Missing element: ${query}`);
  if (rest.length) throw new Error(`Non-unique element: ${query}`);
  return e as HTMLElement;
}
(window as any).selectedBranchName = selectedBranchName;
