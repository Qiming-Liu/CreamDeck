import type { DlcInfo, GamePage } from "../utils/backend";

export interface Configuration {
  unlocker: string;
  proxy: boolean;
  proxyDll: string;
  autoload: string[];
  enabledIds: string[];
}

const STEAM_PROXIES = ["version", "winmm", "winhttp"];
export const AUTOLOAD_CHOICES = ["smokeapi", "screamapi", "uplay_r1", "uplay_r2"];

export function proxyChoices(unlocker: string): string[] {
  if (unlocker === "koaloader") return ["version", "winmm", "winhttp", "dxgi", "d3d9", "d3d10", "d3d11", "dinput8"];
  return ["smokeapi", "creamapi"].includes(unlocker) ? STEAM_PROXIES : [];
}

export function configurationForPage(page: GamePage): Configuration {
  if (!page.installed) return {
    unlocker: "smokeapi",
    proxy: true,
    proxyDll: "version",
    autoload: [],
    enabledIds: page.enabled_dlc_ids ?? [],
  };
  const unlocker = page.selected_unlocker ?? "smokeapi";
  return {
    unlocker,
    proxy: unlocker === "koaloader" || !!page.proxy_dll,
    proxyDll: page.proxy_dll ?? proxyChoices(unlocker)[0] ?? "winmm",
    autoload: page.koaloader_autoload ?? [],
    enabledIds: page.enabled_dlc_ids ?? [],
  };
}

export function selectUnlocker(config: Configuration, unlocker: string): Configuration {
  const choices = proxyChoices(unlocker);
  return {
    ...config, unlocker,
    proxy: unlocker === "koaloader" || (choices.length > 0 && config.proxy),
    proxyDll: choices.includes(config.proxyDll) ? config.proxyDll : choices[0] ?? "winmm",
  };
}

export function supportsDlcList(config: Configuration): boolean {
  return ["smokeapi", "creamapi"].includes(config.unlocker) || (config.unlocker === "koaloader" && config.autoload.includes("smokeapi"));
}

export function sameIds(first: string[], second: string[]): boolean {
  const a = new Set(first), b = new Set(second);
  return a.size === b.size && [...a].every(id => b.has(id));
}

export function filterDlcs(dlcs: DlcInfo[], query: string, selectedOnly: boolean, selected: string[]): DlcInfo[] {
  const text = query.trim().toLocaleLowerCase();
  const ids = new Set(selected);
  return dlcs.filter(dlc => (!selectedOnly || ids.has(dlc.id)) && (!text || `${dlc.name} ${dlc.id}`.toLocaleLowerCase().includes(text)));
}

// Batch actions affect only the visible result set and preserve hidden selections.
export function selectVisible(selected: string[], visible: DlcInfo[], checked: boolean): string[] {
  const next = new Set(selected);
  for (const dlc of visible) checked ? next.add(dlc.id) : next.delete(dlc.id);
  return [...next];
}
