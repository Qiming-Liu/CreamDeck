import { useEffect, useRef, useState } from "react";
import { inspectWineDllOverride, setWineDllOverride } from "../utils/wineDllOverride";

// Like CheatDeck, derive the switch from Steam's actual launch options rather
// than a plugin setting. Keep the subscription alive while this panel is open.
export function useWineDllOverride(appId: number, proxyDll: string, active: boolean, onBusy: (busy: boolean) => void) {
  const [options, setOptions] = useState<string | null>();
  const [error, setError] = useState<"read" | "write" | "unsupported" | "">("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const lock = useRef(false);

  useEffect(() => {
    const token = ++generation.current;
    let registration: { unregister: () => void } | undefined;
    let stopped = false;
    setOptions(undefined); setError("");
    if (!active || !appId) return;
    const timer = setTimeout(() => {
      if (generation.current !== token) return;
      stopped = true; registration?.unregister(); setOptions(null); setError("read");
    }, 8000);
    try {
      registration = SteamClient.Apps.RegisterForAppDetails(appId, details => {
        if (stopped || generation.current !== token) return;
        if (details && details.strLaunchOptions === undefined) return;
        clearTimeout(timer);
        setOptions(details ? details.strLaunchOptions ?? "" : null);
        setError(details ? "" : "read");
      });
    } catch { clearTimeout(timer); setOptions(null); setError("read"); }
    return () => { stopped = true; generation.current++; clearTimeout(timer); registration?.unregister(); };
  }, [appId, active, revision]);

  const status = options == null ? { enabled: false, editable: false } : inspectWineDllOverride(options, proxyDll);

  async function toggle(enabled: boolean) {
    if (lock.current || !status.editable) return;
    lock.current = true; const token = generation.current;
    setSaving(true); setError(""); onBusy(true);
    try {
      // Re-read before every edit so another plugin's recent changes survive.
      const result = await setWineDllOverride(appId, proxyDll, enabled);
      if (generation.current !== token) return;
      if (!result) { setError("read"); return; }
      setOptions(result.launchOptions);
    } catch {
      if (generation.current === token) setError("write");
    } finally {
      lock.current = false; onBusy(false);
      if (generation.current === token) setSaving(false);
    }
  }

  return { ...status, loading: active && options === undefined, saving,
    error: error || (options != null && !status.editable ? "unsupported" : ""),
    toggle, retry: () => setRevision(value => value + 1) };
}
