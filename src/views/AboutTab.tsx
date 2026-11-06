import { Focusable, Navigation } from "@decky/ui";
import qrcode from "qrcode-generator";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { AVATAR } from "../assets/avatar";
import { Button, C, Icons, Main, PageTitle, SectionLabel, VersionLine } from "../components/ui";
import { RELEASES_URL, useUpdateInfo } from "../hooks/useUpdateInfo";
import { useTranslations } from "../utils/i18n";

const AUTHOR = "ProSS及时行乐";
const GITHUB_URL = "https://github.com/Qiming-Liu";
const BILIBILI_URL = "https://space.bilibili.com/23706122";
const ISSUES_URL = "https://github.com/Qiming-Liu/CreamDeck/issues/new";
const RECOMMENDED = { name: "DeckyGCM", url: "https://github.com/Qiming-Liu/Decky-Game-Cheats-Manager" };
const CREDITS = [
  { name: "CreamInstaller", url: "https://github.com/FroggMaster/CreamInstaller" },
  { name: "CreamAPI", note: "deadmau5" },
  { name: "SmokeAPI", note: "acidicoala", url: "https://github.com/acidicoala" },
];

// Steam's built-in browser; B returns to this page.
export const openLink = (url: string) => Navigation.NavigateToExternalWeb(url);

// A new-issue link with the plugin, system and game details filled in.
export function feedbackUrl(version: string, os: string, proton: string, appId: string): string {
  // Kept short: every character makes the on-screen QR code denser.
  const body = [`CreamDeck v${version}`, os || "unknown OS", proton || "no Proton", `AppID ${appId}`].join("\n");
  return `${ISSUES_URL}?${new URLSearchParams({ body })}`;
}

function QrCode({ text, label }: { text: string; label: string }) {
  const path = useMemo(() => {
    const code = qrcode(0, "L");
    code.addData(text, "Byte");
    code.make();
    const size = code.getModuleCount();
    let d = "";
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++)
        if (code.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    return { d, size };
  }, [text]);
  return <div role="img" aria-label={label} style={{ width: 88, height: 88, flex: "0 0 88px", boxSizing: "border-box",
    padding: 6, borderRadius: 4, background: C.white }}>
    <svg aria-hidden="true" width="76" height="76" viewBox={`0 0 ${path.size} ${path.size}`} shapeRendering="crispEdges">
      <path fill="#0e141b" d={path.d} />
    </svg>
  </div>;
}

export default function AboutTab({ appId, compatTool }: { appId: string; compatTool: string }) {
  const t = useTranslations();
  const update = useUpdateInfo();
  const version = update?.current ?? "";

  return <Main gap={16}>
    <PageTitle>{t.aboutTitle}</PageTitle>
    <div style={{ flex: "1 1 auto", minHeight: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 28 }}>
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 18, overflowY: "auto" }}>
        <section style={{ boxSizing: "border-box", padding: 18, borderRadius: 4, background: C.well, display: "flex",
          flexDirection: "column", gap: 16, flex: "0 0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img src={AVATAR} alt={t.avatar(AUTHOR)} style={{ width: 64, height: 64, flex: "0 0 64px", borderRadius: 32,
              objectFit: "cover", background: C.button }} />
            <div style={{ fontSize: 20, fontWeight: 700, color: C.white }}>{AUTHOR}</div>
          </div>
          <Focusable flow-children="row" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <LinkButton url={GITHUB_URL} icon={Icons.github()}>{t.github}</LinkButton>
            <LinkButton url={BILIBILI_URL} icon={Icons.bilibili()}>{t.bilibili}</LinkButton>
          </Focusable>
        </section>

        <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto" }}>
          <SectionLabel>{t.plugin}</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px",
            borderTop: `1px solid ${C.line}`, fontSize: 14 }}>
            <span style={{ color: C.white }}>{t.version}</span>
            {version && <VersionLine current={version} latest={update?.latest} label={t.latestVersion}
              onOpen={() => openLink(RELEASES_URL)} />}
          </div>
          <Focusable className="cd-focus" onActivate={() => openLink(feedbackUrl(version, update?.os ?? "", compatTool, appId))}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: `1px solid ${C.line}`,
              borderBottom: `1px solid ${C.line}` }}>
            <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14, color: C.white }}>{t.feedback}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{t.feedbackDescription}</span>
            </div>
            <QrCode label={t.feedbackQr} text={feedbackUrl(version, update?.os ?? "", compatTool, appId)} />
          </Focusable>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto" }}>
          <SectionLabel>{t.credits}</SectionLabel>
          {CREDITS.map((credit, index) => {
            const style = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px",
              borderTop: `1px solid ${C.line}`, borderBottom: index === CREDITS.length - 1 ? `1px solid ${C.line}` : undefined,
              fontSize: 14 } as const;
            const body = <><span style={{ color: C.white }}>{credit.name}</span>
              <span style={{ color: C.muted }}>{credit.note ?? t.creamInstallerNote}</span></>;
            return credit.url ? <Focusable key={credit.name} className="cd-focus" style={style}
              onActivate={() => openLink(credit.url!)}>{body}</Focusable> : <div key={credit.name} style={style}>{body}</div>;
          })}
        </div>
      </Focusable>

      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <SectionLabel>{t.recommended}</SectionLabel>
        <Focusable className="cd-focus" onActivate={() => openLink(RECOMMENDED.url)} style={{ display: "flex",
          alignItems: "center", gap: 14, padding: "12px 14px", borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
          <span aria-hidden="true" style={{ display: "inline-flex", width: 44, height: 44, flex: "0 0 44px", borderRadius: 6,
            background: "rgba(26,159,255,.18)", color: C.blueText, alignItems: "center", justifyContent: "center" }}>{Icons.gamepad()}</span>
          <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 16, color: C.white }}>{RECOMMENDED.name}</span>
            <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {t.gcmDescription}</span>
          </span>
          <span style={{ flex: "0 0 auto", fontSize: 12, color: C.muted }}>{t.deckyPlugin}</span>
          {Icons.chevronRight()}
        </Focusable>
        <div style={{ flex: "1 1 auto" }} />
        <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>{t.linksNote}</div>
      </Focusable>
    </div>
  </Main>;
}

function LinkButton({ url, icon, children }: { url: string; icon: ReactNode; children: ReactNode }) {
  return <Button onClick={() => openLink(url)} style={{ padding: "0 14px" }}>{icon}{children}</Button>;
}
