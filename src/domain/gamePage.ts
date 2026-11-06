import type { DlcInfo, GamePage } from "../utils/backend";

export interface Configuration {
  unlocker: string;
  proxy: boolean;
  proxyDll: string;
  enabledIds: string[];
}

const STEAM_PROXIES = ["version", "winmm", "winhttp"];
const DLC_NAME_ORDER = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export function proxyChoices(unlocker: string): string[] {
  return ["smokeapi", "creamapi"].includes(unlocker) ? STEAM_PROXIES : [];
}

// First-time default: everything except DLC that ships its own content files,
// which may crash the game when it is not downloaded. Unknown counts as normal.
export function defaultSelection(dlcs: DlcInfo[]): string[] {
  return dlcs.filter(dlc => dlc.has_depot !== true).map(dlc => dlc.id);
}

export function configurationForPage(page: GamePage): Configuration {
  if (!page.installed) return {
    unlocker: "creamapi",
    proxy: false,
    proxyDll: "version",
    // An uninstalled game keeps its previous selection instead of new defaults.
    enabledIds: page.has_record || !page.dlcs?.length ? page.enabled_dlc_ids ?? [] : defaultSelection(page.dlcs),
  };
  const unlocker = page.selected_unlocker ?? "creamapi";
  return {
    unlocker,
    proxy: !!page.proxy_dll,
    proxyDll: page.proxy_dll ?? proxyChoices(unlocker)[0] ?? "winmm",
    enabledIds: page.enabled_dlc_ids ?? [],
  };
}

export function selectUnlocker(config: Configuration, unlocker: string): Configuration {
  const choices = proxyChoices(unlocker);
  return {
    ...config, unlocker,
    proxy: (choices.length > 0 && config.proxy),
    proxyDll: choices.includes(config.proxyDll) ? config.proxyDll : choices[0] ?? "winmm",
  };
}

export function sameIds(first: string[], second: string[]): boolean {
  const a = new Set(first), b = new Set(second);
  return a.size === b.size && [...a].every(id => b.has(id));
}

export function filterDlcs(dlcs: DlcInfo[], query: string, selectedOnly: boolean, selected: string[]): DlcInfo[] {
  const text = query.trim().toLocaleLowerCase();
  const ids = new Set(selected);
  return dlcs.filter(dlc => (!selectedOnly || ids.has(dlc.id)) && (!text || `${dlc.name} ${dlc.id}`.toLocaleLowerCase().includes(text)))
    .sort((first, second) => DLC_NAME_ORDER.compare(first.name, second.name)
      || DLC_NAME_ORDER.compare(first.id, second.id));
}

// Batch actions affect only the visible result set and preserve hidden selections.
export function selectVisible(selected: string[], visible: DlcInfo[], checked: boolean): string[] {
  const next = new Set(selected);
  for (const dlc of visible) checked ? next.add(dlc.id) : next.delete(dlc.id);
  return [...next];
}

export interface SelectionChanges {
  added: DlcInfo[];
  removed: DlcInfo[];
  // Saved or selected IDs that are no longer in the catalog; dropped on apply.
  delisted: string[];
}

export function selectionChanges(dlcs: DlcInfo[], saved: string[], draft: string[]): SelectionChanges {
  const before = new Set(saved), after = new Set(draft);
  const known = new Set(dlcs.map(dlc => dlc.id));
  return {
    added: dlcs.filter(dlc => after.has(dlc.id) && !before.has(dlc.id)),
    removed: dlcs.filter(dlc => before.has(dlc.id) && !after.has(dlc.id)),
    delisted: [...after].filter(id => !known.has(id)),
  };
}

// The selection sent to the backend: only IDs the current catalog still lists.
export function applicableIds(dlcs: DlcInfo[], draft: string[]): string[] {
  const known = new Set(dlcs.map(dlc => dlc.id));
  return draft.filter(id => known.has(id));
}

// Where the "All DLC" switch sits: every, none, or some of the visible rows.
export function selectionLevel(visible: DlcInfo[], selected: string[]): "all" | "none" | "some" {
  const ids = new Set(selected);
  const count = visible.filter(dlc => ids.has(dlc.id)).length;
  return count === 0 ? "none" : count === visible.length ? "all" : "some";
}

export function sortDlcs(dlcs: DlcInfo[]): DlcInfo[] {
  return filterDlcs(dlcs, "", false, []);
}
