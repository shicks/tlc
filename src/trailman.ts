import * as v from 'valibot';
import {Db} from './db';

export const PATROLS = ['Fox', 'Hawk', 'Mountain Lion'];
export const Patrol = v.picklist(PATROLS);
export type Patrol = v.InferOutput<typeof Patrol>;

export const SUBPATROLS = PATROLS.flatMap(p => [`${p} 1`, `${p} 2`]);

export const TrailmanId = v.string();
export type TrailmanId = v.InferOutput<typeof TrailmanId>;

export const Trailman = v.pipe(v.object({
  firstName: v.string(),
  lastName: v.string(),
  name: v.string(),
  id: TrailmanId,
  patrol: Patrol,
  year: v.number(),
  subpatrol: v.string(),
}), v.readonly());
export type Trailman = v.InferOutput<typeof Trailman>;

// TODO - store memoized activity data here, too!


// Lazily initialized.
// TODO - switch to IndexedDB and maybe BrowserChannel for update broadcasts

const db = new Db<readonly Trailman[]>(
  '__sdh__trailmen',
  v.pipe(v.array(Trailman), v.readonly()),
  [],
  (trailmen: readonly Trailman[]) => {
    byId = new Map(trailmen.map(t => [t.id, t]));
    byName = new Map(trailmen.map(t => [t.id, t]));
    byPatrol = Map.groupBy(trailmen, t => t.patrol);
    byYear = Map.groupBy(trailmen, t => t.year);
    bySubpatrol = Map.groupBy(trailmen, t => t.subpatrol);
  },
);

let byId: Map<TrailmanId, Trailman>|undefined = undefined;
let byName: Map<string, Trailman>|undefined = undefined;
let byPatrol: Map<Patrol, Trailman[]>|undefined = undefined;
let byYear: Map<number, Trailman[]>|undefined = undefined;
let bySubpatrol: Map<string, Trailman[]>|undefined = undefined;

export function storeTrailmen(trailmen: Trailman[]): void {
  db.set(trailmen);
}

export function getTrailmen(): Trailman[] {
  return [...db.get()];
}

export function getTrailmanById(id: TrailmanId): Trailman|undefined {
  db.get();
  return byId!.get(id);
}

export function getTrailmanByName(name: string): Trailman|undefined {
  db.get();
  return byName!.get(name);
}

export function getTrailmenByPatrol(patrol: Patrol): readonly Trailman[] {
  db.get();
  return byPatrol!.get(patrol) || [];
}

export function getTrailmenByYear(year: number): readonly Trailman[] {
  db.get();
  return byYear!.get(year) || [];
}

export function getTrailmenBySubpatrol(subpatrol: string): readonly Trailman[] {
  db.get();
  return bySubpatrol!.get(subpatrol) || [];
}

/** Returns a sorted array of actual subpatrols that have any trailmen in them. */
export function getSubpatrols(): string[] {
  db.get();
  return [...bySubpatrol!.keys()].sort();
}
