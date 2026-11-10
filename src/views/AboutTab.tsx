import { Focusable, ModalRoot, Navigation, showModal } from "@decky/ui";
import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { PiHandTapFill } from "react-icons/pi";
import type { ReactNode } from "react";
import { AVATAR } from "../assets/avatar";
import { Button, C, Icons, Main, PageTitle, SectionLabel, PageStyle, VersionLine } from "../components/ui";
import { RELEASES_URL, useUpdateInfo } from "../hooks/useUpdateInfo";
import { useLanguage, useTranslations } from "../utils/i18n";

const AUTHOR = "ProSS及时行乐";
const GITHUB_URL = "https://github.com/Qiming-Liu/CreamDeck#creamdeck";
const BILIBILI_URL = "https://space.bilibili.com/23706122";
const ISSUES_URL = "https://github.com/Qiming-Liu/CreamDeck/issues/new";
const RECOMMENDED = { name: "DeckyGCM", url: "https://github.com/Qiming-Liu/Decky-Game-Cheats-Manager#deckygcm" };
const CREDITS = [
  { name: "CreamInstaller", author: "FroggMaster" },
  { name: "CreamAPI", author: "deadmau5" },
  { name: "SmokeAPI", author: "acidicoala" },
];

// Steam's built-in browser; B returns to this page.
export const openLink = (url: string) => Navigation.NavigateToExternalWeb(url);

// A new-issue link with the plugin, system and game details filled in.
export function feedbackUrl(version: string, os: string, proton: string, appId: string): string {
  // Kept short: every character makes the on-screen QR code denser.
  const body = [`CreamDeck v${version}`, os || "unknown OS", proton || "no Proton", `AppID ${appId}`,
    "Attach: Logs > Export"].join("\n");
  return `${ISSUES_URL}?${new URLSearchParams({ body })}`;
}

function QrCode({ text, label, size = 220 }: { text: string; label: string; size?: number }) {
  const path = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(text, "Byte");
    code.make();
    const size = code.getModuleCount();
    let d = "";
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++)
        if (code.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    return { d, size };
  }, [text]);
  return <div role="img" aria-label={label} style={{ flex: "0 0 auto", padding: 8, borderRadius: 4, background: C.white, lineHeight: 0 }}>
    <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${path.size} ${path.size}`} shapeRendering="crispEdges">
      <path fill="#0e141b" d={path.d} />
    </svg>
  </div>;
}

// The issue QR code at a size a phone reads easily, plus the same link in Steam's browser.
function FeedbackModal({ url, closeModal }: { url: string; closeModal?: () => void }) {
  const t = useTranslations();
  return <ModalRoot closeModal={closeModal} className="cd-font">
    <PageStyle />
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.white }}>{t.feedbackIssue}</div>
      <QrCode text={url} label={t.feedbackQr} />
      <div style={{ fontSize: 13, color: C.muted }}>{t.feedbackScan} · {t.feedbackDescription}</div>
      <Focusable flow-children="row" style={{ display: "flex", gap: 8, paddingTop: 4 }}>
        <Button onClick={() => { openLink(url); closeModal?.(); }}>{t.openInBrowser}</Button>
        <Button variant="primary" style={{ padding: "0 22px" }} onClick={() => closeModal?.()}>{t.close}</Button>
      </Focusable>
    </div>
  </ModalRoot>;
}

export default function AboutTab({ appId, compatTool }: { appId: string; compatTool: string }) {
  const t = useTranslations();
  const update = useUpdateInfo();
  const version = update?.current ?? "";
  const english = useLanguage() === "en";
  const feedback = feedbackUrl(version, update?.os ?? "", compatTool, appId);

  return <Main gap={16}>
    <PageTitle>{t.aboutTitle}</PageTitle>
    {/* One row of columns, so right from the author links reaches the right column. */}
    <Focusable flow-children="row" style={{ flex: "1 1 auto", minHeight: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 28 }}>
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 18, overflowY: "auto" }}>
        <Focusable flow-children="row" style={{ boxSizing: "border-box", padding: "10px 12px", borderRadius: 4, background: C.well,
          display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto" }}>
          <img src={AVATAR} alt={t.avatar(AUTHOR)} style={{ width: 44, height: 44, flex: "0 0 44px", borderRadius: 22,
            objectFit: "cover", background: C.button }} />
          <div style={{ flex: "1 1 auto", minWidth: 0, fontSize: 18, fontWeight: 700, color: C.white,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{AUTHOR}</div>
          {!english && <Button icon label={t.bilibili} onClick={() => openLink(BILIBILI_URL)}>{Icons.bilibili()}</Button>}
          <Button icon label={t.github} onClick={() => openLink(GITHUB_URL)}>{Icons.github()}</Button>
        </Focusable>

        <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto" }}>
          <SectionLabel>{t.plugin}</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px",
            borderTop: `1px solid ${C.line}`, fontSize: 14 }}>
            <span style={{ color: C.white }}>{t.version}</span>
            {version && <VersionLine current={version} latest={update?.latest} label={t.latestVersion}
              onOpen={() => openLink(RELEASES_URL)} />}
          </div>
          <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
            borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
            <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14, color: C.white }}>{t.feedback}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{t.feedbackDescription}</span>
            </div>
            <LinkButton icon={Icons.github()} onClick={() => showModal(<FeedbackModal url={feedback} />, window)}>{t.feedbackIssue}</LinkButton>
          </Focusable>
        </div>
      </Focusable>

      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto" }}>
          <SectionLabel>{t.credits}</SectionLabel>
          {CREDITS.map((credit, index) => {
            const style = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px",
              borderTop: `1px solid ${C.line}`, borderBottom: index === CREDITS.length - 1 ? `1px solid ${C.line}` : undefined,
              fontSize: 14 } as const;
            return <div key={credit.name} style={style}>
              <span style={{ color: C.white }}>{credit.name}</span>
              <span style={{ color: C.muted }}>{credit.author}</span>
            </div>;
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto" }}>
          <SectionLabel>{t.recommended}</SectionLabel>
          <Focusable className="cd-focus" onActivate={() => openLink(RECOMMENDED.url)} style={{ display: "flex",
            alignItems: "center", gap: 14, padding: "12px 14px", borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
            <span aria-hidden="true" style={{ display: "inline-flex", width: 44, height: 44, flex: "0 0 44px", borderRadius: 6,
              background: "rgba(26,159,255,.18)", color: C.blueText, alignItems: "center", justifyContent: "center" }}><PiHandTapFill size={22} /></span>
            <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 16, color: C.white }}>{RECOMMENDED.name}</span>
              <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.gcmDescription}</span>
            </span>
            <span style={{ flex: "0 0 auto", fontSize: 12, color: C.muted }}>{t.deckyPlugin}</span>
            {Icons.chevronRight()}
          </Focusable>
        </div>
      </Focusable>
    </Focusable>
  </Main>;
}

function LinkButton({ url, icon, onClick, children }: { url?: string; icon: ReactNode; onClick?: () => void; children: ReactNode }) {
  return <Button onClick={onClick ?? (() => url && openLink(url))} style={{ padding: "0 14px" }}>{icon}{children}</Button>;
}
