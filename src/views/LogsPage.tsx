import { FileSelectionType, openFilePicker, toaster } from "@decky/api";
import { Focusable, GamepadButton, Navigation, QuickAccessTab } from "@decky/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, C, Icons, PageStyle } from "../components/ui";
import { clearLog, errorText, exportLog, getLog, getLogExportDirectory, logFrontend, type LogEntry } from "../utils/backend";
import { useTranslations } from "../utils/i18n";
import { PAGE_BOTTOM_OFFSET, PAGE_TOP_OFFSET } from "./CreamDeckPage";

const LIMIT = 500;

function levelColor(level: string): string | undefined {
  if (level === "ERROR" || level === "CRITICAL") return C.red;
  if (level === "WARNING") return C.orange;
  return undefined;
}

// The plugin's log for every game, opened from the quick access panel.
export default function LogsPage() {
  const t = useTranslations();
  const [entries, setEntries] = useState<LogEntry[]>();
  const [error, setError] = useState("");
  const toast = (body: string) => toaster.toast({ title: "CreamDeck", body, duration: 5000 });
  const load = () => getLog(LIMIT).then(value => { setEntries(value); setError(""); }).catch(reason => {
    setEntries([]); setError(errorText(reason));
    logFrontend("error", "Read log", reason);
  });
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useEffect(() => { void load(); }, []);
  // Keep the newest entries in view, unless the user scrolled up.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (box && atBottom.current) box.scrollTop = box.scrollHeight;
  }, [entries]);

  const back = () => { Navigation.NavigateBack(); Navigation.OpenQuickAccessMenu(QuickAccessTab.Decky); };
  const exportFile = async () => {
    let folder: string;
    try {
      const start = await getLogExportDirectory().catch(() => "/home");
      const picked = await openFilePicker(FileSelectionType.FOLDER, start, false, true);
      folder = picked.realpath || picked.path;
    } catch { return; } // Picker closed.
    try { toast(t.exported(await exportLog(folder))); }
    catch (reason) { toast(errorText(reason)); } // The backend logs the failed export.
  };
  const clear = async () => {
    try { await clearLog(); toast(t.cleared); }
    catch (reason) { toast(errorText(reason)); }
    await load();
  };

  return <div className="cd-font" style={{ position: "absolute", inset: 0, paddingTop: PAGE_TOP_OFFSET, paddingBottom: PAGE_BOTTOM_OFFSET, boxSizing: "border-box",
    background: C.page, color: C.text, display: "flex" }}>
    <PageStyle />
    <Focusable flow-children="column" onCancelButton={back} style={{ flex: "1 1 auto", minHeight: 0, boxSizing: "border-box",
      padding: "28px 48px 24px 48px", display: "flex", flexDirection: "column", gap: 18 }}>
      <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto" }}>
        <Button icon label={t.back} onClick={back}>{Icons.back()}</Button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.white }}>{t.logs}</h1>
        <div style={{ flex: "1 1 auto" }} />
        <Button onClick={() => { void exportFile(); }} disabled={!entries?.length}>{Icons.export()}{t.export}</Button>
        <Button onClick={() => { void clear(); }} disabled={!entries?.length}>{Icons.trash()}{t.clear}</Button>
      </Focusable>
      {/* Focusable so the D-pad can scroll it; up past the top returns to the buttons. */}
      <Focusable onActivate={() => undefined} onGamepadDirection={event => {
        const box = scroller.current;
        const button = event.detail.button;
        if (!box || (button !== GamepadButton.DIR_DOWN && button !== GamepadButton.DIR_UP)) return;
        const step = button === GamepadButton.DIR_DOWN ? 120 : -120;
        if (step < 0 && box.scrollTop <= 0) return;
        box.scrollBy({ top: step });
        event.preventDefault();
        event.stopPropagation();
      }} style={{ flex: "1 1 auto", minHeight: 0, boxSizing: "border-box", padding: "14px 18px", borderRadius: 4,
        background: "rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, color: C.muted }}>{t.lastLines(LIMIT)}</div>
        <div ref={scroller} onScroll={() => {
          const box = scroller.current;
          if (box) atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
        }} style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", fontSize: 13, lineHeight: 1.75, fontFamily: C.mono,
          color: C.secondary, overflowWrap: "anywhere" }}>
          {error && <div style={{ color: C.red }}>{error}</div>}
          {!error && entries?.length === 0 && <div style={{ color: C.muted }}>{t.logsEmpty}</div>}
          {entries?.map((entry, index) => {
            const color = levelColor(entry.level);
            // pre-wrap keeps the lines of a traceback.
            return <div key={index} style={{ whiteSpace: "pre-wrap" }}>
              <span style={{ color: C.dim }}>{entry.time} </span>
              <span style={color ? { color } : undefined}>{entry.level} {entry.message}</span>
            </div>;
          })}
        </div>
      </Focusable>
      <div style={{ fontSize: 12, color: C.dim, flex: "0 0 auto" }}>{t.logsHint}</div>
    </Focusable>
  </div>;
}
