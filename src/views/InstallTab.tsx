import { openFilePicker } from "@decky/api";
import type { FileSelectionType } from "@decky/api";
import { DialogButton, Dropdown, Focusable, ModalRoot } from "@decky/ui";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Button, C, fluid, Icons, Main, PageTitle, SectionLabel, PageStyle, Switch, toneStyle } from "../components/ui";
import { Configuration, proxyChoices, selectUnlocker } from "../domain/gamePage";
import { apiDll, targetBits } from "../domain/display";
import type { LaunchState } from "../hooks/useWineDllOverride";
import type { GamePage } from "../utils/backend";
import { useTranslations } from "../utils/i18n";
import type { Tab } from "./CreamDeckPage";

// FileSelectionType is a declared const enum, so its value cannot be imported.
const FOLDER = 1 as FileSelectionType;

// Spacing shrinks on short screens so every option fits without scrolling.
const ROW_PAD = `${fluid(6, 11)} 14px`;
const SECTION_TOP = fluid(6, 14);

interface Props {
  page: GamePage;
  draft: Configuration;
  setDraft: Dispatch<SetStateAction<Configuration>>;
  disabled: boolean;
  launch: LaunchState;
  onChooseLocation: () => void;
  onTab: (tab: Tab) => void;
}

export default function InstallTab({ page, draft, setDraft, disabled, launch, onChooseLocation, onTab }: Props) {
  const t = useTranslations();
  const installed = !!page.installed;
  const external = page.file_status === "external";
  const locked = installed || external;
  const frozen = locked || disabled;
  const found = (page.api_dlls?.length ?? 0) > 0;
  const others = (page.targets ?? []).filter(target => target.detected && target.path !== (page.target_directory ?? ".")).length;
  const choices = proxyChoices(draft.unlocker);

  return <Main gap={fluid(8, 14)} padding={`${fluid(14, 28)} 40px ${fluid(10, 24)} 32px`}>
    <PageTitle>{t.tabInstall}</PageTitle>

    <Focusable flow-children="column" style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column",
      gap: 4, overflowY: "auto" }}>
      {locked && <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
      borderRadius: 4, background: "rgba(245,185,66,.1)", border: "1px solid rgba(245,185,66,.35)", fontSize: 13,
      color: C.orange, flex: "0 0 auto", marginBottom: SECTION_TOP }}>
        {Icons.lockClosed()}
        <span style={{ flex: "1 1 auto" }}>{installed ? t.lockedBanner : t.externalBanner}</span>
        <Button small onClick={() => onTab("maintenance")}>{t.goToMaintenance}</Button>
      </Focusable>}
      <SectionLabel bottom={fluid(4, 6)}>{t.location}</SectionLabel>
      <Row last>
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 16, color: C.white, overflowWrap: "anywhere" }}><TargetPath path={page.target_directory} /></div>
          <div style={{ fontSize: 12, color: found ? C.green : C.orange }}>
            {found ? t.detection(apiDll(page), targetBits(page), others) : t.notDetected}</div>
        </div>
        <Button onClick={onChooseLocation} disabled={frozen} style={{ height: fluid(32, 38) }}>{t.change}</Button>
      </Row>

      <SectionLabel top={SECTION_TOP} bottom={fluid(4, 6)}>{t.unlocker}</SectionLabel>
      <Choices label={t.unlocker} disabled={frozen} value={draft.unlocker}
        onChange={value => setDraft(previous => selectUnlocker(previous, value))}
        options={[{ value: "creamapi", title: "CreamAPI", note: t.defaultTag },
          { value: "smokeapi", title: "SmokeAPI", note: t.optionalTag }]} />

      <SectionLabel top={SECTION_TOP} bottom={fluid(4, 6)}>{t.method}</SectionLabel>
      <Choices label={t.method} disabled={frozen || choices.length === 0} value={draft.proxy ? "proxy" : "direct"}
        onChange={value => setDraft(previous => ({ ...previous, proxy: value === "proxy" }))}
        options={[{ value: "direct", title: t.direct, note: t.directDescription },
          { value: "proxy", title: t.proxy, note: t.proxyDescription }]} />

      <div style={{ height: fluid(4, 10), flex: "0 0 auto" }} />
      <Row dim={!draft.proxy}>
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 16, color: C.white }}>{t.proxyFile}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{t.proxyFileDescription}</div>
        </div>
        <div className="cd-dropdown"><Dropdown disabled={frozen || !draft.proxy} focusable={!frozen && draft.proxy} selectedOption={draft.proxyDll}
          rgOptions={(choices.length ? choices : ["version"]).map(name => ({ data: name, label: `${name}.dll` }))}
          onChange={option => setDraft(previous => ({ ...previous, proxyDll: option.data }))} /></div>
      </Row>
      <LaunchRow launch={launch} proxy={draft.proxy} dll={draft.proxyDll} disabled={disabled} />
    </Focusable>
  </Main>;
}

