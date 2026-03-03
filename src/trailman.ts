import { z } from 'zod/mini';

export const Patrol = z.enum(['Fox', 'Hawk', 'Mountain Lion']);
export type Patrol = z.infer<typeof Patrol>;

export const Trailman = z.readonly(z.object({
  firstName: z.string(),
  lastName: z.string(),
  id: z.string(),
  patrol: Patrol,
  year: z.number(),
}));
export type Trailman = z.infer<Trailman>;
