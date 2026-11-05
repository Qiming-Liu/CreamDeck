// Proxy-DLL unlockers (SmokeAPI/CreamAPI in proxy mode) rely on the OS
// preferring a DLL dropped next to the game's .exe over the system one. On real
// Windows that's automatic. Under Proton, Wine ships its own builtin winmm.dll/
// version.dll/winhttp.dll and prefers those by default — so the dropped-in file
// just sits there unused unless the user adds a WINEDLLOVERRIDES launch option
// telling Wine to prefer the "native" (dropped-in) file for that DLL name. This
// silently breaks DLC unlocking with no error: the game launches fine because
// Wine's own real DLL loads instead, the unlocker's hook just never runs.
//
// SteamClient.Apps.{Get,Set}AppLaunchOptions (declared in @decky/ui's SteamClient
// globals) let us read/write the user's launch options directly, so this can be
// applied for them instead of leaving it as a manual instruction.

import { parseLaunchOptions } from "../domain/launchOptionsParser";

// Returns the current Launch Options string, or null if it couldn't be read
// (e.g. this app doesn't exist in SteamClient's app list).
export function getAppLaunchOptions(numericAppId: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let registration: { unregister: () => void } | undefined;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      registration?.unregister();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 8000);
    try {
      registration = SteamClient.Apps.RegisterForAppDetails(numericAppId, (details) => {
        if (details && details.strLaunchOptions === undefined) return;
        finish(details ? (details.strLaunchOptions ?? "") : null);
      });
      // Some clients invoke the callback immediately, before returning its handle.
      if (settled) registration.unregister();
    } catch {
      finish(null);
    }
  });
}

function overrides(current: string) {
  const parsed = parseLaunchOptions(current);
  if (parsed.diagnostics.length) throw new Error("Unsupported launch options");
  const assignments = parsed.assignments.filter(value => value.name === "WINEDLLOVERRIDES");
  // A repeated environment assignment uses its last value, as the shell does.
  const assignment = assignments[assignments.length - 1];
  if (assignment && assignment.value === undefined) throw new Error("Dynamic DLL overrides");
  // Do not shadow an assignment hidden inside an env wrapper or game argument.
  if (!assignment && /\bWINEDLLOVERRIDES=/.test(current)) throw new Error("Unsupported DLL override location");
  return { parsed, assignments, assignment };
}

function dllName(value: string): string { return value.trim().toLowerCase().replace(/\.dll$/, ""); }
function nativeFirst(value: string): boolean { return value.replace(/\s/g, "").toLowerCase() === "n,b"; }

export function inspectWineDllOverride(current: string, proxyDll: string): { enabled: boolean; editable: boolean } {
  try {
    const { assignment } = overrides(current);
    let enabled = false;
    for (const entry of (assignment?.value ?? "").split(";")) {
      const equals = entry.indexOf("=");
      if (equals < 0) continue;
      if (entry.slice(0, equals).split(",").some(name => dllName(name) === dllName(proxyDll))) enabled = nativeFirst(entry.slice(equals + 1));
    }
    return { enabled, editable: true };
  } catch { return { enabled: false, editable: false }; }
}

// Edit only the selected DLL. In grouped rules (version,dxgi=n,b), preserve dxgi.
export function editWineDllOverride(current: string, proxyDll: string, enabled: boolean): string {
  if (!/^[a-z0-9_]+$/i.test(proxyDll)) throw new Error("Invalid proxy DLL");
  const { assignments, assignment } = overrides(current);
  if (inspectWineDllOverride(current, proxyDll).enabled === enabled) return current;
  const entries: string[] = [];
  for (const entry of (assignment?.value ?? "").split(";")) {
    const equals = entry.indexOf("=");
    if (equals < 0) { if (entry) entries.push(entry); continue; }
    const names = entry.slice(0, equals).split(",");
    const order = entry.slice(equals + 1);
    const kept = names.filter(name => dllName(name) !== dllName(proxyDll) || (!enabled && !nativeFirst(order)));
    if (kept.length === names.length) entries.push(entry);
    else if (kept.length) entries.push(`${kept.join(",")}=${order}`);
  }
  if (enabled) entries.push(`${proxyDll}=n,b`);
  const value = entries.join(";");
  const replacement = `WINEDLLOVERRIDES="${value.replace(/[\\"$`]/g, "\\$&")}"`;
  if (!assignment) return `${replacement} ${current.trim() ? current : "%command%"}`;
  let { start, end } = assignment.span;
  if (!value && assignments.length === 1) {
    // Remove adjacent separator whitespace, preserving every other source span.
    if (/^[\t ]/.test(current.slice(end))) while (/[\t ]/.test(current[end] ?? "\n")) end++;
    else while (start > 0 && /[\t ]/.test(current[start - 1])) start--;
    return current.slice(0, start) + current.slice(end);
  }
  // Keep an empty final assignment when deleting it would resurrect an earlier one.
  return current.slice(0, start) + replacement + current.slice(end);
}

export function mergeWineDllOverride(current: string, proxyDll: string): string {
  return editWineDllOverride(current, proxyDll, true);
}

export interface ApplyResult {
  applied: boolean;
  alreadySet: boolean;
  launchOptions: string;
}

export async function setWineDllOverride(
  numericAppId: number,
  proxyDll: string,
  enabled: boolean,
): Promise<ApplyResult | null> {
  const current = await getAppLaunchOptions(numericAppId);
  if (current === null) return null;

  const merged = editWineDllOverride(current, proxyDll, enabled);
  const alreadySet = merged === current;
  if (!alreadySet) {
    SteamClient.Apps.SetAppLaunchOptions(numericAppId, merged);
    // Confirm the Steam client published our write before reporting readiness.
    for (let attempt = 0; attempt < 4; attempt++) {
      const saved = await getAppLaunchOptions(numericAppId);
      if (saved === merged) return { applied: true, alreadySet: false, launchOptions: saved };
      if (saved !== current && saved !== null) throw new Error("Launch options changed elsewhere");
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error("Steam did not confirm launch options");
  }
  return { applied: !alreadySet, alreadySet, launchOptions: merged };
}
