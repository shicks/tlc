// Analysis of advancement grid to figure out what everybody needs.

import { getSubpatrols, getTrailmanById, getTrailmen, getTrailmenBySubpatrol, Trailman, TrailmanId } from './trailman';
import {
  BRANCHES,
  Branch,
  type BranchData,
  ConcreteActivity,
  HERITAGE,
  HOBBIES,
  LIFE,
  OUTDOOR,
  SCIENCE,
  SPORTS,
  VALUES,
  scrapeBranch,
} from './branch';
import { switchBranch } from './advancement';
import { assertType, july15 } from './util';
import { Dialog, addButtonsToTop } from './ui';

const upcoming = {
  [HERITAGE]: [],
  [LIFE]: [],
  [SCIENCE]: ['Rocketry'],
  [HOBBIES]: ['Elective - %y (1 of 2)', 'Elective - %y (2 of 2)'],
  [VALUES]: ['Service'],
  [SPORTS]: ['Nutrition & Fitness - %y', 'Uncommon Sports', 'HTT'],
  [OUTDOOR]: ['Orienteering', 'Tread Lightly!®'],
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
  // How many were filled from home activities
  //  - maybe ''|`c${home}`|`h${home}` to specify what was filled?
  // usedHome: number;
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
  const activitiesByName = new Map([...branchData.activities.values()].map(a => [a.name, a]));
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
    const name = u.replace('%y', `Year ${year}`);
    const type = activitiesByName.get(name)?.type;
    if (type === 'core') {
      tryAdd(hasCoreSteps, name);
    } else if (type === 'elective') {
      tryAdd(hasElectives, name);
    } else if (name === 'HTT') {
      hasHtt++;
    } else {
      throw new Error(`Unknown upcoming activity: ${name}`);
    }
  }

  let extraHtt!: boolean;
  let missingCse!: number;
  let missingHtt!: number;
  let onTrack!: boolean;

  function check() {
    extraHtt = false;
    onTrack = false;
    missingCse =
      Math.max(needCoreSteps - hasCoreSteps.size, 0) +
      Math.max(needElectives - hasElectives.size, 0);
    missingHtt = Math.max(year - hasHtt, 0);

    let home = hasHome >> 1;

    // TODO - also look for extra-credit HTTs
    //   - this is trickier because we could apply them to any branch.
    //     prefer to apply them to branches that need multiple items
    //     so that we're most likely to finish everything
    //   - can we code this somehow in the spreadsheet cell to still get
    //     good coloring, but also see lots more detail? (i.e. some
    //     symbols to show branch vs star, using home/ec-htt/etc).
    // Could probably be clearer about what's available for making up via
    // extra HTT and/or home activities?  Simulate home activity application
    // for each year, etc.  If there _wasn't_ a home activity _this year_
    // THEN consider what it could look like if we applied one.

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
      const lastYear = july15.getTime();
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

export function scrapeProgress(
  branchData: BranchData,
): Map<Trailman, ConcreteActivity[]> {
  const map = new Map(getTrailmen().map(t => [t, []]));
  for (const e of document.querySelectorAll('.advance-icon[data-value="1"]')) {
    assertType<HTMLElement>(e);
    const [activityId, trailmanId, levelId] = e.id.split(/_/g);
    if (!levelId) throw new Error(`Bad id: ${e.id}`); // TODO - validate?
    const activity = branchData.activities.get(activityId!);
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
    const date = new Date(dateElem.textContent).getTime();
    const completed: ConcreteActivity[] = map.get(trailman)!;
    completed.push({name, type, date, note});
  }
  return map;
}

export async function analyze() {
  // Compute Forest Award status
  const badge = new Map<TrailmanId, string>();
  for (const patrol of ['Fox', 'Hawk', 'Mountain Lion']) {
    await switchBranch(`${patrol} Branch Patch (Joining Award)` as Branch);
    for (const e of $('#table_items > tr.row-highlight + tr:not(.row-highlight) > td > div')) {
      const trailmanId = e.id.split(/_/g)[0]!;
      if (getTrailmanById(trailmanId)?.patrol !== patrol) continue;
      if (e.textContent.startsWith('100%')) badge.set(trailmanId, 'joining');
    }
    await switchBranch(`${patrol} Forest Award` as Branch);
    for (const e of $('.advance-icon[data-value="1"]')) {
      const trailmanId = e.id.split(/_/g)[1]!;
      if (getTrailmanById(trailmanId)?.patrol !== patrol) continue;
      const dateElem = e.nextElementSibling;
      if (!dateElem?.classList.contains('completed_on_date')) {
        throw new Error(`Could not find completion date for activity`);
      }
      const date = new Date(dateElem.textContent);
      if (date.getTime() < july15.getTime()) {
        badge.set(trailmanId, 'forest');
      } else {
        badge.set(trailmanId, 'forest (this year)');
      }
    }
  }

  // Iterate over the branches
  const reports = new Map<TrailmanId, Map<Branch, StructuredProgress>>(
    getTrailmen().map(t => [t.id, new Map()]),
  );
  for (const branch of BRANCHES) {
    await switchBranch(branch);
    const branchData = scrapeBranch();
    for (const [t, activities] of scrapeProgress(branchData)) {
      reports.get(t.id)!
        .set(branch, checkBranchProgress(branchData, upcoming[branch], activities, t.year));
    }
  }

  // Build up a report
  const report = [[
    'Name',
    'Patrol',
    'Patch',
    'Missing',
    ...BRANCHES,
    'Extra HTT',
  ]];
  for (const patrol of getSubpatrols()) {
    for (const trailman of getTrailmenBySubpatrol(patrol)!) {
      const row = [
        `${trailman.lastName}, ${trailman.firstName}`,
        patrol.replace('Mountain Lion', 'ML'),
        badge.get(trailman.id) || 'none',
      ];
      let extraHtt = 0;
      const branchCells: string[] = [];
      let missingBranch = 7;
      for (const branch of BRANCHES) {
        const progress = reports.get(trailman.id)!.get(branch)!;
        if (progress.extraHtt) extraHtt++;
        if (progress.onTrack) {
          branchCells.push(progress.goal);
          missingBranch--;
        } else {
          const no =
            progress.missingCse > 2 || (progress.missingCse > 1 && progress.missingHtt > 0);
          const missing = [];
          if (progress.missingCse > 0) {
            missing.push(`${progress.missingCse} cs/e`);
          }
          if (progress.missingHtt > 0) {
            missing.push(`${progress.missingHtt} htt`);
          }
          branchCells.push(`${no ? 'no ' : ''}${progress.goal}: ${missing.join(' ') || 'unknown'}`); 
        }
      }
      row.push(String(missingBranch), ...branchCells, String(extraHtt));
      report.push(row);
    }
  }
  // Make TSV
  Dialog.textarea(report.map(row => row.join('\t')).join('\n'));
}

function installUi() {
  addButtonsToTop({
    Analyze: analyze,
  });
}
const URL_PREFIX = 'https://www.traillifeconnect.com/advancement';
if (window.location.href.startsWith(URL_PREFIX)) installUi();

// TODO - when missing a single thing, is a family activity an option?
//      - when missing too much, just give up?
// List whether they earned forest award last year?
// e.g. year 2 earned branch only - want more info...

