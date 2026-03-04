// Analysis of advancement grid to figure out what everybody needs.

import { Trailman } from './trailman';
import {
  Branch,
  BranchData,
  ConcreteActivity,
  HERITAGE,
  HOBBIES,
  LIFE,
  OUTDOOR,
  SCIENCE,
  SPORTS,
  VALUES,
} from './branch';
import { july15 } from './util';

const upcoming = {
  [HERITAGE]: [],
  [LIFE]: [],
  [SCIENCE]: ['elective:Rocketry'],
  [HOBBIES]: ['elective:Elective - %y (1 of 2)', 'elective:Elective - %y (2 of 2)'],
  [VALUES]: ['core:Service'],
  [SPORTS]: ['core:Nutrition & Fitness', 'elective:Uncommon Sports', 'htt:HTT'],
  [OUTDOOR]: ['core:Orienteering', 'elective:Tread Lightly!®'],
};

// // Trailman interface augmented with advancement progress data
// interface TrailmanData extends Trailman {
//   progress: Map<Branch, ConcreteActivity[]>;
// }
// type AllBranchData = Map<Branch, BranchData>;

interface StructuredProgress {
  goal: 'branch'|'star';
  // Are we on track?
  onTrack: boolean;
  // How many core steps or electives are missing?
  missingCse: number;
  // Will need a makeup HTT
  missingHtt: number;
  // Chance for an extra HTT
  extraHtt: boolean;
}

/**
 * Returns a string summary of what's missing to earn a branch or star
 * (depending on the year).
 * Example output: "missing 1 cs/e 1 htt for branch".
 * If we're using an at-home activity, we might show something like
 * "missing 1 cs/e/htt" since either could work.
 */
export function checkBranchProgress(
  branchData: BranchData,
  upcoming: string[],
  completed: ConcreteActivity[],
  year: number,
): StructuredProgress {
  // Make a copy
  completed = [...completed];
  let goal: 'branch'|'star' = year === 1 ? 'branch' : 'star';

  function tryAdd(s: Set<string>, a: string) {
    // Try all permutations
    const options = new Set([
      a.replace('(1 of 2)', '(2 of 2)'),
      a.replace('(2 of 2)', '(1 of 2)'),
      a.replace('Year 2', 'Year 1').replace('(1 of 2)', '(2 of 2)'),
      a.replace('Year 2', 'Year 1').replace('(2 of 2)', '(1 of 2)'),
    ]);
    for (const option of options) {
      if (!s.has(option)) {
        s.add(option);
        return;
      }
    }
  }
  
  let needCoreSteps = branchData.needCoreSteps * year;
  let needElectives = branchData.needElectives * year;
  const hasCoreSteps = new Set<string>();
  const hasElectives = new Set<string>();
  let hasHome = 0;
  let hasHtt = 0;
  for (const activity of completed) {
    if (activity.type === 'core') hasCoreSteps.add(activity.name);
    if (activity.type === 'elective') hasElectives.add(activity.name);
    if (activity.type === 'htt') hasHtt++;
    if (activity.type === 'home') hasHome++;
  }
  for (const u of upcoming) {
    // Add to completed (assume we'll get them).
    let [type, name] = u.split(':');
    name = name!.replace('%y', `Year ${year}`);
    name = name.replace('%i', '(1 of 2)');
    if (type === 'core') tryAdd(hasCoreSteps, name!);
    if (type === 'elective') tryAdd(hasElectives, name!);
    if (type === 'htt') hasHtt++;
  }

  let extraHtt!: boolean;
  let missingCse!: number;
  let missingHtt!: number;
  let onTrack!: boolean;

  function check() {
    extraHtt = false;
    onTrack = false;
    missingCse = needCoreSteps + needElectives - hasCoreSteps.size - hasElectives.size;
    missingHtt = year - hasHtt;

    let home = hasHome >> 1;
    // Apply home credits to CSE first
    while (missingCse > 0 && home > 0) {
      missingCse--;
      home--;
    }
    while (missingHtt > 0 && home > 0) {
      missingHtt--;
      home--;
    }
    // Now check if we've got enough
    if (!missingCse && !missingHtt) {
      onTrack = true;
    }
    if (hasHtt > year) extraHtt = true;

    if (goal === 'star' && !onTrack && missingCse > 1) {
      // If we're not at all on track for a star AND we didn't earn
      // the branch already last year, see if we can dial it back.
      const lastYear = july15.getDate();
      const old = checkBranchProgress(branchData, [], completed.filter(a => a.date < lastYear), 1);
      if (!old.onTrack) {
        goal = 'branch';
        needCoreSteps >>>= 1;
        needElectives >>>= 1;
        check(); // try again for branch.
      }
    }
  }
  check();

  return {goal, onTrack, missingCse, missingHtt, extraHtt};
}

export function analyze() {
  // 
}
