// Analysis of advancement grid to figure out what everybody needs.

import { scrapeProgress, switchBranch } from './advancement';
import {
  BRANCHES,
  Branch,
  type BranchData,
  ConcreteActivity,
  // HERITAGE,
  // HOBBIES,
  // LIFE,
  // OUTDOOR,
  // SCIENCE,
  // SPORTS,
  // VALUES,
  getBranchData,
  scrapeBranch,
} from './branch';
import { Db } from './db';
import {
  TrailmanId,
  getSubpatrols,
  getTrailmanById,
  getTrailmen,
  getTrailmenBySubpatrol,
} from './trailman';
import {
  isBefore,
  isLastYear,
  isThisYear,
  parseDate,
  toSlash,
  today,
} from './util';
import { Dialog, addButtonsToTop } from './ui';
import * as v from 'valibot';

import PlainDate = Temporal.PlainDate;

const ActivityName = v.string();
const Date = v.pipe(v.string(), v.transform(parseDate));
const Dates = v.pipe(v.array(Date), v.readonly());
const BranchCalendar = v.pipe(v.record(ActivityName, Dates), v.readonly());
type BranchCalendar = v.InferOutput<typeof BranchCalendar>;
const Calendar = v.pipe(v.record(Branch, BranchCalendar), v.readonly())
type Calendar = v.InferOutput<typeof Calendar>;

const calDb = new Db<Calendar>(
  '__sdh__calendar',
  Calendar, // TODO - the parseDate transform is one-way, won't serialize
  {},
  {
    replacer(_key: string, val: unknown): unknown {
      return val instanceof PlainDate ? String(val) : val;
    },
  },
);

