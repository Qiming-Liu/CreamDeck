import { ConfirmModal, DialogButton, Focusable, Router, SidebarNavigation, showModal, Spinner } from "@decky/ui";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { FaListUl, FaSlidersH, FaWrench } from "react-icons/fa";
import { buttonStyle, secondaryStyle } from "../components/GameRow";
import { proxyChoices, sameIds } from "../domain/gamePage";
import { useGamePage } from "../hooks/useGamePage";
import { diagnoseInstall, forceCleanup, installDlcUnlocker, uninstallDlcUnlocker } from "../utils/backend";
import { useWineDllOverride } from "../hooks/useWineDllOverride";
import { useTranslations } from "../utils/i18n";
import DlcPanel from "./DlcPanel";
import InstallPanel from "./InstallPanel";
import MaintenancePanel from "./MaintenancePanel";

// Leave room for Big Picture's fixed status and footer bars.
const PAGE_TOP_OFFSET = 56;
const PAGE_BOTTOM_OFFSET = 56;
// Steam's paged-settings content retains this inset even with padding="none".
const SIDEBAR_CONTENT_TOP_INSET = 40;

export default function CreamDeckPage() {
  const t = useTranslations();
  const appId = window.location.pathname.match(/\/creamdeck\/(\d+)/)?.[1] ?? null;
  const { page, draft, setDraft, loading, busy, error, notice, needsRefresh, preserved,
    dlcLoading, dlcError, loadDlcs, load, action } = useGamePage(appId, t.operationError);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const launch = useWineDllOverride(Number(appId), draft.proxyDll, !!page?.found && draft.proxy && proxyChoices(draft.unlocker).length > 0, setLaunchBusy);
  useEffect(() => { setDiagnosis(""); }, [draft.unlocker, draft.proxy, draft.proxyDll, page?.target_directory]);
  const route = `/creamdeck/${appId}`;
  const installed = !!page?.installed;
  const blocked = busy || launchBusy || diagnosing || loading || needsRefresh;
  const dirty = installed && !sameIds(draft.enabledIds, page?.enabled_dlc_ids ?? []);
  const label = page?.unlockers?.find(u => u.key === draft.unlocker)?.label ?? draft.unlocker;

  const install = () => {
    if (!appId) return;
    void action(() => installDlcUnlocker(appId, draft.unlocker, draft.enabledIds, draft.proxy, draft.proxyDll, page?.target_directory ?? "."), t.installSuccess, t.refreshFailed);
  };
  const diagnose = async () => {
    if (!appId || blocked) return;
    setDiagnosing(true); setDiagnosis("");
    try {
      const result = await diagnoseInstall(appId, draft.unlocker, draft.proxy, draft.proxyDll, page?.target_directory ?? ".");
      setDiagnosis(result.success ? t.diagnosisReady(result.bitness ?? 64) : t.operationError(result.error_code));
    } catch { setDiagnosis(t.operationError()); }
    finally { setDiagnosing(false); }
  };
  const confirm = (cleanup: boolean) => {
    if (!appId) return;
    showModal(<ConfirmModal strTitle={cleanup ? t.removeUnlockerFiles : t.uninstall}
      strDescription={cleanup ? t.cleanupConfirm : t.uninstallConfirm}
      strOKButtonText={cleanup ? t.removeUnlockerFiles : t.uninstall} strCancelButtonText={t.cancel}
      onOK={() => { void action(() => cleanup ? forceCleanup(appId) : uninstallDlcUnlocker(appId), cleanup ? t.cleanupSuccess : t.uninstallSuccess, t.refreshFailed); }} />, window);
  };

  const header = <div style={{ flexShrink: 0, background: "#1b2029", paddingBottom: 12, marginBottom: 12 }}>
    <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: "1 1 0", minWidth: 0 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 5px", overflowWrap: "anywhere" }}>{page?.name || "CreamDeck"}</h2>
        <div role="status" style={{ fontSize: 12, color: page?.integrity_error ? "#f0bd73" : dirty ? "#73c6f4" : "#aeb7c5" }}>
          {page?.file_status === "external" ? t.filesExternal : page?.file_status === "legacy" ? t.filesLegacy : page?.integrity_error ? t.filesModified : installed ? `${t.filesHealthy} · ${label}${dirty ? ` · ${t.unsaved}` : ""}` : t.notInstalled}
        </div>
        {installed && draft.proxy && <div role="status" style={{ fontSize: 12, marginTop: 4, color: launch.enabled ? "#9bd9ae" : "#f0bd73" }}>
          {launch.loading ? t.launchChecking : launch.enabled ? t.launchReady : t.launchRequired}
        </div>}
      </div>
      {page?.found && <DialogButton style={buttonStyle} disabled={blocked || !!page.integrity_error || !page.dlc_cached || (installed && !dirty)} onClick={install}>
        {busy ? t.working : installed ? dirty ? t.applyChanges : t.applied : t.install}
      </DialogButton>}
    </Focusable>
    {page?.integrity_error && !window.location.pathname.endsWith("/maintenance") && <div style={{ ...secondaryStyle, color: "#f0bd73", marginTop: 10 }}>{t.integritySummary}
      <DialogButton style={{ ...buttonStyle, marginTop: 8 }} disabled={blocked} onClick={() => Router.Navigate(`${route}/maintenance`)}>{t.openMaintenance}</DialogButton>
    </div>}
    {error && <Focusable flow-children="row" style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
      <div role="alert" style={{ ...secondaryStyle, color: "#f0bd73", flex: 1 }}>{error}</div>
      <DialogButton style={buttonStyle} disabled={busy || launchBusy} onClick={() => { void load(); }}>{t.retry}</DialogButton>
    </Focusable>}
    {notice && <div role="status" style={{ ...secondaryStyle, color: "#9bd9ae", marginTop: 10 }}>{notice}</div>}
    {preserved.length > 0 && <div role="status" style={{ ...secondaryStyle, color: "#f0bd73", marginTop: 8 }}>{t.preservedFiles}: {preserved.join(", ")}</div>}
  </div>;

  const content = (children: ReactNode) => <Focusable className="creamdeck-content" flow-children="column" style={{
    display: "flex", flexDirection: "column", height: `calc(100vh - ${PAGE_TOP_OFFSET + PAGE_BOTTOM_OFFSET + SIDEBAR_CONTENT_TOP_INSET}px)`,
    boxSizing: "border-box", padding: "24px 32px 16px", minHeight: 0,
  }}>
    {header}
    <Focusable className="creamdeck-scroll" flow-children="column" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 2px 16px" }}>
      {loading ? <div style={{ padding: 24, textAlign: "center" }}><Spinner style={{ width: 32, height: 32 }} /></div>
        : !appId ? <div>{t.noAppId}</div>
        : !page?.found ? <div>{error ? t.loadFailed : t.gameNotInstalled}</div>
        : children}
    </Focusable>
  </Focusable>;

  return <div className="creamdeck-page" style={{ position: "absolute", inset: 0, paddingTop: PAGE_TOP_OFFSET,
    paddingBottom: PAGE_BOTTOM_OFFSET, boxSizing: "border-box" }}>
    <SidebarNavigation title="CreamDeck" showTitle disableRouteReporting pages={[
      { identifier: "dlc", route: `${route}/dlc`, title: t.dlcManagement, padding: "none", hideTitle: true, icon: <FaListUl />, content: content(
        <>
          <Focusable flow-children="row" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <div role="status" style={{ ...secondaryStyle, flex: 1 }}>{dlcLoading ? t.refreshingDlc : page?.dlc_updated_at ? t.cachedAt(new Date(page.dlc_updated_at * 1000).toLocaleString()) : t.catalogMissing}</div>
            <DialogButton style={buttonStyle} disabled={dlcLoading || blocked} onClick={() => { void loadDlcs(true); }}>{t.refreshDlc}</DialogButton>
          </Focusable>
          {dlcError && <div role="alert" style={{ ...secondaryStyle, color: "#f0bd73", marginBottom: 12 }}>{dlcError}</div>}
          <DlcPanel dlcs={page?.dlcs ?? []} config={draft} onChange={setDraft} disabled={blocked} />
        </>) },
      { identifier: "install", route: `${route}/install`, title: t.installSettings, padding: "none", hideTitle: true, icon: <FaSlidersH />, content: content(
        <InstallPanel config={draft} onChange={setDraft} unlockers={page?.unlockers ?? []}
          installed={installed} disabled={blocked} page={page} onTarget={directory => { void load(directory); }}
          launch={launch} diagnosis={diagnosis} onDiagnose={() => { void diagnose(); }} />) },
      { identifier: "maintenance", route: `${route}/maintenance`, title: t.maintenance, padding: "none", hideTitle: true, icon: <FaWrench />, content: content(
        <MaintenancePanel page={page} config={draft} disabled={blocked} onUninstall={() => confirm(false)} onCleanup={() => confirm(true)} />) },
    ]} />
  </div>;
}
