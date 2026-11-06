import { DialogButton, Focusable } from "@decky/ui";
import type { CSSProperties, ReactNode } from "react";
import { pageWindow } from "../domain/display";

export const C = {
  text: "#dcdedf",
  white: "#ffffff",
  light: "#c7d5e0",
  secondary: "#a9b1b8",
  muted: "#8b929a",
  dim: "#6b7480",
  disabled: "#4d545e",
  blue: "#1a9fff",
  blueText: "#7cc4ff",
  green: "#8ee06f",
  greenDot: "#59bf40",
  orange: "#f5b942",
  red: "#ff9b9b",
  button: "#3d4450",
  line: "rgba(255,255,255,.08)",
  well: "rgba(0,0,0,.28)",
  page: "linear-gradient(180deg, #0e141b 0%, #151c24 100%)",
  mono: "ui-monospace, Menlo, Consolas, monospace",
};

// Buttons keep Steam's own focus and hover look: the custom colors only apply
// while the control is idle. Custom rows get a matching highlight.
export const STYLES = `
.cd-btn.DialogButton { width: auto !important; min-width: 0 !important; height: 40px !important; margin: 0 !important;
  padding: 0 16px !important; font-size: 14px !important; line-height: normal !important; border-radius: 3px;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; flex: 0 0 auto;
  box-sizing: border-box; }
.cd-btn.DialogButton:not(.gpfocus):not(:hover):not(:disabled) { background: ${C.button}; color: ${C.white}; }
.cd-btn.cd-primary.DialogButton { padding: 0 22px !important; font-weight: 500; }
.cd-btn.cd-primary.DialogButton:not(.gpfocus):not(:hover):not(:disabled) { background: ${C.blue}; }
.cd-btn.cd-ghost.DialogButton:not(.gpfocus):not(:hover):not(:disabled) { background: transparent; color: ${C.secondary}; }
.cd-btn.DialogButton:disabled { background: rgba(61,68,80,.5); color: ${C.dim}; }
.cd-btn.cd-small.DialogButton { height: 32px !important; padding: 0 12px !important; font-size: 13px !important; }
.cd-btn.cd-icon.DialogButton { width: 40px !important; padding: 0 !important; }
.cd-btn.cd-page.DialogButton { width: 40px !important; padding: 0 !important; }
.cd-btn.cd-page-current.DialogButton { font-weight: 700; }
.cd-btn.cd-page-marked.DialogButton:not(.gpfocus):not(:hover):not(:disabled) { background: rgba(26,159,255,.18);
  color: ${C.blueText}; box-shadow: inset 0 0 0 1px rgba(124,196,255,.5); }
.cd-btn.cd-page-marked.cd-page-current.DialogButton:not(.gpfocus):not(:hover):not(:disabled) { background: ${C.blue};
  color: ${C.white}; box-shadow: none; }
.cd-focus { outline: none; transition: background-color .12s; }
.cd-focus.gpfocus { background-color: rgba(255,255,255,.14) !important; }
.cd-tab.gpfocus { background-color: rgba(255,255,255,.2) !important; color: ${C.white} !important; }
.cd-search .DialogInputLabelGroup { margin: 0; }
.cd-search input.DialogInput { width: 240px; height: 40px; box-sizing: border-box; padding: 0 14px; font-size: 14px;
  border: 1px solid rgba(255,255,255,.14); border-radius: 3px; background: rgba(0,0,0,.35); color: ${C.white}; }
.cd-dropdown .DialogDropDown { min-width: 170px; height: 38px; padding: 0 12px 0 16px; font-size: 14px; }
`;

const svg = (children: ReactNode, size = 18, width = 2, extra?: CSSProperties) =>
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width}
    strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto", ...extra }}>{children}</svg>;

