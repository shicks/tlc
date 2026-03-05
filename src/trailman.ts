import * as v from 'valibot';

export const Patrol = v.picklist(['Fox', 'Hawk', 'Mountain Lion']);
export type Patrol = v.InferOutput<typeof Patrol>;

export const TrailmanId = v.string();
export type TrailmanId = v.InferOutput<typeof TrailmanId>;

export const Trailman = v.pipe(v.object({
  firstName: v.string(),
  lastName: v.string(),
  id: TrailmanId,
  patrol: Patrol,
  year: v.number(),
}), v.readonly());
export type Trailman = v.InferOutput<typeof Trailman>;
