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
  goal: Goal;
  // Is it already complete?
  complete: boolean;
  // Are we on track?
  onTrack: boolean;
  // How many core steps or electives are missing?
  missingCse: number;
  // Will need a makeup HTT
  missingHtt: number;
  // Completed for an extra HTT
  completedExtraHtt: number;
  // Extra HTT in upcoming activities
  upcomingExtraHtt: number;
  // Whether a home activity is available
  homeFree: boolean;
  // Is award possible?
  possible: boolean;
  // How many were filled from home activities
  //  - maybe ''|`c${home}`|`h${home}` to specify what was filled?
  // usedHome: number;
}

type Goal = 'branch' | 'star';

// Keeps track of completed activities in a single branch.
class CompletedActivities {
  coreSteps = new Set<string>();
  electives = new Set<string>();
  htt = 0;
  home = 0;
  extraHtt = 0;
  homeFree = true;

  constructor(readonly year: number, activities: ConcreteActivity[] = []) {
    for (const a of activities) {
      this.add(a);
    }
  }

  add(activity: ConcreteActivity) {
    if (activity.type === 'core') this.addInternal(this.coreSteps, activity.name);
    if (activity.type === 'elective') this.addInternal(this.electives, activity.name);
    if (activity.type === 'htt') this.addHtt(activity.note.split(/EXTRA:/g).length);
    if (activity.type === 'home') this.addHome(activity);
  }

  check(goal: Goal, branch: BranchData): StructuredProgress {
    const multiplier = goal === 'star' ? 2 : 1;
    const needCoreSteps = multiplier * branch.needCoreSteps;
    const needElectives = multiplier * branch.needElectives;
    let missingCse =
      Math.max(0, needCoreSteps - this.coreSteps.size) +
      Math.max(0, needElectives - this.electives.size);
    let missingHtt = Math.max((goal === 'star' ? 2 : 1) - this.htt);
    let home = this.home >>> 1;
    while (missingCse > 0 && home > 0) {
      missingCse--;
      home--;
    }
    while (missingHtt > 0 && home > 0) {
      missingHtt--;
      home--;
    }
    const complete = missingCse === 0 && missingHtt === 0;
    const homeFree = this.homeFree;
    const possible =
      homeFree ?
      missingCse < 2 && missingCse + missingHtt < 3 :
      missingCse === 0 && missingHtt < 2;
    return {
      goal,
      complete,
      onTrack: complete,
      missingCse,
      missingHtt,
      completedExtraHtt: this.extraHtt,
      upcomingExtraHtt: 0,
      homeFree,
      possible,
    };
  }

  private addInternal(set: Set<string>, name: string) {
    // Try all permutations
    name = name.replace('%y', `Year ${this.year}`);
    const options = new Set([
      name.replace('(1 of 2)', '(2 of 2)'),
      name.replace('(2 of 2)', '(1 of 2)'),
      name.replace('Year 2', 'Year 1').replace('(1 of 2)', '(2 of 2)'),
      name.replace('Year 2', 'Year 1').replace('(2 of 2)', '(1 of 2)'),
    ]);
    for (const option of options) {
      if (!set.has(option)) {
        set.add(option);
        return;
      }
    }
  }

  private addHtt(count: number) {
    for (let i = 0; i < count; i++) {
      if (this.htt < this.year) {
        this.htt++;
      } else {
        this.extraHtt++;
      }
    }
  }

  private addHome(activity: ConcreteActivity) {
    if (this.home < 2 * this.year) {
      this.home++;
      if (activity.date > july15.getTime()) this.homeFree = false;
    }
  }
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
  const upcomingActivities: ConcreteActivity[] = upcoming.map(name => {
    const type = name === 'HTT' ? 'htt' : activitiesByName.get(name.replace('%y', 'Year 1'))?.type;
    if (!type) throw new Error(`Unknown upcoming activity: ${name}`);
    return {name, type, note: '', date: Date.now()};
  });
  let goal: 'branch'|'star' = year === 1 ? 'branch' : 'star';

  // Make a copy
  const doneActivities = new CompletedActivities(year, completed);
  const allActivities = new CompletedActivities(year, [...completed, ...upcomingActivities]);

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

  let check = allActivities.check(goal, branchData);
  if (goal === 'star' && !check.possible) {
    goal = 'branch';
    // If we're not at all on track for a star AND we didn't earn
    // the branch already last year, see if we can dial it back.
    const lastYear = july15.getTime();
    const completedLastYear = completed.filter(a => a.date < lastYear);
    const old = new CompletedActivities(1, completedLastYear).check(goal, branchData);
    if (!old.complete) check = allActivities.check(goal, branchData);
  }
  const done = doneActivities.check(goal, branchData);
  check.complete = done.complete;
  check.upcomingExtraHtt = check.completedExtraHtt - done.completedExtraHtt;
  check.completedExtraHtt = done.completedExtraHtt;
  return check;
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
  ]];
  for (const patrol of getSubpatrols()) {
    for (const trailman of getTrailmenBySubpatrol(patrol)!) {
      const row = [
        `${trailman.lastName}, ${trailman.firstName}`,
        patrol.replace('Mountain Lion', 'ML'),
        badge.get(trailman.id) || 'none',
      ];
      // First count the extra HTT so that we can use them strategically
      let doneExtraHtt = 0;
      let maybeExtraHtt = 0;
      const allProgresses = [...reports.get(trailman.id)!.values()];
      for (const p of allProgresses) {
        doneExtraHtt += p.completedExtraHtt;
        maybeExtraHtt += p.upcomingExtraHtt;
      }
      // Allocate extra HTT
      allProgresses.sort((a, b) => (a.missingCse - b.missingCse) || (a.missingHtt - b.missingHtt));
      for (const p of allProgresses) {
        if (!p.possible) continue;
        while (doneExtraHtt > 0 && p.missingHtt > 0) {
          doneExtraHtt--;
          p.missingHtt--;
          p.completedExtraHtt--;
        }
        if (p.missingHtt <= 0 && p.missingCse <= 0) {
          p.onTrack = true;
        } else if (p.missingHtt <= maybeExtraHtt) {
          maybeExtraHtt -= p.missingHtt;
        } else {
          p.possible = false;
        }
      }

      // Now report on everything
      const branchCells: string[] = [];
      let missingBranch = 7;
      for (const branch of BRANCHES) {
        const progress = reports.get(trailman.id)!.get(branch)!;
        doneExtraHtt += progress.completedExtraHtt;
        maybeExtraHtt += progress.upcomingExtraHtt;
        if (progress.onTrack) {
          let msg = `${progress.goal} ${progress.complete ? 'done' : 'on track'}`;
          if (progress.completedExtraHtt < 0) msg += ' using extra HTT';
          branchCells.push(msg);
          missingBranch--;
        } else {
          const no = !progress.possible;
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
      row.push(String(missingBranch), ...branchCells);
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

