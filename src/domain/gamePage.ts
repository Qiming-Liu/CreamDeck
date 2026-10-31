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

export function configurationForPage(page: GamePage): Configuration {
  if (!page.installed) return {
    unlocker: "smokeapi",
    proxy: true,
    proxyDll: "version",
    enabledIds: page.enabled_dlc_ids ?? [],
  };
  const unlocker = page.selected_unlocker ?? "smokeapi";
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
