// Schema for branch metadata

import * as v from 'valibot';
import { assertType, parseDate } from './util';

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
  branch: Branch,
  //date: v.optional(PlainDate),  // TODO - future, track scheduled events
  id: ActivityId,
  type: ActivityType,
}), v.readonly());
export type Activity = v.InferOutput<typeof Activity>;

export const BranchData = v.pipe(v.object({
  branch: v.string(),
  needCoreSteps: v.number(),
  needElectives: v.number(),
  activities: v.pipe(v.record(ActivityId, Activity), v.readonly()),
}), v.readonly());
export type BranchData = v.InferOutput<typeof BranchData>;

export const AllBranchData = v.pipe(v.record(Branch, BranchData), v.readonly());
export type AllBranchData = v.InferOutput<typeof AllBranchData>;

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
  date: parseDate.T,
  note: v.string(),
  // year: v.optional(v.number()),
  // index: v.optional(v.number()),
});
export type ConcreteActivity = v.InferOutput<typeof ConcreteActivity>;