// An install folder relative to the game: "." carries a note that it is the game root.
export function TargetPath({ path }: { path?: string }) {
  const t = useTranslations();
  const value = path || ".";
  return <><span style={{ fontFamily: C.mono }}>{value}</span>
    {value === "." && <span style={{ color: C.muted, fontSize: ".85em" }}>{t.gameRootParen}</span>}</>;
}

function Row({ children, last, dim }: { children: ReactNode; last?: boolean; dim?: boolean }) {
  return <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 14, padding: ROW_PAD,
    borderTop: `1px solid ${C.line}`, borderBottom: last ? `1px solid ${C.line}` : undefined, flex: "0 0 auto",
    opacity: dim ? .5 : 1 }}>{children}</Focusable>;
}

function Choices({ label, options, value, onChange, disabled }: {
  label: string; options: { value: string; title: string; note: string }[]; value: string;
  onChange: (value: string) => void; disabled: boolean;
}) {
  return <Focusable flow-children="row" role="radiogroup" aria-label={label} style={{ display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, flex: "0 0 auto" }}>
    {options.map(option => {
      const checked = option.value === value;
      const body = <>
        <span aria-hidden="true" style={{ display: "inline-block", width: 18, height: 18, borderRadius: 9, boxSizing: "border-box",
          border: `2px solid ${checked ? C.blue : C.dim}`, flex: "0 0 18px", marginTop: 2, position: "relative" }}>
          {checked && <span style={{ position: "absolute", inset: 3, borderRadius: 6, background: C.blue }} />}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 16, color: C.white }}>{option.title}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{option.note}</div>
        </div></>;
      const style = { boxSizing: "border-box", padding: `${fluid(7, 12)} 14px`, borderRadius: 4, display: "flex", gap: 12,
        border: `1px solid ${checked ? "rgba(26,159,255,.6)" : "rgba(255,255,255,.1)"}`,
        background: checked ? "rgba(26,159,255,.1)" : "rgba(255,255,255,.03)",
        opacity: disabled && !checked ? .6 : 1 } as const;
      if (disabled) return <div key={option.value} role="radio" aria-checked={checked} aria-disabled="true" style={style}>{body}</div>;
      return <Focusable key={option.value} className="cd-focus" role="radio" aria-checked={checked} style={style}
        onActivate={() => onChange(option.value)}>{body}</Focusable>;
    })}
  </Focusable>;
}

