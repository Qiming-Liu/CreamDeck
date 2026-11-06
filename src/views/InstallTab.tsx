import { DialogButton, Dropdown, Focusable, ModalRoot, TextField } from "@decky/ui";
import { useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Button, C, Icons, Main, PageTitle, SectionLabel, STYLES, Switch, toneStyle } from "../components/ui";
import { Configuration, proxyChoices, selectUnlocker } from "../domain/gamePage";
import { apiDll, splitOwnedOverride, targetBits } from "../domain/display";
import type { LaunchState } from "../hooks/useWineDllOverride";
import type { GamePage } from "../utils/backend";
import { useTranslations } from "../utils/i18n";
import type { Tab } from "./CreamDeckPage";

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
  const root = !page.target_directory || page.target_directory === ".";
  const choices = proxyChoices(draft.unlocker);

  return <Main gap={14}>
    <PageTitle note={installed ? t.installLocked : undefined}>{t.tabInstall}</PageTitle>

    {locked && <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
      borderRadius: 4, background: "rgba(245,185,66,.1)", border: "1px solid rgba(245,185,66,.35)", fontSize: 13,
      color: C.orange, flex: "0 0 auto" }}>
      {Icons.lockClosed()}
      <span style={{ flex: "1 1 auto" }}>{installed ? t.lockedBanner : t.externalBanner}</span>
      <Button small onClick={() => onTab("maintenance")}>{t.goToMaintenance}</Button>
    </Focusable>}

    <Focusable flow-children="column" style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column",
      gap: 4, overflowY: "auto" }}>
      <SectionLabel>{t.location}</SectionLabel>
      <Row last>
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 16, color: C.white, fontFamily: C.mono, overflowWrap: "anywhere" }}>{page.target_directory ?? "."}
            {root && <span style={{ fontFamily: "inherit", color: C.muted, fontSize: 13 }}> {t.gameRootParen}</span>}</div>
          <div style={{ fontSize: 12, color: found ? C.green : C.orange }}>
            {found ? t.detection(apiDll(page), targetBits(page), others) : t.notDetected}</div>
        </div>
        <Button onClick={onChooseLocation} disabled={frozen} style={{ height: 38 }}>{t.change}</Button>
      </Row>

      <SectionLabel top={14}>{t.unlocker}</SectionLabel>
      <Choices label={t.unlocker} disabled={frozen} value={draft.unlocker}
        onChange={value => setDraft(previous => selectUnlocker(previous, value))}
        options={[{ value: "creamapi", title: "CreamAPI", note: t.defaultTag },
          { value: "smokeapi", title: "SmokeAPI", note: t.optionalTag }]} />

      <SectionLabel top={14}>{t.method}</SectionLabel>
      <Choices label={t.method} disabled={frozen || choices.length === 0} value={draft.proxy ? "proxy" : "direct"}
        onChange={value => setDraft(previous => ({ ...previous, proxy: value === "proxy" }))}
        options={[{ value: "direct", title: t.direct, note: t.directDescription },
          { value: "proxy", title: t.proxy, note: t.proxyDescription }]} />

      <div style={{ height: 10, flex: "0 0 auto" }} />
      <Row dim={!draft.proxy}>
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 16, color: C.white }}>{t.proxyFile}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{t.proxyFileDescription}</div>
        </div>
        <div className="cd-dropdown"><Dropdown disabled={frozen || !draft.proxy} selectedOption={draft.proxyDll}
          rgOptions={(choices.length ? choices : ["version"]).map(name => ({ data: name, label: `${name}.dll` }))}
          onChange={option => setDraft(previous => ({ ...previous, proxyDll: option.data }))} /></div>
      </Row>
      <LaunchRow launch={launch} proxy={draft.proxy} dll={draft.proxyDll} disabled={disabled} />
    </Focusable>
  </Main>;
}

