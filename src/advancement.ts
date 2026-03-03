// Tools for dealing with advancement UI.

import { waitFor } from './util';

/**
 * Selects the given trailmen on the advancement page.  Returns the number of
 * selected trailmen.
 */
export function selectTrailmen(names: string[]): number {
  // TODO - verify preconditions, better error handling
  //   - but we do need to handle missing names somewhat gracefully...
  //     maybe keep track though? log?
  const opts =
    new Map([...$('#trailmen-select option')]
              .map(o => [o.textContent, o.value]));
  const ids = names.map(n => opts.get(n)).filter(x => x);
  $('#trailmen-select').val(ids).trigger('change');
  return ids.length;
};

/** Selects the given branch.  Returns true if successful. */
export function selectBranch = function(branch: string): boolean {
  const id = [...$('#badge-select option')].flatMap(o =>
    o.textContent.includes(branch) ? [o.value] : [])[0];
  if (!id) {
    console.error(`Could not find branch: ${branch}`);
    return false;
  }
  $('#badge-select').val(id).trigger('change');
  return true;
};

/** Selects trailmen and waits for the page to redraw. */
export async function switchTrailman(name: string): Promise<boolean> {
  selectTrailmen([]);
  await waitFor(() => [...$('#award_html input')].length === 0);
  if (!selectTrailmen([name])) return false;
  await waitFor(() => [...$('#award_html input')].length > 0);
  return true;
}

/** Selects branch and waits for the page to redraw. */
export async function switchBranch(branch: string): Promise<boolean> {
  if (!selectBranch(branch)) return false;
  const queries = [
    '.panel-title',
    '#table_header tr:first-child th:first-child h4',
  ];
  await waitFor(() =>
    queries.flatMap(q => [...document.querySelectorAll(q)])
      .some(e => e.textContent.includes(branch)));
  return true;
}
