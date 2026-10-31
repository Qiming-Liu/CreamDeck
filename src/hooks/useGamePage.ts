import { useCallback, useEffect, useRef, useState } from "react";
import { GamePage, getGamePage, OperationResult } from "../utils/backend";
import { Configuration, configurationForPage } from "../domain/gamePage";

export function useGamePage(appId: string | null, loadFailureMessage: string) {
  const [page, setPage] = useState<GamePage>();
  const [draft, setDraft] = useState<Configuration>(configurationForPage({ found: false }));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const mounted = useRef(false);
  const lock = useRef(false);
  const failureMessage = useRef(loadFailureMessage);
  failureMessage.current = loadFailureMessage;

  const refresh = useCallback(async () => {
    if (!appId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<GamePage>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(failureMessage.current)), 30000);
    });
    let value: GamePage;
    try { value = await Promise.race([getGamePage(appId), timeout]); }
    finally { clearTimeout(timer); }
    if (mounted.current) {
      setPage(value);
      setDraft(configurationForPage(value));
      setNeedsRefresh(false);
    }
  }, [appId]);

  const load = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setLoading(true); setError("");
    try { await refresh(); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : String(e)); }
    finally {
      lock.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  // Preserve edits after a failed mutation; re-read authoritative state on success.
  const action = async (run: () => Promise<OperationResult>, success: string, refreshError: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    let succeeded = false;
    try {
      const result = await run();
      if (!result.success) throw new Error(result.error || "Operation failed");
      succeeded = true;
      await refresh();
      if (mounted.current) setNotice(success);
    } catch (e) {
      if (mounted.current) {
        setError(succeeded ? refreshError : e instanceof Error ? e.message : String(e));
        if (succeeded) setNeedsRefresh(true);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return { page, draft, setDraft, loading, busy, error, notice, needsRefresh, load, action };
}
