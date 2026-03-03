// Schema for branch metadata

import { z } from 'zod/mini';

export const HERITAGE = 'Heritage Branch';
export const LIFE = 'Life Skills Branch';
export const SCIENCE = 'Science & Technology Branch';
export const HOBBIES = 'Hobbies Branch';
export const VALUES = 'Values Branch';
export const SPORTS = 'Sports & Fitness Branch';
export const OUTDOOR = 'Outdoor Skills Branch';

export const Branch = z.enum([HERITAGE, LIFE, SCIENCE, HOBBIES, VALUES, SPORTS, OUTDOOR]);
export type Branch = z.infer<Branch>;

export const BranchData = z.object({
  needCoreSteps: z.number(),
  needElectives: z.number(),
  coreSteps: z.array(z.string()),
  electives: z.array(z.string()),
});

// Activities
export const ActivityType = z.enum(['core', 'elective', 'htt', 'home']);
export type ActivityType = z.infer<ActivityType>;

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
