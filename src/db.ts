// Manages database in localStorage.

import { Trailman } from './trailman';
import * as v from 'valibot';

const TRAILMEN = '__sdh__trailmen';
const trailmen = v.pipe(v.array(Trailman), v.readonly());

export function storeTrailmen(trailmen: Trailman[]): void {
  localStorage.setItem(TRAILMEN, JSON.stringify(trailmen));
}

export function loadTrailmen(): readonly Trailman[] {
  return v.parse(trailmen, JSON.parse(localStorage.getItem(TRAILMEN) || '[]'));
}
