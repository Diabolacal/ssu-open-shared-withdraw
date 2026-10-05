/**
 * Multi-select within one storage window, file-manager style: click picks
 * one tile, Ctrl-click toggles, Shift-click selects a run from the anchor,
 * and a dragged box selects everything it touches. Only one window holds a
 * selection at a time.
 */

import type { PanelId } from "./moves";

export interface Selection {
  panel?: PanelId;
  keys: ReadonlySet<string>;
  /** Where a Shift-click run starts (the last plain or Ctrl click). */
  anchor?: string;
}

export const NO_SELECTION: Selection = { keys: new Set() };

export interface ClickModifiers {
  /** Ctrl (or Cmd): add or remove one tile. */
  toggle: boolean;
  /** Shift: select the run from the anchor to this tile. */
  range: boolean;
}

/** Keys a panel currently has selected (empty when another panel holds it). */
export function keysIn(selection: Selection, panel: PanelId): ReadonlySet<string> {
  return selection.panel === panel ? selection.keys : NO_SELECTION.keys;
}

/**
 * Apply a click on `key` in `panel`. `ordered` is the panel's selectable
 * tiles in display order, used to resolve Shift-click runs.
 */
export function clickSelect(
  selection: Selection,
  panel: PanelId,
  key: string,
  ordered: readonly string[],
  { toggle, range }: ClickModifiers,
): Selection {
  const current = keysIn(selection, panel);
  const anchor = selection.panel === panel ? selection.anchor : undefined;

  if (range && anchor !== undefined) {
    const from = ordered.indexOf(anchor);
    const to = ordered.indexOf(key);
    if (from >= 0 && to >= 0) {
      const run = ordered.slice(Math.min(from, to), Math.max(from, to) + 1);
      const keys = new Set(toggle ? [...current, ...run] : run);
      return { panel, keys, anchor };
    }
  }

  if (toggle) {
    const keys = new Set(current);
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
    return { panel, keys, anchor: key };
  }

  return { panel, keys: new Set([key]), anchor: key };
}

/**
 * The selection while a box is dragged over `hits` (display order). With
 * `additive` (Ctrl or Shift held) the box adds to what `base` had.
 */
export function boxSelect(
  base: Selection,
  panel: PanelId,
  hits: readonly string[],
  additive: boolean,
): Selection {
  if (additive && base.panel === panel) {
    return { panel, keys: new Set([...base.keys, ...hits]), anchor: base.anchor ?? hits[0] };
  }
  return { panel, keys: new Set(hits), anchor: hits[0] };
}
