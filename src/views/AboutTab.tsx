import { Focusable, ModalRoot, Navigation, showModal } from "@decky/ui";
import qrcode from "qrcode-generator";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { AVATAR } from "../assets/avatar";
import { LOGO } from "../assets/logo";
import { RECOMMENDED_LOGO } from "../assets/recommended";
import { Button, C, Icons, Main, SectionLabel, PageStyle, VersionLine } from "../components/ui";
import { readmeUrl } from "../domain/readme";
import { RELEASES_URL, REPOSITORY_URL, useUpdateInfo } from "../hooks/useUpdateInfo";
import { useLanguage, useTranslations } from "../utils/i18n";
import LogPanel from "./LogPanel";

const AUTHOR = "ProSS及时行乐";
const BILIBILI_URL = "https://space.bilibili.com/23706122";
const ISSUES_URL = `${REPOSITORY_URL}/-/issues/new`;
const RECOMMENDED = { name: "DeckyGCM", url: "https://gitlab.com/alan-liu/Decky-Game-Cheats-Manager#deckygcm" };
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
    "Attach: About > Logs > Export"].join("\n");
  return `${ISSUES_URL}?${new URLSearchParams({ "issue[description]": body })}`;
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
  const language = useLanguage();
  const english = language === "en";
  const feedback = feedbackUrl(version, update?.os ?? "", compatTool, appId);

  return <Main gap={16}>
    {/* One row of columns, so right from the author links reaches the right column. */}
    <Focusable flow-children="row" style={{ flex: "1 1 auto", minHeight: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 28 }}>
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
        <Focusable flow-children="row" style={{ boxSizing: "border-box", padding: "8px 12px", borderRadius: 4, background: C.well,
          display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto" }}>
          <img src={AVATAR} alt={t.avatar(AUTHOR)} style={{ width: 44, height: 44, flex: "0 0 44px", borderRadius: 22,
            objectFit: "cover", background: C.button }} />
          <div style={{ flex: "1 1 auto", minWidth: 0, fontSize: 18, fontWeight: 700, color: C.white,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{AUTHOR}</div>
          {!english && <Button icon label={t.bilibili} onClick={() => openLink(BILIBILI_URL)}>{Icons.bilibili()}</Button>}
          <Button icon label={t.gitlab} onClick={() => openLink(readmeUrl(REPOSITORY_URL, language))}>{Icons.gitlab()}</Button>
        </Focusable>

        <div style={row}>
          <img src={LOGO} alt="" width={40} height={40} style={{ flex: "0 0 40px", borderRadius: 8 }} />
          <RowText title="CreamDeck" description={t.deckyPlugin} />
          {version && <span aria-label={t.version} style={{ flex: "0 0 auto", fontSize: 12 }}>
            <VersionLine current={version} latest={update?.latest} label={t.latestVersion} onOpen={() => openLink(RELEASES_URL)} /></span>}
        </div>
        <Focusable flow-children="row" style={{ ...row, borderBottom: `1px solid ${C.line}` }}>
          <RowText title={t.feedback} description={t.feedbackDescription} />
          <LinkButton icon={Icons.gitlab()} onClick={() => showModal(<FeedbackModal url={feedback} />, window)}>{t.feedbackIssue}</LinkButton>
        </Focusable>

        <SectionLabel top={6}>{t.credits}</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto", borderBottom: `1px solid ${C.line}` }}>
          {CREDITS.map(credit => <div key={credit.name} style={row}>
            <RowText title={credit.name} />
            <span style={{ flex: "0 0 auto", fontSize: 12, color: C.muted }}>{credit.author}</span>
          </div>)}
        </div>

        <SectionLabel top={6}>{t.recommended}</SectionLabel>
        <Focusable className="cd-focus" onActivate={() => openLink(RECOMMENDED.url)} style={{ ...row, borderBottom: `1px solid ${C.line}` }}>
          <img src={RECOMMENDED_LOGO} alt="" width={36} height={36} style={{ flex: "0 0 36px", borderRadius: 6 }} />
          <RowText title={RECOMMENDED.name} description={t.gcmDescription} />
          <span style={{ flex: "0 0 auto", fontSize: 12, color: C.muted }}>{t.deckyPlugin}</span>
          {Icons.chevronRight()}
        </Focusable>
      </Focusable>

      {/* The log gets the whole right half. */}
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
          <SectionLabel>{t.logs}</SectionLabel>
          <LogPanel />
        </div>
      </Focusable>
    </Focusable>
  </Main>;
}

function LinkButton({ url, icon, onClick, children }: { url?: string; icon: ReactNode; onClick?: () => void; children: ReactNode }) {
  return <Button onClick={onClick ?? (() => url && openLink(url))} style={{ padding: "0 14px" }}>{icon}{children}</Button>;
}

// One list row of the left column; the padding shrinks on a short screen.
const row = { display: "flex", alignItems: "center", gap: 14, padding: "clamp(4px, 1.2vh, 11px) 14px",
  borderTop: `1px solid ${C.line}`, flex: "0 0 auto" } as const;

function RowText({ title, description }: { title: string; description?: string }) {
  return <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
    <span style={{ fontSize: 16, color: C.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
    {description && <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {description}</span>}
  </span>;
}
