import { toaster } from "@decky/api";
import { Focusable, GamepadButton, Navigation, QuickAccessTab } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { Button, C, Icons, STYLES } from "../components/ui";
import { clearActionLog, getActionLog } from "../utils/backend";
import { useTranslations } from "../utils/i18n";
import { PAGE_BOTTOM_OFFSET, PAGE_TOP_OFFSET } from "./CreamDeckPage";

const LIMIT = 200;
const LINE = /^\d{4}-\d{2}-\d{2} (\d{2}:\d{2}:\d{2})(?:[,.]\d+)? \[(\w+)\] (.*)$/;

export function parseLogLine(line: string): { time: string; level: string; message: string } {
  const match = LINE.exec(line);
  return match ? { time: match[1], level: match[2], message: match[3] } : { time: "", level: "", message: line };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Steam's browser may refuse the async clipboard; fall back to a selection copy.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { return document.execCommand("copy"); } finally { area.remove(); }
  }
}

// The shared action log for every game, opened from the quick access panel.
export default function LogsPage() {
  const t = useTranslations();
  const [lines, setLines] = useState<string[]>();
  const load = () => getActionLog(LIMIT).then(result => setLines(result.lines ?? [])).catch(() => setLines([]));
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { void load(); }, []);
  // Open at the newest lines.
  useEffect(() => { scroller.current?.scrollTo(0, scroller.current.scrollHeight); }, [lines]);

  const back = () => { Navigation.NavigateBack(); Navigation.OpenQuickAccessMenu(QuickAccessTab.Decky); };
  const copy = async () => {
    const ok = await copyText((lines ?? []).join("\n"));
    toaster.toast({ title: "CreamDeck", body: ok ? t.copied : t.copyFailed, duration: 3000 });
  };
  const clear = async () => {
    const result = await clearActionLog().catch(() => ({ success: false }));
    if (result.success) toaster.toast({ title: "CreamDeck", body: t.cleared, duration: 3000 });
    await load();
  };

  return <div style={{ position: "absolute", inset: 0, paddingTop: PAGE_TOP_OFFSET, paddingBottom: PAGE_BOTTOM_OFFSET, boxSizing: "border-box",
    background: C.page, color: C.text, display: "flex" }}>
    <style>{STYLES}</style>
    <Focusable flow-children="column" onCancelButton={back} style={{ flex: "1 1 auto", minHeight: 0, boxSizing: "border-box",
      padding: "28px 48px 24px 48px", display: "flex", flexDirection: "column", gap: 18 }}>
      <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto" }}>
        <Button icon label={t.back} onClick={back}>{Icons.back()}</Button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.white }}>{t.logs}</h1>
        <span style={{ fontSize: 12, color: C.muted }}>{t.logsScope}</span>
        <div style={{ flex: "1 1 auto" }} />
        <Button onClick={() => { void copy(); }} disabled={!lines?.length}>{Icons.copy()}{t.copy}</Button>
        <Button onClick={() => { void clear(); }} disabled={!lines?.length}>{Icons.trash()}{t.clear}</Button>
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
        <div ref={scroller} style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", fontSize: 13, lineHeight: 1.75, fontFamily: C.mono,
          color: C.secondary, overflowWrap: "anywhere" }}>
          {lines?.length === 0 && <div style={{ color: C.muted }}>{t.logsEmpty}</div>}
          {lines?.map((line, index) => {
            const entry = parseLogLine(line);
            const color = entry.level === "WARNING" ? C.orange : entry.level === "ERROR" ? C.red : undefined;
            return <div key={index}>
              {entry.time && <span style={{ color: C.dim }}>{entry.time} </span>}
              <span style={color ? { color } : undefined}>{entry.level ? `${entry.level} ` : ""}{entry.message}</span>
            </div>;
          })}
        </div>
      </Focusable>
      <div style={{ fontSize: 12, color: C.dim, flex: "0 0 auto" }}>{t.logsHint}</div>
    </Focusable>
  </div>;
}
