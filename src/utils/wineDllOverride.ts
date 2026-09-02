// Proxy-DLL unlockers (SmokeAPI/CreamAPI in proxy mode, Koaloader) rely on the OS
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

function wineDllOverrideToken(proxyDll: string): string {
  return `${proxyDll}=n,b`;
}

// Returns the current Launch Options string, or null if it couldn't be read
// (e.g. this app doesn't exist in SteamClient's app list).
export function getAppLaunchOptions(numericAppId: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const registration = SteamClient.Apps.RegisterForAppDetails(numericAppId, (details) => {
      if (settled) return;
      settled = true;
      resolve(details ? (details.strLaunchOptions ?? "") : null);
      registration.unregister();
    });
  });
}

// Merges a WINEDLLOVERRIDES clause for `proxyDll` into `current` launch options,
// without disturbing anything else the user already has set:
//  - already has that exact override → returned unchanged
//  - already has a WINEDLLOVERRIDES="..." clause (for other DLLs) → appends to it
//  - no WINEDLLOVERRIDES at all → prefixes a new one (Steam runs the whole string
//    as a prefix before the real command whether or not %command% appears in it)
export function mergeWineDllOverride(current: string, proxyDll: string): string {
  const token = wineDllOverrideToken(proxyDll);
  const overrideRegex = /WINEDLLOVERRIDES="([^"]*)"/;
  const match = current.match(overrideRegex);

  if (match) {
    const existing = match[1];
    if (existing.split(";").map((s) => s.trim()).includes(token)) {
      return current; // already set
    }
    const merged = existing ? `${existing};${token}` : token;
    return current.replace(overrideRegex, `WINEDLLOVERRIDES="${merged}"`);
  }

  const prefix = `WINEDLLOVERRIDES="${token}"`;
  return current.trim() ? `${prefix} ${current}` : `${prefix} %command%`;
}

export interface ApplyResult {
  applied: boolean;
  alreadySet: boolean;
  launchOptions: string;
}

export async function applyWineDllOverride(
  numericAppId: number,
  proxyDll: string,
): Promise<ApplyResult | null> {
  const current = await getAppLaunchOptions(numericAppId);
  if (current === null) return null;

  const merged = mergeWineDllOverride(current, proxyDll);
  const alreadySet = merged === current;
  if (!alreadySet) {
    SteamClient.Apps.SetAppLaunchOptions(numericAppId, merged);
  }
  return { applied: !alreadySet, alreadySet, launchOptions: merged };
}
