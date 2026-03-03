import * as v from 'valibot';

export const Patrol = v.enum(['Fox', 'Hawk', 'Mountain Lion']);
export type Patrol = v.InferOutput<typeof Patrol>;

export const Trailman = v.pipe(v.object({
  firstName: v.string(),
  lastName: v.string(),
  id: v.string(),
  patrol: Patrol,
  year: v.number(),
}), v.readonly());
export type Trailman = v.InferOutput<Trailman>;
