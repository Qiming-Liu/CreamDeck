import { toaster } from "@decky/api";
import { ConfirmModal, Focusable, showModal, Spinner } from "@decky/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import { C, Dot, Icons, PulseDot, STYLES } from "../components/ui";
import { applicableIds } from "../domain/gamePage";
import { unlockerLabel } from "../domain/display";
import { useGamePage } from "../hooks/useGamePage";
import { useUpdateInfo } from "../hooks/useUpdateInfo";
import { useAppDetails, useWineDllOverride } from "../hooks/useWineDllOverride";
import { installDlcUnlocker, uninstallDlcUnlocker } from "../utils/backend";
import { useTranslations } from "../utils/i18n";
import AboutTab from "./AboutTab";
import DlcTab from "./DlcTab";
import InstallTab, { LocationModal } from "./InstallTab";
import MaintenanceTab from "./MaintenanceTab";
import UnsupportedTab from "./UnsupportedTab";

// Big Picture draws its status bar over the top of full-page routes.
export const PAGE_TOP_OFFSET = 40;
// ...and its button legend over the bottom.
export const PAGE_BOTTOM_OFFSET = 42;

export type Tab = "dlc" | "install" | "maintenance" | "about";
const TABS: Tab[] = ["dlc", "install", "maintenance", "about"];

function initialTab(): Tab {
  const suffix = window.location.pathname.match(/\/creamdeck\/\d+\/(\w+)/)?.[1];
  return TABS.includes(suffix as Tab) ? suffix as Tab : "dlc";
}