function Row({ children, last, dim }: { children: ReactNode; last?: boolean; dim?: boolean }) {
  return <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px",
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
      const style = { boxSizing: "border-box", padding: "12px 14px", borderRadius: 4, display: "flex", gap: 12,
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
  const code = <div style={{ fontSize: 12, color: C.text, fontFamily: C.mono }}>{`WINEDLLOVERRIDES="${dll}=n,b"`}</div>;
  const title = <div style={{ fontSize: 16, color: C.white }}>{t.launchOption}</div>;
  const warn = { borderRadius: 4, ...toneStyle("warn"), borderTop: undefined } as const;

  if (proxy && launch.error === "unsupported") {
    return <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px",
      flex: "0 0 auto", ...warn }}>
      <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {title}<div style={{ fontSize: 12, color: C.orange }}>{t.launchUnreadable}</div>{code}
      </div>
      <Switch on={false} disabled />
    </Focusable>;
  }
  if (proxy && (launch.error === "write" || launch.error === "read")) {
    return <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px",
      flex: "0 0 auto", ...warn }}>
      <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {title}<div style={{ fontSize: 12, color: C.orange }}>{launch.error === "write" ? t.launchWriteFailed : t.launchReadFailed}</div>
      </div>
      <Button onClick={launch.retry} disabled={disabled || launch.saving} style={{ height: 36 }}>{t.retry}</Button>
    </Focusable>;
  }

  const options = launch.options ?? "";
  const parts = proxy && launch.enabled ? splitOwnedOverride(options, dll) : null;
  const received = launch.loading ? t.launchReading : !options.trim() ? t.launchEmpty
    : parts ? <>{parts[0]}<span style={{ color: C.blueText, background: "rgba(26,159,255,.16)", borderRadius: 2 }}>{parts[1]}</span>{parts[2]}</>
    : options;
  const active = proxy && !launch.loading && launch.editable;
  const body = <>
    <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
      {title}
      {proxy ? <>
        <div style={{ fontSize: 12, lineHeight: 1.6, fontFamily: C.mono, overflowWrap: "anywhere", color: C.secondary }}>{received}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{t.steamReceived} · <span style={{ color: C.blueText }}>{t.ownedLegendBlue}</span> {t.ownedLegend}</div>
      </> : <div style={{ fontSize: 12, color: C.muted }}>{t.launchDirect}</div>}
    </div>
    {proxy && !launch.loading && <span style={{ fontSize: 12, color: launch.enabled ? C.green : C.muted, whiteSpace: "nowrap" }}>
      {launch.saving ? t.working : launch.enabled ? t.launchWritten : t.launchNotSet}</span>}
    <Switch on={proxy && launch.enabled} disabled={!active || disabled} />
  </>;
  const style = { display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", flex: "0 0 auto",
    borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, opacity: proxy ? 1 : .5 } as const;
  if (!active) return <div style={style}>{body}</div>;
  return <Focusable className="cd-focus" role="switch" aria-checked={launch.enabled} aria-label={t.launchOption} style={style}
    onActivate={() => { if (!disabled && !launch.saving) void launch.toggle(!launch.enabled); }}>{body}</Focusable>;
}

// Choose the folder that holds steam_api(64).dll: a detected one or a typed path.
export function LocationModal({ page, onChoose, closeModal }: { page: GamePage; onChoose: (directory: string) => void; closeModal?: () => void }) {
  const t = useTranslations();
  const [typed, setTyped] = useState(page.target_directory ?? ".");
  const choose = (directory: string) => { closeModal?.(); onChoose(directory); };
  const detected = (page.targets ?? []).filter(target => target.detected);
  return <ModalRoot closeModal={closeModal}>
    <style>{STYLES}</style>
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 520 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, color: C.white }}>{t.chooseLocation}</h2>
      {detected.length > 0 && <SectionLabel>{t.detectedLocations}</SectionLabel>}
      {detected.map(target => <DialogButton key={target.path} onClick={() => choose(target.path)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, textAlign: "left" }}>
        <span style={{ fontFamily: C.mono }}>{target.path === "." ? `. ${t.gameRootParen}` : target.path}</span>
        <span style={{ fontSize: 12, opacity: .8 }}>{t.bits(target.bitness)}</span>
      </DialogButton>)}
      <SectionLabel top={8}>{t.otherLocation}</SectionLabel>
      <TextField description={t.otherLocationHint} value={typed} onChange={event => setTyped(event.target.value)} />
      <Focusable flow-children="row" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Button variant="ghost" onClick={() => closeModal?.()}>{t.cancel}</Button>
        <Button variant="primary" disabled={!typed.trim()} onClick={() => choose(typed.trim())}>{t.use}</Button>
      </Focusable>
    </div>
  </ModalRoot>;
}