export const Icons = {
  list: () => svg(<path d="M4 6h16M4 12h16M4 18h16" />),
  sliders: () => svg(<><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="#0e141b" />
    <circle cx="15" cy="12" r="2" fill="#0e141b" /><circle cx="8" cy="17" r="2" fill="#0e141b" /></>),
  wrench: () => svg(<path d="M14 4a5 5 0 00-5 7l-6 6 2 2 6-6a5 5 0 007-5l-3 3-2-2 3-3z" />),
  info: () => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>),
  refresh: (color?: string) => svg(<><path d="M20 12a8 8 0 01-14 5M4 12a8 8 0 0114-5" /><path d="M18 3v4h-4M6 21v-4h4" /></>,
    18, 2.2, color ? { color } : undefined),
  lock: (size = 18) => svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0" /></>, size, 2.2),
  lockClosed: () => svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>, 16, 2.2),
  warn: () => svg(<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>, 18, 2.6),
  check: () => svg(<path d="M5 12l5 5 9-10" />, 18, 2.6),
  folder: (color: string) => svg(<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />, 18, 2.2, { color }),
  circleInfo: () => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.5" /></>, 14, 2),
  chevronLeft: () => svg(<path d="M15 5l-7 7 7 7" />, 16, 2.4),
  chevronRight: (color = C.muted, size = 14) => svg(<path d="M9 5l7 7-7 7" />, size, 2.2, { color }),
  chevronDown: () => svg(<path d="M6 9l6 6 6-6" />, 14, 2.4),
  arrowRight: (color = C.muted) => svg(<path d="M5 12h14M13 6l6 6-6 6" />, 12, 2.4, { color }),
  back: () => svg(<path d="M15 5l-7 7 7 7" />, 18, 2.4),
  copy: () => svg(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 012-2h9" /></>, 16),
  trash: () => svg(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />, 16),
  github: () => svg(<path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1-.3-3.3 1.3a11.4 11.4 0 00-6 0C7 2.8 6 3.1 6 3.1a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004.6 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />, 16),
  bilibili: () => svg(<><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M8 3l3 3M16 3l-3 3M9 12v2M15 12v2" /></>, 16),
  gamepad: () => svg(<><rect x="2" y="7" width="20" height="11" rx="5" /><path d="M7 11v3M5.5 12.5h3M16 11.5h.01M18 13.5h.01" /></>, 22),
  doc: () => svg(<><path d="M6 3h9l4 4v14H6z" /><path d="M9 11h7M9 15h7M9 19h4" /></>),
};

export function Switch({ on, mixed, disabled }: { on: boolean; mixed?: boolean; disabled?: boolean }) {
  const background = disabled ? "rgba(61,68,80,.5)" : mixed ? "rgba(26,159,255,.45)" : on ? C.blue : C.button;
  const knob: CSSProperties = mixed ? { left: 14 } : on ? { right: 3 } : { left: 3 };
  return <span aria-hidden="true" style={{ display: "inline-block", width: 46, height: 24, borderRadius: 12, background,
    position: "relative", flex: "0 0 46px" }}>
    <span style={{ position: "absolute", top: 3, width: 18, height: 18, borderRadius: 9, ...knob,
      background: disabled ? C.disabled : on || mixed ? C.white : C.muted }} />
  </span>;
}

export function Glyph({ letter, light }: { letter: string; light?: boolean }) {
  return <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 20, height: 20, borderRadius: 10, background: light ? "rgba(255,255,255,.92)" : C.secondary, color: "#0e141b",
    fontSize: 12, fontWeight: 700, flex: "0 0 20px" }}>{letter}</span>;
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  small?: boolean;
  icon?: boolean;
  label?: string;
  style?: CSSProperties;
  className?: string;
  current?: boolean;
};

export function Button({ children, onClick, disabled, variant = "secondary", small, icon, label, style, className, current }: ButtonProps) {
  const classes = ["cd-btn", variant === "primary" && "cd-primary", variant === "ghost" && "cd-ghost",
    small && "cd-small", icon && "cd-icon", className].filter(Boolean).join(" ");
  return <DialogButton className={classes} disabled={disabled} onClick={onClick} aria-label={label} style={style}
    aria-current={current ? "page" : undefined}>
    {children}
  </DialogButton>;
}

export function SectionLabel({ children, right, top = 2 }: { children: ReactNode; right?: ReactNode; top?: number }) {
  return <div style={{ fontSize: 12, color: C.muted, padding: `${top}px 4px 6px 4px`, fontWeight: 500,
    display: "flex", justifyContent: "space-between", gap: 12 }}><span>{children}</span>{right && <span>{right}</span>}</div>;
}