export default function CreamDeckPage() {
  const t = useTranslations();
  const appId = window.location.pathname.match(/\/creamdeck\/(\d+)/)?.[1] ?? null;
  const game = useGamePage(appId, t.operationError);
  const { page, draft, loading, busy, needsRefresh } = game;
  const details = useAppDetails(Number(appId));
  const update = useUpdateInfo();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [launchBusy, setLaunchBusy] = useState(false);
  const launch = useWineDllOverride(Number(appId), draft.proxyDll, !!page?.found && draft.proxy, details, setLaunchBusy);
  const installed = !!page?.installed;
  const status = page?.file_status;
  // Decided by the game's current compatibility tool, not by its platforms.
  const unsupported = details.compatTool === "";
  const blocked = busy || launchBusy || loading || needsRefresh;
  const name = page?.name || "";

  const notify = (title: string, body: string) => toaster.toast({ title, body, duration: 5000 });

  const install = async () => {
    if (!appId || !page?.found || blocked) return;
    const ids = applicableIds(page.dlcs ?? [], draft.enabledIds);
    const wasInstalled = installed;
    const outcome = await game.action(() => installDlcUnlocker(appId, draft.unlocker, ids, draft.proxy,
      draft.proxyDll, page.target_directory ?? "."));
    if (!outcome) return;
    if (!outcome.ok) {
      notify(t.toastFailed(name), outcome.refreshFailed ? t.toastRefreshFailed : outcome.error);
      return;
    }
    notify(wasInstalled ? t.toastApplied(name) : t.toastInstalled(name), t.toastDlcOn(ids.length));
    // A proxy DLL only loads with its DLL override, so add it right away.
    if (draft.proxy && !launch.enabled && launch.editable) void launch.toggle(true);
  };

  const uninstall = () => {
    if (!appId) return;
    showModal(<ConfirmModal strTitle={t.uninstall} strDescription={t.uninstallConfirm}
      strOKButtonText={t.uninstall} strCancelButtonText={t.cancel}
      onOK={async () => {
        const outcome = await game.action(() => uninstallDlcUnlocker(appId));
        if (!outcome) return;
        if (!outcome.ok) { notify(t.toastFailed(name), outcome.refreshFailed ? t.toastRefreshFailed : outcome.error); return; }
        const kept = outcome.result.preserved_files?.length ?? 0;
        notify(t.toastUninstalled(name), kept ? t.toastKept(kept) : t.toastRestored);
      }} />, window);
  };

  const chooseLocation = () => {
    if (!page?.found) return;
    showModal(<LocationModal page={page} onChoose={directory => { void game.load(directory); }} />, window);
  };

  const discard = () => game.setDraft(previous => ({ ...previous, enabledIds: page?.enabled_dlc_ids ?? [] }));

  // Sidebar facts shared by every tab.
  const statusLine = (() => {
    if (unsupported) return { color: C.orange, dot: <Dot color={C.orange} />, text: t.statusUnsupported };
    if (!page?.found) return null;
    if (status === "external") return { color: C.orange, dot: <Dot color={C.orange} />, text: t.statusExternal };
    if (installed && (status === "modified" || status === "legacy"))
      return { color: C.orange, dot: <Dot color={C.orange} />, text: t.statusNeedsRepair };
    if (installed) return { color: C.green, dot: <Dot color={C.greenDot} />,
      text: t.statusInstalled(unlockerLabel(page.selected_unlocker), page.proxy_dll ? t.proxy : t.direct) };
    return { color: C.secondary, dot: <Dot color={C.muted} hollow />, text: t.statusNotInstalled };
  })();

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "dlc", label: t.tabDlc, icon: Icons.list() },
    { key: "install", label: t.tabInstall, icon: Icons.sliders() },
    { key: "maintenance", label: t.tabMaintenance, icon: Icons.wrench() },
    { key: "about", label: t.tabAbout, icon: Icons.info() },
  ];

  const nav = <Focusable flow-children="column" style={{ width: 300, flex: "0 0 300px",
    boxSizing: "border-box", padding: "28px 16px 24px 32px", display: "flex", flexDirection: "column", gap: 6,
    background: "rgba(0,0,0,.18)" }}>
    <div style={{ padding: "0 12px 18px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 12, color: C.muted, letterSpacing: ".5px" }}>CreamDeck</div>
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25, color: C.white, overflowWrap: "anywhere" }}>{name || " "}</div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, display: "flex", flexDirection: "column" }}>
        {typeof details.compatTool === "string" && <span style={{ color: unsupported ? C.orange : C.light }}>
          {unsupported ? t.noCompatTool : details.compatToolName}</span>}
        {appId && <span>{t.appId(appId)}</span>}
      </div>
      {statusLine && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: statusLine.color }}>
        {statusLine.dot}{statusLine.text}</div>}
    </div>
    {tabs.map(item => {
      const disabled = unsupported && item.key !== "about";
      const current = tab === item.key && !disabled;
      const style = { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 4, fontSize: 16,
        color: disabled ? C.disabled : current ? C.white : C.secondary, fontWeight: current ? 500 : 400,
        background: current ? "rgba(255,255,255,.12)" : "transparent" } as const;
      if (disabled) return <div key={item.key} aria-disabled="true" style={style}>{item.icon}{item.label}</div>;
      return <Focusable key={item.key} className="cd-focus cd-tab" style={style}
        onActivate={() => setTab(item.key)} onFocus={() => setTab(item.key)}>
        {item.icon}{item.label}
        {item.key === "about" && update?.latest && <span role="img" aria-label={t.newVersion(update.latest)}
          style={{ marginLeft: "auto", display: "inline-flex" }}><PulseDot size={9} /></span>}
      </Focusable>;
    })}
  </Focusable>;

  let content: ReactNode;
  if (!appId) content = <Message>{t.noAppId}</Message>;
  else if (loading && !page) content = <Message><Spinner style={{ width: 32, height: 32 }} /></Message>;
  else if (unsupported && tab !== "about") content = <UnsupportedTab onRecheck={details.reload} />;
  else if (!page?.found) content = <Message>{game.error ? <>{t.loadFailed}<br />{game.error}</> : t.gameNotInstalled}</Message>;
  else if (tab === "dlc") content = <DlcTab game={game} blocked={blocked} onInstall={() => { void install(); }}
    onDiscard={discard} onChooseLocation={chooseLocation} onTab={setTab} />;
  else if (tab === "install") content = <InstallTab page={page} draft={draft} setDraft={game.setDraft}
    disabled={blocked} launch={launch} onChooseLocation={chooseLocation} onTab={setTab} />;
  else if (tab === "maintenance") content = <MaintenanceTab page={page} preserved={game.preserved} disabled={blocked}
    onRecheck={() => { void game.recheck(); }} onUninstall={uninstall} />;
  else content = <AboutTab appId={appId} compatTool={details.compatToolName} />;

  return <div className="creamdeck-page" style={{ position: "absolute", inset: 0, paddingTop: PAGE_TOP_OFFSET,
    paddingBottom: PAGE_BOTTOM_OFFSET, boxSizing: "border-box", background: C.page, color: C.text, display: "flex" }}>
    <style>{STYLES}</style>
    <Focusable flow-children="row" style={{ flex: "1 1 auto", minHeight: 0, display: "flex" }}>
      {nav}
      {content}
    </Focusable>
  </div>;
}

function Message({ children }: { children: ReactNode }) {
  return <main style={{ flex: "1 1 auto", padding: "28px 40px", fontSize: 14, color: C.secondary, lineHeight: 1.6 }}>{children}</main>;
}
