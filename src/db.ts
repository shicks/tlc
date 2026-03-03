// Manages database in localStorage.

import { Trailman } from './trailman';
import { z } from 'zod/mini';

const TRAILMEN = '__sdh__trailmen';
const trailmen = z.readonly(z.array(Trailman));

export function storeTrailmen(trailmen: Trailman[]): void {
  localStorage.setItem(TRAILMEN, JSON.stringify(trailmen));
}

export function loadTrailmen(): readonly Trailman[] {
  return trailmen.parse(JSON.parse(localStorage.getItem(TRAILMEN) || '[]'));
}
