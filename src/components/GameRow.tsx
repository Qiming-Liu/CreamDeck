import { DialogButton, Focusable } from "@decky/ui";
import type { CSSProperties, ReactNode } from "react";

export const buttonStyle: CSSProperties = {
  width: "auto", minWidth: 100, height: 40, padding: "0 14px", flex: "0 0 auto", fontSize: 14,
};
export const secondaryStyle: CSSProperties = { fontSize: 12, color: "#aeb7c5", marginTop: 4, overflowWrap: "anywhere" };

export function GameRow({ children, className }: { children: ReactNode; className?: string }) {
  return <Focusable className={className} flow-children="row" style={{ display: "flex", alignItems: "center", gap: 12,
    padding: "12px 14px", background: "#23262e", borderRadius: 2, marginBottom: 6 }}>{children}</Focusable>;
}

export function RowLabel({ children, description }: { children: ReactNode; description?: ReactNode }) {
  return <div style={{ flex: "1 1 0", minWidth: 0, fontSize: 16, overflowWrap: "anywhere" }}>
    {children}{description && <div style={secondaryStyle}>{description}</div>}
  </div>;
}

export function Help({ label, children, open, onToggle }: { label: string; children: ReactNode; open: boolean; onToggle: () => void }) {
  return <div style={{ margin: "8px 0 12px" }}>
    <DialogButton style={{ ...buttonStyle, width: "100%", textAlign: "left" }} onClick={onToggle}>{open ? "−" : "+"} {label}</DialogButton>
    {open && <div style={{ ...secondaryStyle, padding: "8px 14px", lineHeight: 1.6 }}>{children}</div>}
  </div>;
}