export function PageTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flex: "0 0 auto" }}>
    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.white }}>{children}</h1>
    {note && <span style={{ fontSize: 12, color: C.muted }}>{note}</span>}
  </div>;
}

export type Tone = "warn" | "info" | "plain" | "dark" | "ok";

export function toneStyle(tone: Tone): CSSProperties {
  switch (tone) {
    case "warn": return { background: "rgba(245,185,66,.1)", border: "1px solid rgba(245,185,66,.4)" };
    case "info": return { background: "rgba(26,159,255,.12)", border: "1px solid rgba(26,159,255,.45)" };
    case "ok": return { background: "rgba(89,191,64,.08)", border: "1px solid rgba(89,191,64,.35)" };
    case "plain": return { background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)" };
    default: return { background: "rgba(0,0,0,.35)" };
  }
}

// A status card with a round icon: the maintenance and unsupported headers.
export function StatusCard({ tone, icon, title, detail, children, align = "center" }: {
  tone: "warn" | "ok" | "plain"; icon: ReactNode; title: ReactNode; detail?: ReactNode; children?: ReactNode;
  align?: "center" | "flex-start";
}) {
  const badge = tone === "warn" ? { background: C.orange, color: "#0e141b" }
    : tone === "ok" ? { background: C.greenDot, color: "#0e141b" } : { background: C.button, color: C.white };
  return <section style={{ boxSizing: "border-box", padding: "16px 18px", borderRadius: 4, ...toneStyle(tone),
    display: "flex", alignItems: align, gap: 16, flex: "0 0 auto" }}>
    <span aria-hidden="true" style={{ display: "inline-flex", width: 36, height: 36, borderRadius: 18, ...badge,
      alignItems: "center", justifyContent: "center", flex: "0 0 36px" }}>{icon}</span>
    <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 17, color: C.white, fontWeight: 500 }}>{title}</div>
      {detail && <div style={{ fontSize: 12, color: tone === "warn" ? C.orange : tone === "ok" ? C.green : C.muted }}>{detail}</div>}
      {children}
    </div>
  </section>;
}

// The bottom bar of the DLC page: a summary on the left, actions on the right.
export function ActionBar({ tone, title, detail, detailColor, children }: {
  tone: Tone; title: ReactNode; detail?: ReactNode; detailColor?: string; children?: ReactNode;
}) {
  return <Focusable flow-children="row" style={{ boxSizing: "border-box", padding: "12px 16px", borderRadius: 4,
    ...toneStyle(tone), display: "flex", alignItems: "center", gap: 16, flex: "0 0 auto" }}>
    <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 14, color: C.white, fontWeight: 500 }}>{title}</div>
      {detail && <div style={{ fontSize: 12, color: detailColor ?? C.muted, whiteSpace: "nowrap", overflow: "hidden",
        textOverflow: "ellipsis" }}>{detail}</div>}
    </div>
    {children}
  </Focusable>;
}

export function Ellipsis({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...style }}>{children}</div>;
}

export function Dot({ color, hollow }: { color: string; hollow?: boolean }) {
  return <span aria-hidden="true" style={{ display: "inline-block", width: 7, height: 7, borderRadius: 4, boxSizing: "border-box",
    flex: "0 0 7px", ...(hollow ? { border: `1.5px solid ${color}` } : { background: color }) }} />;
}

// Carries its own keyframes: the plugin icon renders outside the plugin's pages.
const PULSE = "@keyframes cdPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(245,185,66,.55) } 50% { box-shadow: 0 0 0 6px rgba(245,185,66,0) } }"
  + " .cd-badge.gpfocus { background: #f5b942 !important; color: #0e141b !important; }";

export function PulseDot({ size = 7, ring }: { size?: number; ring?: string }) {
  return <>
    <style>{PULSE}</style>
    <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size, borderRadius: size,
      background: C.orange, boxSizing: "content-box", flex: `0 0 ${size}px`, animation: "cdPulse 1.6s ease-in-out infinite",
      ...(ring ? { border: `2px solid ${ring}` } : {}) }} />
  </>;
}

