// Schema for branch metadata

import * as v from 'valibot';

export const HERITAGE = 'Heritage Branch';
export const LIFE = 'Life Skills Branch';
export const SCIENCE = 'Science & Technology Branch';
export const HOBBIES = 'Hobbies Branch';
export const VALUES = 'Values Branch';
export const SPORTS = 'Sports & Fitness Branch';
export const OUTDOOR = 'Outdoor Skills Branch';

export const Branch = v.picklist([HERITAGE, LIFE, SCIENCE, HOBBIES, VALUES, SPORTS, OUTDOOR]);
export type Branch = v.InferOutput<typeof Branch>;

export const BranchData = v.object({
  needCoreSteps: v.number(),
  needElectives: v.number(),
  coreSteps: v.array(v.string()),
  electives: v.array(v.string()),
});
export type BranchData = v.InferOutput<typeof BranchData>;

// Activities
export const ActivityType = v.picklist(['core', 'elective', 'htt', 'home']);
export type ActivityType = v.InferOutput<typeof ActivityType>;

// Activities are stored as a string, but we allow %y and %i
// within the string, to indicate that the activity is repeated
// across or within the year, e.g. "Elective - %y (%i)"
// will have %y replaced with "Year 1" or "Year 2" and
// %i replaced with "1 of 2" or "2 of 2".  We will automatically
// select the appropriate version when analyzing or logging.

// export const Activity = z.object({
//   // NOTE: may be of the form "Elective - %y (%i)"
//   // If this is the case
//   name: z.string(),
//   type: ActivityType,
//   id: z.string(),
// });

export const ConcreteActivity = v.object({
  name: v.string(), // NOTE: may include "1 of 2" or "Year 1"
  type: ActivityType,
  date: v.number(), // epoch millis
  // year: v.optional(v.number()),
  // index: v.optional(v.number()),
});
export type ConcreteActivity = v.InferOutput<typeof ConcreteActivity>;

/** Scrapes the current advancement page to find metadata about a branch. */
export function scrapeBranch(): BranchData {
  
}
