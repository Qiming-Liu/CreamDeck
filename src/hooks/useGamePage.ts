import { useCallback, useEffect, useRef, useState } from "react";
import { GamePage, getGamePage, getDlcPage, OperationResult } from "../utils/backend";
import { Configuration, configurationForPage } from "../domain/gamePage";

export function useGamePage(appId: string | null, message: (code?: string) => string) {
  const [page, setPage] = useState<GamePage>();
  const [draft, setDraft] = useState<Configuration>(configurationForPage({ found: false }));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [dlcLoading, setDlcLoading] = useState(false);
  const [dlcError, setDlcError] = useState("");
  const [preserved, setPreserved] = useState<string[]>([]);
  const generation = useRef(0);
  const lock = useRef(false);
  const dlcLock = useRef(false);
  const target = useRef<string | undefined>(undefined);
  const translate = useRef(message);
  translate.current = message;

  async function bounded<T>(request: Promise<T>, milliseconds: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([request, new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(translate.current())), milliseconds);
      })]);
    } finally { clearTimeout(timer); }
  }

  const refresh = useCallback(async (token: number, directory?: string) => {
    if (!appId) return;
    const value = await bounded(getGamePage(appId, directory), 15000);
    if (token !== generation.current) return;
    if (value.error_code) throw new Error(translate.current(value.error_code));
    target.current = value.target_directory;
    setPage(value);
    setDraft(configurationForPage(value));
    setNeedsRefresh(false);
  }, [appId]);

  const load = useCallback(async (directory?: string) => {
    if (lock.current) return;
    const token = generation.current;
    lock.current = true;
    setLoading(true); setError("");
    try { await refresh(token, directory ?? target.current); }
    catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : translate.current()); }
    finally {
      if (token === generation.current) { lock.current = false; setLoading(false); }
    }
  }, [refresh]);

  const loadDlcs = useCallback(async (force = false) => {
    if (!appId || dlcLock.current) return;
    const token = generation.current;
    dlcLock.current = true; setDlcLoading(true); setDlcError("");
    try {
      const result = await bounded(getDlcPage(appId, force), 35000);
      if (token !== generation.current) return;
      if (result.dlcs) setPage(previous => previous && ({ ...previous, dlcs: result.dlcs,
        dlc_updated_at: result.updated_at, dlc_cached: true }));
      if (!result.success) setDlcError(translate.current(result.error_code));
    } catch { if (token === generation.current) setDlcError(translate.current("catalog_unavailable")); }
    finally { if (token === generation.current) { dlcLock.current = false; setDlcLoading(false); } }
  }, [appId]);

  useEffect(() => {
    generation.current++;
    lock.current = false; dlcLock.current = false; target.current = undefined;
    setPage(undefined); setNotice(""); setPreserved([]); setNeedsRefresh(false);
    const token = generation.current;
    // Publish local state first; the catalog never blocks maintenance.
    void load().then(() => { if (token === generation.current) void loadDlcs(); });
    return () => { generation.current++; };
  }, [load, loadDlcs]);

  const action = async (run: () => Promise<OperationResult>, success: string, refreshError: string) => {
    if (lock.current) return;
    const token = generation.current;
    lock.current = true; setBusy(true); setError(""); setNotice(""); setPreserved([]);
    let succeeded = false;
    try {
      const result = await run();
      if (!result.success) throw new Error(result.error_code ? translate.current(result.error_code) : result.error || translate.current());
      succeeded = true;
      if (token !== generation.current) return;
      setPreserved(result.preserved_files ?? []);
      await refresh(token, target.current);
      if (token === generation.current) setNotice(success);
    } catch (e) {
      if (token === generation.current) {
        setError(succeeded ? refreshError : e instanceof Error ? e.message : translate.current());
        if (succeeded) setNeedsRefresh(true);
      }
    } finally {
      if (token === generation.current) { lock.current = false; setBusy(false); }
    }
  };

  return { page, draft, setDraft, loading, busy, error, notice, needsRefresh, preserved,
    dlcLoading, dlcError, loadDlcs, load, action };
}