function LaunchRow({ launch, proxy, dll, disabled }: { launch: LaunchState; proxy: boolean; dll: string; disabled: boolean }) {
  const t = useTranslations();
  const code = <div style={{ fontSize: 12, color: C.muted, fontFamily: C.mono }}>{`WINEDLLOVERRIDES='${dll}=n,b'`}</div>;
  const title = <div style={{ fontSize: 16, color: C.white }}>{t.launchOption}</div>;
  const warn = { borderRadius: 4, ...toneStyle("warn"), borderTop: undefined } as const;

  if (proxy && launch.error === "unsupported") {
    return <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 14, padding: ROW_PAD,
      flex: "0 0 auto", ...warn }}>
      <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {title}<div style={{ fontSize: 12, color: C.orange }}>{t.launchUnreadable}</div>{code}
      </div>
      <Switch on={false} disabled />
    </Focusable>;
  }
  if (proxy && (launch.error === "write" || launch.error === "read")) {
    return <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 14, padding: ROW_PAD,
      flex: "0 0 auto", ...warn }}>
      <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {title}<div style={{ fontSize: 12, color: C.orange }}>{launch.error === "write" ? t.launchWriteFailed : t.launchReadFailed}</div>
      </div>
      <Button onClick={launch.retry} disabled={disabled || launch.saving} style={{ height: 36 }}>{t.retry}</Button>
    </Focusable>;
  }

  const active = proxy && !launch.loading && launch.editable;
  const body = <>
    <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
      {title}
      {/* Only the words this plugin adds; the rest of the launch options belong to others. */}
      {!proxy ? <div style={{ fontSize: 12, color: C.muted }}>{t.launchDirect}</div>
        : launch.loading ? <div style={{ fontSize: 12, color: C.muted }}>{t.launchReading}</div> : code}
    </div>
    {proxy && !launch.loading && <span style={{ fontSize: 12, color: launch.enabled ? C.green : C.muted, whiteSpace: "nowrap" }}>
      {launch.saving ? t.working : launch.enabled ? t.launchWritten : t.launchNotSet}</span>}
    <Switch on={proxy && launch.enabled} disabled={!active || disabled} />
  </>;
  const style = { display: "flex", alignItems: "center", gap: 14, padding: ROW_PAD, flex: "0 0 auto",
    borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, opacity: proxy ? 1 : .5 } as const;
  // Still focusable while it cannot be switched, so the controller scrolls it into view.
  if (!active) return <Focusable className="cd-focus" aria-disabled="true" style={style} onActivate={() => {}}>{body}</Focusable>;
  return <Focusable className="cd-focus" role="switch" aria-checked={launch.enabled} aria-label={t.launchOption} style={style}
    onActivate={() => { if (!disabled && !launch.saving) void launch.toggle(!launch.enabled); }}>{body}</Focusable>;
}

// Choose the folder that holds steam_api(64).dll: a detected one or one picked in Decky's folder browser.
export function LocationModal({ page, onChoose, closeModal }: { page: GamePage; onChoose: (directory: string) => void; closeModal?: () => void }) {
  const t = useTranslations();
  const choose = (directory: string) => { closeModal?.(); onChoose(directory); };
  const detected = (page.targets ?? []).filter(target => target.detected);
  const browse = async () => {
    if (!page.game_directory) return;
    // The backend accepts any absolute path inside the game installation.
    const start = page.target_directory && page.target_directory !== "."
      ? `${page.game_directory}/${page.target_directory}` : page.game_directory;
    try {
      const picked = await openFilePicker(FOLDER, start, false, true);
      choose(picked.realpath || picked.path);
    } catch {
      // Closing the picker is not an error.
    }
  };
  return <ModalRoot closeModal={closeModal} className="cd-font">
    <PageStyle />
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 520 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, color: C.white }}>{t.chooseLocation}</h2>
      {detected.length > 0 && <SectionLabel>{t.detectedLocations}</SectionLabel>}
      {detected.map(target => <DialogButton key={target.path} onClick={() => choose(target.path)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, textAlign: "left" }}>
        <span><TargetPath path={target.path} /></span>
        <span style={{ fontSize: 12, opacity: .8 }}>{t.bits(target.bitness)}</span>
      </DialogButton>)}
      <SectionLabel top={8}>{t.otherLocation}</SectionLabel>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{t.otherLocationHint}</div>
      <Focusable flow-children="row" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Button variant="primary" disabled={!page.game_directory} onClick={() => { void browse(); }}>{t.browse}</Button>
        <div style={{ flex: "1 1 auto" }} />
        <Button variant="ghost" onClick={() => closeModal?.()}>{t.cancel}</Button>
      </Focusable>
    </div>
  </ModalRoot>;
}
