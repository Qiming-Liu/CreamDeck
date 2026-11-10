import type { GamePage } from "../utils/backend";

const UNLOCKER_LABELS: Record<string, string> = { creamapi: "CreamAPI", smokeapi: "SmokeAPI" };

export function unlockerLabel(key: string | undefined): string {
  return UNLOCKER_LABELS[key ?? ""] ?? key ?? "";
}

export function targetBits(page: GamePage | undefined): number {
  const target = page?.targets?.find(value => value.path === (page.target_directory ?? "."));
  if (target) return target.bitness;
  return page?.api_dlls?.includes("steam_api64.dll") || !page?.api_dlls?.length ? 64 : 32;
}

// The platform DLL a direct replacement swaps: the one matching the game's bitness.
export function apiDll(page: GamePage | undefined): string {
  const present = page?.api_dlls ?? [];
  const preferred = targetBits(page) === 64 ? "steam_api64.dll" : "steam_api.dll";
  return present.includes(preferred) || !present.length ? preferred : present[0];
}

// Shorten "Game Name: Expansion" to "Expansion" for one-line change summaries.
export function shortName(name: string, game: string | undefined): string {
  if (!game) return name;
  const lower = name.toLocaleLowerCase(), prefix = game.toLocaleLowerCase();
  if (!lower.startsWith(prefix)) return name;
  const rest = name.slice(game.length).replace(/^[\s:：\-–—]+/, "");
  return rest || name;
}

// Visible page numbers: all of them, or a window of `limit` around the current page.
export function pageWindow(pages: number, current: number, limit = 7): number[] {
  const count = Math.min(pages, limit);
  const start = Math.max(0, Math.min(current - Math.floor(count / 2), pages - count));
  return Array.from({ length: count }, (_, index) => start + index);
}
