import { useEffect, useRef, useState } from "react";
import { inspectWineDllOverride, setWineDllOverride } from "../utils/wineDllOverride";

export interface AppDetailsState {
  // undefined while loading, null when Steam did not answer.
  options: string | null | undefined;
  // Steam's internal compatibility tool name: "" when the game runs natively,
  // undefined while loading and null when Steam did not answer.
  compatTool: string | null | undefined;
  compatToolName: string;
  setOptions: (value: string) => void;
  reload: () => void;
}

// One live subscription per page: launch options and the compatibility tool
// come from the same Steam app details and update when the user edits them.
export function useAppDetails(appId: number): AppDetailsState {
  const [options, setOptions] = useState<string | null>();
  const [compat, setCompat] = useState<{ tool?: string | null; name: string }>({ name: "" });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let registration: { unregister: () => void } | undefined;
    let stopped = false;
    setOptions(undefined); setCompat({ name: "" });
    if (!appId) return;
    const timer = setTimeout(() => {
      if (stopped) return;
      stopped = true; registration?.unregister();
      setOptions(null); setCompat({ tool: null, name: "" });
    }, 8000);
    try {
      registration = SteamClient.Apps.RegisterForAppDetails(appId, details => {
        if (stopped) return;
        if (details && details.strLaunchOptions === undefined) return;
        clearTimeout(timer);
        setOptions(details ? details.strLaunchOptions ?? "" : null);
        setCompat({ tool: details ? details.strCompatToolName ?? "" : null,
          name: details?.strCompatToolDisplayName || details?.strCompatToolName || "" });
      });
      if (stopped) registration.unregister();
    } catch { clearTimeout(timer); setOptions(null); setCompat({ tool: null, name: "" }); }
    return () => { stopped = true; clearTimeout(timer); registration?.unregister(); };
  }, [appId, revision]);

  return { options, compatTool: compat.tool, compatToolName: compat.name, setOptions,
    reload: () => setRevision(value => value + 1) };
}

export type LaunchState = ReturnType<typeof useWineDllOverride>;

// Derive the switch from Steam's actual launch options rather than a plugin setting.
export function useWineDllOverride(appId: number, proxyDll: string, active: boolean, details: AppDetailsState,
  onBusy: (busy: boolean) => void) {
  const [error, setError] = useState<"write" | "">("");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const options = details.options;
  useEffect(() => { setError(""); }, [appId, proxyDll, active]);

  const status = options == null ? { enabled: false, editable: false } : inspectWineDllOverride(options, proxyDll);

  async function toggle(enabled: boolean) {
    if (lock.current || !status.editable || !active) return;
    lock.current = true;
    setSaving(true); setError(""); onBusy(true);
    try {
      // Re-read before every edit so another tool's recent changes survive.
      const result = await setWineDllOverride(appId, proxyDll, enabled);
      if (!result) { setError("write"); return; }
      details.setOptions(result.launchOptions);
    } catch {
      setError("write");
    } finally {
      lock.current = false; onBusy(false); setSaving(false);
    }
  }

  const failure: "read" | "write" | "unsupported" | "" = options === null ? "read" : error
    || (options != null && !status.editable ? "unsupported" : "");
  return { ...status, options, loading: options === undefined, saving, error: failure,
    toggle, retry: () => { setError(""); details.reload(); } };
}