// "v1.0.5 → v1.0.6" with the newer version as a link badge.
export function VersionLine({ current, latest, onOpen, label, compact }: {
  current: string; latest: string | null | undefined; onOpen: () => void; label: (version: string) => string;
  // Only the new-version badge when there is one, for narrow places.
  compact?: boolean;
}) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 400, color: C.muted,
    letterSpacing: "normal", textTransform: "none" }}>
    {!(compact && latest) && <span>v{current}</span>}
    {latest && <>{!compact && Icons.arrowRight()}
      <Focusable className="cd-badge" onActivate={onOpen} aria-label={label(latest)}
        style={{ display: "inline-flex", alignItems: "center", height: 26, boxSizing: "border-box", padding: "0 9px",
          borderRadius: 3, background: "rgba(245,185,66,.16)", color: C.orange, fontSize: 12, fontWeight: 700, gap: 6 }}>
        <PulseDot />v{latest}
      </Focusable></>}
  </span>;
}

type PadProps = {
  onSecondaryButton?: () => void;
  onOptionsButton?: () => void;
  onSecondaryActionDescription?: ReactNode;
  onOptionsActionDescription?: ReactNode;
};

// Main column of a game page tab; X and Y act from anywhere inside it.
export function Main({ children, gap = 14, pad }: { children: ReactNode; gap?: number; pad?: PadProps }) {
  return <Focusable flow-children="column" {...pad} style={{ flex: "1 1 auto", minWidth: 0, minHeight: 0,
    boxSizing: "border-box", padding: "28px 40px 24px 32px", display: "flex", flexDirection: "column", gap,
    overflow: "hidden" }}>
    {children}
  </Focusable>;
}

// A full-width selectable row with a switch at the end; A toggles it.
export function SwitchRow({ title, meta, tag, on, mixed, disabled, onToggle, tinted, strong, first, last, label }: {
  title: ReactNode; meta?: ReactNode; tag?: ReactNode; on: boolean; mixed?: boolean; disabled?: boolean;
  onToggle: () => void; tinted?: boolean; strong?: boolean; first?: boolean; last?: boolean; label: string;
}) {
  return <Focusable className="cd-focus" role="switch" aria-checked={mixed ? "mixed" : on} aria-label={label}
    onActivate={() => { if (!disabled) onToggle(); }}
    style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", flex: "0 0 auto",
      borderTop: first ? undefined : `1px solid ${C.line}`, borderBottom: last ? `1px solid ${C.line}` : undefined,
      background: tinted ? "rgba(26,159,255,.07)" : undefined }}>
    <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
      <Ellipsis style={{ fontSize: 16, color: C.white, fontWeight: strong ? 500 : 400 }}>{title}</Ellipsis>
      {meta && <div style={{ fontSize: 12, color: C.muted }}>{meta}</div>}
    </div>
    {tag && <span style={{ fontSize: 12, color: C.blueText, padding: "3px 10px", borderRadius: 10,
      background: "rgba(26,159,255,.18)", whiteSpace: "nowrap" }}>{tag}</span>}
    <Switch on={on} mixed={mixed} disabled={disabled} />
  </Focusable>;
}

// Previous, page numbers and next. Marked pages hold something the user should not miss.
export function Pager({ pages, current, marked, onPage, labels }: {
  pages: number; current: number; marked: Set<number>; onPage: (page: number) => void;
  labels: { previous: string; next: string; page: (page: number) => string };
}) {
  if (pages <= 1) return null;
  return <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
    flex: "0 0 auto" }}>
    <Button icon label={labels.previous} disabled={current === 0} onClick={() => onPage(current - 1)}>{Icons.chevronLeft()}</Button>
    {pageWindow(pages, current).map(index => {
      const active = index === current, flagged = marked.has(index);
      return <Button key={index} label={labels.page(index + 1)} current={active} onClick={() => onPage(index)}
        variant={active || flagged ? "secondary" : "ghost"}
        className={["cd-page", active && "cd-page-current", flagged && "cd-page-marked"].filter(Boolean).join(" ")}>
        {index + 1}</Button>;
    })}
    <Button icon label={labels.next} disabled={current === pages - 1} onClick={() => onPage(current + 1)}>
      {Icons.chevronRight("currentColor", 16)}</Button>
  </Focusable>;
}
