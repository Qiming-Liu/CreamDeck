import { Focusable } from "@decky/ui";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Button, C, Icons, Main, PageTitle, SectionLabel, StatusCard } from "../components/ui";
import { apiDll, unlockerLabel } from "../domain/display";
import type { FileReport, GamePage } from "../utils/backend";
import { useTranslations } from "../utils/i18n";

interface Props {
  page: GamePage;
  preserved: string[];
  disabled: boolean;
  onRecheck: () => void;
  onUninstall: () => void;
}

export default function MaintenanceTab({ page, preserved, disabled, onRecheck, onUninstall }: Props) {
  const t = useTranslations();
  // Opening the tab re-checks the files against the install record.
  useEffect(() => { onRecheck(); }, []);
  const status = page.file_status;
  const location = !page.target_directory || page.target_directory === "." ? t.gameRoot : page.target_directory;

  if (status === "external") {
    const files = page.external_files ?? [];
    return <Main>
      <PageTitle note={t.recheckNote}>{t.tabMaintenance}</PageTitle>
      <StatusCard tone="warn" icon={Icons.warn()} title={t.externalTitle} detail={t.externalDetail} />
      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
        <SectionLabel right={t.locationOf(location)}>{t.foundFiles(files.length)}</SectionLabel>
        <div role="list" style={{ display: "flex", flexDirection: "column" }}>
          {files.map((name, index) => <div key={name} role="listitem" style={{ display: "flex", alignItems: "center", gap: 14,
            padding: "10px 14px", borderTop: `1px solid ${C.line}`,
            borderBottom: index === files.length - 1 ? `1px solid ${C.line}` : undefined }}>
            <div style={{ flex: "1 1 auto", minWidth: 0, fontSize: 15, color: C.white, fontFamily: C.mono }}>{name}</div>
            <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{t.leftAlone}</span>
          </div>)}
        </div>
        <SectionLabel top={14}>{t.switchTitle}</SectionLabel>
        <ol style={{ margin: 0, padding: "0 14px 0 34px", display: "flex", flexDirection: "column", gap: 8, fontSize: 14,
          color: C.text, lineHeight: 1.5 }}>
          {t.switchSteps(files.length).map(step => <li key={step}>{step}</li>)}
        </ol>
      </div>
      <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        paddingTop: 12, borderTop: `1px solid ${C.line}`, flex: "0 0 auto" }}>
        <span style={{ fontSize: 12, color: C.muted }}>{t.lockedUntilHandled}</span>
        <Button variant="primary" onClick={onRecheck} disabled={disabled}>{t.checkAgain}</Button>
      </Focusable>
    </Main>;
  }

  if (!page.installed) {
    return <Main>
      <PageTitle note={t.recheckNote}>{t.tabMaintenance}</PageTitle>
      <StatusCard tone="plain" icon={Icons.lock()} title={t.notInstalledTitle} detail={t.notInstalledDetail} />
      {preserved.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <SectionLabel right={location}>{t.preservedTitle}</SectionLabel>
        <FileList rows={preserved.map(name => ({ name, detail: t.preservedNote, warn: true, action: t.kept }))} />
      </div>}
    </Main>;
  }

  const files = [...page.files ?? []].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
    || a.name.localeCompare(b.name));
  const modified = files.filter(file => file.status !== "same").length;
  const healthy = status === "healthy";
  const legacy = status === "legacy";
  const dll = files.find(file => file.role === "dll")?.name ?? apiDll(page);
  const card = healthy
    ? <StatusCard tone="ok" icon={Icons.check()} title={t.healthyTitle} detail={t.healthyDetail} />
    : legacy ? <StatusCard tone="warn" icon={Icons.warn()} title={t.legacyTitle} detail={t.legacyDetail} />
    : <StatusCard tone="warn" icon={Icons.warn()} title={t.modifiedTitle} detail={t.modifiedDetail} />;

  return <Main>
    <PageTitle note={t.recheckNote}>{t.tabMaintenance}</PageTitle>
    {card}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "0 16px", padding: "4px 14px 10px 14px",
      borderBottom: `1px solid ${C.line}`, flex: "0 0 auto" }}>
      <Fact label={t.factLocation} mono>{page.target_directory ?? "."}</Fact>
      <Fact label={t.factUnlocker}>{unlockerLabel(page.selected_unlocker)}</Fact>
      <Fact label={t.factMethod}>{page.proxy_dll ? t.methodProxy(page.proxy_dll) : t.methodDirect(dll)}</Fact>
      <Fact label={t.factVersion}>{page.resource_version ? `v${page.resource_version}` : "—"}</Fact>
    </div>
    <Focusable flow-children="column" style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 4,
      overflowY: "auto" }}>
      {files.length > 0 && <>
        <SectionLabel right={modified ? t.modifiedCount(modified) : undefined}>{t.uninstallPlan}</SectionLabel>
        <FileList rows={files.map(file => describe(file, t))} />
      </>}
      <SectionLabel top={14}>{t.actions}</SectionLabel>
      <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px",
        borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, flex: "0 0 auto" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 16, color: C.white }}>{t.uninstall}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{t.uninstallDescription}</div>
        </div>
        <Button onClick={onUninstall} disabled={disabled} style={{ height: 38 }}>{t.uninstall}</Button>
      </Focusable>
    </Focusable>
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 4,
      background: "rgba(0,0,0,.35)", fontSize: 12, color: C.muted, flex: "0 0 auto" }}>
      {Icons.circleInfo()}<span>{t.maintenanceFooter}</span>
    </div>
  </Main>;
}

type Translations = ReturnType<typeof useTranslations>;

// The DLL the game loads first, then its backup, then the unlocker's own files.
const ROLE_ORDER: FileReport["role"][] = ["dll", "backup", "proxy", "config", "record"];

function describe(file: FileReport, t: Translations) {
  const warn = file.status !== "same";
  return { name: file.name, warn, detail: warn ? t.fileStatus[file.status] : t.roles[file.role], action: t.fileAction[file.action] };
}

function FileList({ rows }: { rows: { name: string; detail: string; warn: boolean; action: string }[] }) {
  return <div role="list" style={{ display: "flex", flexDirection: "column", flex: "0 0 auto" }}>
    {rows.map((row, index) => <div key={row.name} role="listitem" style={{ display: "flex", alignItems: "center", gap: 14,
      padding: "10px 14px", borderTop: `1px solid ${C.line}`, borderBottom: index === rows.length - 1 ? `1px solid ${C.line}` : undefined }}>
      {row.warn ? Icons.refresh(C.orange) : Icons.folder(C.secondary)}
      <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 15, color: C.white, fontFamily: C.mono }}>{row.name}</div>
        <div style={{ fontSize: 12, color: row.warn ? C.orange : C.muted }}>{row.detail}</div>
      </div>
      <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{row.action}</span>
    </div>)}
  </div>;
}

function Fact({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
    <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
    <div style={{ fontSize: 14, color: C.white, fontFamily: mono ? C.mono : undefined, overflowWrap: "anywhere" }}>{children}</div>
  </div>;
}
