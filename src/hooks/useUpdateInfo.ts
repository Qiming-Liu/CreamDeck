import { useEffect, useSyncExternalStore } from "react";
import { getUpdateInfo, UpdateInfo } from "../utils/backend";

// One shared answer for the Quick Access title, the plugin icon and the game
// page. The backend asks GitHub at most once a week and never fails loudly, so
// asking it whenever a view mounts or Quick Access opens is cheap.

let info: UpdateInfo | undefined;
let pending: Promise<void> | undefined;
const listeners = new Set<() => void>();

export function refreshUpdate(): Promise<void> {
  pending ??= getUpdateInfo(false).then(next => {
    if (next && (next.current !== info?.current || next.latest !== info?.latest || next.os !== info?.os)) {
      info = next;
      listeners.forEach(listener => listener());
    }
  }).catch(() => undefined).finally(() => { pending = undefined; });
  return pending;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useUpdateInfo(): UpdateInfo | undefined {
  const value = useSyncExternalStore(subscribe, () => info);
  useEffect(() => { void refreshUpdate(); }, []);
  return value;
}

export const RELEASES_URL = "https://github.com/Qiming-Liu/CreamDeck/releases/latest";