// type ActivityName = v.InferOutput<typeof ActivityName>;
// type DateString = string;
// const upcoming: Record<Branch, Record<ActivityName, DateString>> = {
//   // TODO - convert to a calendar, only add if after today
//   [HERITAGE]: {
//     'Christian Heritage': '9/8/25',
//     'Flag Etiquette and History': '9/29/25',
//     'Early America': '10/6/25',
//     'HTT: National Mall Scavenger Hunt': '9/13/25',
//   },
//   [LIFE]: {
//     'First Aid - Traumatic': '10/20/25',
//     'Map Skills': '10/27/25',
//     'Personal Safety': '11/17/25',
//     'Repairs': '11/3/25',
//     'HTT: Bull Run Hike': '11/15/25',
//     'HTT: Nova Labs': '11/22/25',
//   },
//   [SCIENCE]: {
//     'Know Your Environment': '2/2/26',
//     'Science in Weather': '2/9/26',
//     'Rocketry': '4/27/26',
//     'HTT: Lego Brick Derby': '2/28/26',
//   },
//   [HOBBIES]: {
//     'General Hobbies - %y': '1/5/26',
//     'Elective - %y (1 of 2)': '5/31/26', // '2/23/26',
//     'Elective - %y (2 of 2)': '4/20/26',
//     'HTT: Board Games': '1/24/26',
//   },
//   [VALUES]: {
//     'Godly Values': '12/1/25',
//     'Our Faith': '12/8/25',
//     'Service': '5/31/26', // '1/26/26',
//     'Dedication': '1/12/26',
//     'HTT: Supreme Court Living Nativity': '12/4/25',
//     'HTT: Wreaths Across America': '12/13/25',
//   },
//   [SPORTS]: {
//     'Nutrition & Fitness - %y': '3/9/26',
//     'Learn about Sports - %y': '3/2/26',
//     'Uncommon Sports': '3/16/26',
//     'HTT: GMU Basketball Game': '1/10/26',
//     'HTT: Monthly Hike': '3/14/26',
//   },
//   [OUTDOOR]: {
//     'Ropes & Knots': '9/15/25',
//     'Outdoor Cooking': '9/22/25',
//     'Orienteering': '4/13/26',
//     'Fire Safety': '9/20/25', // NOTE: Or 10/4/25 from ML campout
//     'Tread Lightly!®': '3/23/26',
//     'HTT: Burke Lake Hike': '10/18/25',
//     'HTT: IBC Fall Fest': '10/25/25',
//   },
// };

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
      if (isThisYear(activity.date)) this.homeFree = false;
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
  upcoming: BranchCalendar,
  completed: ConcreteActivity[],
  year: number,
): StructuredProgress {
  const activitiesByName = new Map(Object.values(branchData.activities).map(a => [a.name, a]));
  const upcomingActivities: ConcreteActivity[] = Object.entries(upcoming).flatMap(([name, dates]) => {
    const type = name.startsWith('HTT') ? 'htt' : activitiesByName.get(name.replace('%y', 'Year 1').replace(/:.*/, ''))?.type;
    if (!type) throw new Error(`Unknown upcoming activity: ${name}`);
    return dates.filter(d => isBefore(d, today)).map(date => ({name, type, note: '', date}));
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
    const completedLastYear = completed.filter(a => isLastYear(a.date));
    const old = new CompletedActivities(1, completedLastYear).check(goal, branchData);
    if (!old.complete) check = allActivities.check(goal, branchData);
  }
  const done = doneActivities.check(goal, branchData);
  check.complete = done.complete;
  check.upcomingExtraHtt = check.completedExtraHtt - done.completedExtraHtt;
  check.completedExtraHtt = done.completedExtraHtt;
  return check;
}

export async function editCalendar() {
  // Allow editing the calendar of all planned core steps/electives/htts.
  const calendar = calDb.get();
  let calendarText: string = formatCalendar(calendar, true);
  while (true) {
    try {
      calendarText = await Dialog.editableTextarea(calendarText, {
        Sparse(text: string) {
          try {
            return formatCalendar(parseCalendar(text), true);
          } catch {
            return text;
          }
        },
        Dense(text: string) {
          try {
            return formatCalendar(parseCalendar(text), false);
          } catch {
            return text;
          }
        },
      });
    } catch {
      return;
    }
    try {
      const newCal = parseCalendar(calendarText);
      calDb.set(newCal);
      return;
    } catch (err: unknown) {
      await Dialog.confirm((err as Error)?.message);
    }
  }
}

function formatCalendar(c: Calendar, sparse = false): string {
  const blocks = [`# Add dates of the form MM/DD/YY after the equal signs.
# Multiple dates for an event can be separated with commas.`,];
  for (const branch of BRANCHES) {
    const block = [`[${branch}]`];
    // Read the branch data
    const branchData = getBranchData(branch);
    type Entries = [string, readonly PlainDate[]][];
    const coreSteps = new Map<string, Entries>();
    const electives = new Map<string, Entries>();
    const htts: Entries = [];
    for (const activity of Object.values(branchData.activities)) {
      const name = activity.name.replace(/Year [12]/, '%y');
      if (activity.type === 'core') coreSteps.set(name, []);
      if (activity.type === 'elective') electives.set(name, []);
    }
    // Read the calendar
    for (const [activity, dates] of Object.entries(c[branch] || {})) {
      const prefix = activity.replace(/:.*/, '').trim();
      const entry = coreSteps.get(prefix) || electives.get(prefix);
      if (prefix === 'HTT') {
        htts.push([activity, dates]);
      } else if (entry) {
        entry.push([activity, dates]);
      } else {
        throw new Error(`Unknown calendar entry: ${activity}\n${[...coreSteps].map(([k,v])=>`${k} => ${v}`).join('\n')}`);
      }        
    }
    // Format the calendar
    function formatDate(d: PlainDate): string {
      return `${d.month}/${d.day}/${d.year}`;
    }
    function addEntry(fallbackName: string, entries: Entries) {
      for (const [name, dates] of entries) {
        if (!sparse || dates.length) {
          block.push(`${name} = ${dates.map(formatDate).join(', ')}`);
        }
      }
      if (!entries.length && !sparse) {
        block.push(`${fallbackName} =`);
      }
    }
    for (const [coreStep, activities] of coreSteps) {
      addEntry(coreStep, activities);
    }
    for (const [elective, activities] of electives) {
      addEntry(elective, activities);
    }
    if (sparse && block.length === 1) continue;
    addEntry('HTT', htts);
    blocks.push(block.join('\n'));
  }
  return blocks.join('\n\n');
}

function parseCalendar(s: string): Calendar {
  // TODO - errors for unknown activities???
  const calendar = Object.fromEntries(BRANCHES.map(b => [b, {}]));
  let branchCal: Record<string, PlainDate[]>|undefined = undefined;
  for (const orig of s.trim().split(/\n+/g)) {
    const line = orig.replace(/#.*$/, '').trim();
    if (!line) continue;
    const branchLine = /\[(.*)\]$/.exec(line);
    if (branchLine) {
      branchCal = calendar[branchLine[1] as Branch];
      if (!branchCal) throw new Error(`Invalid branch line: ${line}`);
    }
    const activityLine = /^(.*)=\s*(.*)$/.exec(line);
    if (activityLine) {
      if (!branchCal) throw new Error(`Activity line without branch`);
      const name = activityLine[1]!.trim();
      const dates = activityLine[2]!.split(/\s*,\s*/g).filter(x => x).map(parseDate);
      branchCal[name] = dates;
    }
  }
  return calendar;
}

export async function analyzeProgress() {
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
      const date = parseDate(dateElem.textContent);
      if (isLastYear(date)) {
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
        .set(branch, checkBranchProgress(branchData, calDb.get()[branch]!, activities, t.year));
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

export async function exportAttendance() {
  // TODO - do we care about forest award status? if so, copy?

  // Iterate over the branches to get progress.
  interface Report {
    map: Map<string, PlainDate>;
    completed: CompletedActivities;
  }
  const reports = new Map<TrailmanId, Map<Branch, Report>>(
    getTrailmen().map(t => [t.id, new Map()]),
  );
  const extraHtt = new Map<TrailmanId, number>();
  for (const branch of BRANCHES) {
    await switchBranch(branch);
    const branchData = scrapeBranch();
    for (const [t, activities] of scrapeProgress(branchData)) {
      const map = new Map<string, PlainDate>();
      const completed = new CompletedActivities(t.year, activities);
      extraHtt.set(t.id, (extraHtt.get(t.id) || 0) + completed.extraHtt);
      for (const a of activities) {
        const name = a.type === 'htt' ? `HTT: ${String(a.date)}` : a.name;
        const prev = map.get(name);
        if (!prev || isBefore(prev, a.date)) map.set(name, a.date);
      }
      reports.get(t.id)!.set(branch, {map, completed});
    }
  }

  // Set up the column headers (=trailmen)
  const columns = [
    'Branch',   // TODO - merge
    'Activity',
    'Date',
  ];
  const row0 = ['', '', ''];
  const extraHttRow = ['', 'Extra HTT', ''];
  const data = [row0, columns, extraHttRow];
  const trailmenIds: TrailmanId[] = [];
  for (const patrol of getSubpatrols()) {
    for (const trailman of [...getTrailmenBySubpatrol(patrol)!].sort((a, b) => {
      return a.lastName < b.lastName ? -1 : a.lastName > b.lastName ? 1 :
        a.firstName < b.firstName ? -1 : a.firstName > b.firstName ? 1 : 0;
    })) {
      row0.push(trailman.subpatrol);
      columns.push(`${trailman.lastName}, ${trailman.firstName}`);
      extraHttRow.push(String(extraHtt.get(trailman.id) || 0));
      trailmenIds.push(trailman.id);
    }
  }

  // Look at calendar
  const calendar = calDb.get();
  for (const branch of BRANCHES) {
    // First format the activities
    for (const [activity, dates] of Object.entries(calendar[branch] || {})) {
      const date = dates[0]!; // TODO - handle multiple dates reasonably?
      const name = activity.startsWith('HTT:') ?
        `HTT: ${String(date)}` :
        activity.replace(/:.*/, '');
      const row = [branch, activity, toSlash(date)];
      for (const tid of trailmenIds) {
        const {year} = getTrailmanById(tid)!;
        const report = reports.get(tid)!.get(branch)!;
        const date = report.map.get(name.replace('%y', `Year ${year}`));
        row.push(date ? toSlash(date) : '');
      }
      data.push(row);
    }
    // Then format the counts
    const bi = getBranchData(branch);
    const core = [branch, `# Core Steps (${bi.needCoreSteps})`, ''];
    const elective = [branch, `# Electives (${bi.needElectives})`, ''];
    const htt = [branch, `# HTT (1)`, ''];
    const home = [branch, `# Home/2`, ''];
    const homeEligible = [branch, `Home Eligible`, ''];
    for (const tid of trailmenIds) {
      const report = reports.get(tid)!.get(branch)!.completed;
      core.push(String(report.coreSteps.size || ''));
      elective.push(String(report.electives.size || ''));
      htt.push(String(report.htt || ''));
      home.push(String((report.home >>> 1) || ''));
      homeEligible.push(report.homeFree ? 'Y' : '');
    }
    data.push(core, elective, htt, home, homeEligible);
  }
  // Make TSV
  let transposed = false;
  Dialog.textarea(data.map(row => row.join('\t')).join('\n'), {
    Transpose() {
      transposed = !transposed;
      return (transposed ? transpose(data) : data).map(r => r.join('\t')).join('\n');
    },
  });
  function transpose<T>(arr: readonly T[][]): readonly T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < arr[i]!.length; j++) {
        (out[j] || (out[j] = []))[i] = arr[i]![j]!;
      }
    }
    return out;
  }
}


async function scrapeAllBranches() {
  for (const b of BRANCHES) {
    await switchBranch(b);
    scrapeBranch();
  }
}

function installUi() {
  addButtonsToTop({
    Analyze: {
      'Scrape': scrapeBranch,
      'Scrape All': scrapeAllBranches,
      'Edit Calendar': editCalendar,
      'Analyze Progress': analyzeProgress,
      'Export Attendance': exportAttendance,
    },
  });
}
const URL_PREFIX = 'https://www.traillifeconnect.com/advancement';
if (window.location.href.startsWith(URL_PREFIX)) installUi();

// TODO - when missing a single thing, is a family activity an option?
//      - when missing too much, just give up?
// List whether they earned forest award last year?
// e.g. year 2 earned branch only - want more info...

