import { Focusable, TextField } from "@decky/ui";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ActionBar, Button, C, fluid, Glyph, Icons, Main, Pager, Switch, SwitchRow, toneStyle } from "../components/ui";
import { filterDlcs, sameIds, selectionChanges, selectionLevel, selectVisible } from "../domain/gamePage";
import { apiDll, shortName, targetBits, unlockerLabel } from "../domain/display";
import type { useGamePage } from "../hooks/useGamePage";
import { useTranslations } from "../utils/i18n";
import type { Tab } from "./CreamDeckPage";

// A fixed page size; the tab scrolls when a page is taller than the screen.
const PAGE_SIZE = 10;
// Spacing shrinks on short screens so more rows fit.
const ROW_PAD = `${fluid(6, 11)} 14px`;
const BAR_PAD = `${fluid(8, 12)} 16px`;

interface Props {
  game: ReturnType<typeof useGamePage>;
  blocked: boolean;
  onInstall: () => void;
  onDiscard: () => void;
  onChooseLocation: () => void;
  onTab: (tab: Tab) => void;
}

export default function DlcTab({ game, blocked, onInstall, onDiscard, onChooseLocation, onTab }: Props) {
  const t = useTranslations();
  const { page, draft, setDraft, busy, needsRefresh, dlcLoading } = game;
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const dlcs = page?.dlcs ?? [];
  const visible = useMemo(() => filterDlcs(dlcs, query, false, []), [dlcs, query]);
  const selected = new Set(draft.enabledIds);
  const saved = page?.enabled_dlc_ids ?? [];
  const installed = !!page?.installed;
  const status = page?.file_status;
  const external = status === "external";
  const mismatch = installed && (status === "modified" || status === "legacy" || !!page?.integrity_error);
  const cached = !!page?.dlc_cached;
  const changes = selectionChanges(dlcs, saved, draft.enabledIds);
  const changeCount = changes.added.length + changes.removed.length;
  const dirty = installed && !sameIds(draft.enabledIds, saved);
  const selectedCount = dlcs.filter(dlc => selected.has(dlc.id)).length;
  const level = selectionLevel(visible, draft.enabledIds);
  const location = !page?.target_directory || page.target_directory === "." ? t.gameRoot : page.target_directory;
  const targetFound = (page?.api_dlls?.length ?? 0) > 0;
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const shownPage = Math.min(pageIndex, pages - 1);
  const pageRows = visible.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE);
  // Pages holding an unapplied change are marked, so no change hides on another page.
  const changedPages = new Set(visible.flatMap((dlc, index) =>
    installed && selected.has(dlc.id) !== saved.includes(dlc.id) ? [Math.floor(index / PAGE_SIZE)] : []));

  const toggle = (ids: string[], checked: boolean) => setDraft(previous => ({ ...previous,
    enabledIds: selectVisible(previous.enabledIds, dlcs.filter(dlc => ids.includes(dlc.id)), checked) }));

  // The bottom bar names the next step instead of showing a disabled button.
  let bar: ReactNode = null;
  let primary: (() => void) | undefined;
  let secondary: (() => void) | undefined;
  if (needsRefresh) {
    bar = <ActionBar padding={BAR_PAD} tone="dark" title={t.pageStale} detail={t.refreshToEdit}>
      <Button onClick={() => { void game.load(); }} disabled={busy}>{t.refresh}</Button></ActionBar>;
  } else if (!installed) {
    const title = t.selectedForInstall(selectedCount, dlcs.length);
    if (external) {
      bar = <ActionBar padding={BAR_PAD} tone="warn" title={title} detail={t.statusExternal} detailColor={C.orange}>
        <Button onClick={() => onTab("maintenance")}>{t.goToMaintenance}</Button></ActionBar>;
    } else if (!targetFound) {
      // The card above already names the missing DLL and offers the folder picker.
    } else if (!cached) {
      bar = <ActionBar padding={BAR_PAD} tone="dark" title={t.catalogFirst} detail={game.dlcError || t.noCatalog}>
        <Button onClick={() => { void game.loadDlcs(true); }} disabled={dlcLoading}>{t.refresh}</Button></ActionBar>;
    } else {
      // No bar: the install button sits in the card above, X works from anywhere.
      primary = onInstall;
    }
  } else if (dirty) {
    if (mismatch) {
      bar = <ActionBar padding={BAR_PAD} tone="warn" title={t.changesBlocked(changeCount)} detail={t.filesMismatch} detailColor={C.orange}>
        <Button onClick={() => onTab("maintenance")}>{t.goToMaintenance}</Button></ActionBar>;
    } else if (!cached) {
      bar = <ActionBar padding={BAR_PAD} tone="dark" title={t.changesPending(changeCount)} detail={t.noCatalog}>
        <Button onClick={() => { void game.loadDlcs(true); }} disabled={dlcLoading}>{t.refreshCatalog}</Button></ActionBar>;
    } else {
      const names = [...changes.added.map(dlc => t.changeOn(shortName(dlc.name, page?.name))),
        ...changes.removed.map(dlc => t.changeOff(shortName(dlc.name, page?.name)))];
      const summary = names.length > 3 ? [...names.slice(0, 3), t.changeMore(names.length - 3)] : names;
      const detail = changes.delisted.length ? t.delisted(changes.delisted.length) : [...summary, t.restartToApply].join(" · ");
      primary = onInstall;
      secondary = onDiscard;
      bar = <ActionBar padding={BAR_PAD} tone="info" title={t.changesPending(changeCount)} detail={detail} detailColor={C.blueText}>
        <Button variant="ghost" onClick={onDiscard} disabled={blocked}><Glyph letter="Y" />{t.discard}</Button>
        <Button variant="primary" onClick={onInstall} disabled={blocked}><Glyph letter="X" light />{busy ? t.working : t.apply}</Button>
      </ActionBar>;
    }
  }

  const bits = targetBits(page);
  const card = !installed && !external && <section aria-label={t.willInstall} style={{ boxSizing: "border-box",
    padding: `${fluid(8, 14)} 18px`, borderRadius: 4, ...toneStyle(targetFound ? "plain" : "warn"), display: "flex", alignItems: "center",
    gap: 16, flex: "0 0 auto" }}>
    <span aria-hidden="true" style={{ display: "inline-flex", width: 36, height: 36, borderRadius: 18,
      background: targetFound ? C.button : C.orange, color: targetFound ? C.white : "#0e141b", alignItems: "center",
      justifyContent: "center", flex: "0 0 36px" }}>{targetFound ? Icons.lock() : Icons.warn()}</span>
    <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 12, color: targetFound ? C.muted : C.orange, fontWeight: 500 }}>{t.willInstall}</div>
      <div style={{ fontSize: 16, color: C.white, fontWeight: 500 }}>{targetFound
        ? draft.proxy ? t.willInstallProxy(unlockerLabel(draft.unlocker), draft.proxyDll)
          : t.willInstallDirect(unlockerLabel(draft.unlocker), apiDll(page))
        : t.targetMissing}</div>
      <div style={{ fontSize: 12, color: targetFound ? C.muted : C.orange, whiteSpace: "nowrap", overflow: "hidden",
        textOverflow: "ellipsis" }}>{targetFound
        ? [location, apiDll(page), t.bits(bits), draft.proxy ? t.originalUntouched : t.originalBackedUp].join(" · ")
        : t.targetMissingDetail(location)}</div>
    </div>
    {targetFound ? <Focusable flow-children="row" style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
      <Button variant={primary ? "ghost" : "secondary"} onClick={() => onTab("install")}>{t.changeSettings}</Button>
      {primary && <Button variant="primary" onClick={primary} disabled={blocked}>
        <Glyph letter="X" light />{busy ? t.working : t.install}</Button>}
    </Focusable> : <Button onClick={onChooseLocation} disabled={blocked}>{t.chooseFolder}</Button>}
  </section>;

  const meta = (id: string, depot: boolean | null) => <>{id}{depot && <> · <span style={{ color: C.orange }}>
    {installed || page?.has_record ? t.separateContent : `${t.separateContent} · ${t.offByDefault}`}</span></>}</>;

  return <Main gap={fluid(8, 14)} padding={`${fluid(14, 28)} 40px ${fluid(10, 24)} 32px`} pad={{
    onSecondaryButton: primary && !blocked ? primary : undefined,
    onSecondaryActionDescription: primary ? installed ? t.apply : t.install : undefined,
    onOptionsButton: secondary && !blocked ? secondary : undefined,
    onOptionsActionDescription: secondary ? t.discard : undefined,
  }}>
    <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      flex: "0 0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flex: "0 0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.white }}>{t.tabDlc}</h1>
        {cached && <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{t.dlcCount(dlcs.length)}</span>}
      </div>
      <Focusable flow-children="row" style={{ flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center",
        justifyContent: "flex-end", gap: 8 }}>
        <div className="cd-search"><TextField aria-label={t.searchLabel} {...{ placeholder: t.searchPlaceholder }} value={query}
          onChange={event => { setQuery(event.target.value); setPageIndex(0); }} /></div>
        <Button icon label={t.refreshCatalog} disabled={dlcLoading} onClick={() => { void game.loadDlcs(true); }}>
          {Icons.refresh()}</Button>
      </Focusable>
    </Focusable>

    {card}

    {dlcs.length > 0 && <Focusable className="cd-focus" role="checkbox" aria-checked={level === "some" ? "mixed" : level === "all"}
      aria-label={t.allDlc} onActivate={() => { if (!blocked) toggle(visible.map(dlc => dlc.id), level !== "all"); }}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: ROW_PAD, borderRadius: 4,
        background: "rgba(255,255,255,.05)", flex: "0 0 auto" }}>
      <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 16, color: C.white, fontWeight: 500 }}>{t.allDlc}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{t.selectedOf(selectedCount, dlcs.length)}</div>
      </div>
      <Switch on={level === "all"} mixed={level === "some"} disabled={blocked} />
    </Focusable>}

    <Focusable flow-children="column" role="list" style={{ display: "flex", flexDirection: "column", flex: "0 0 auto" }}>
      {!cached && dlcLoading ? <Empty>{t.catalogLoading}</Empty>
        : !cached ? <Empty>{game.dlcError || t.noCatalog}</Empty>
        : dlcs.length === 0 ? <Empty>{t.noDlcFound}</Empty>
        : visible.length === 0 ? <Empty>{t.noResults}</Empty>
        : pageRows.map((dlc, index) => {
          const on = selected.has(dlc.id);
          const changed = installed && on !== saved.includes(dlc.id);
          return <SwitchRow key={dlc.id} label={dlc.name} title={dlc.name} meta={meta(dlc.id, dlc.has_depot)}
            padding={ROW_PAD} on={on} disabled={blocked} tinted={changed} tag={changed ? on ? t.tagOn : t.tagOff : undefined}
            last={index === pageRows.length - 1} onToggle={() => toggle([dlc.id], !on)} />;
        })}
    </Focusable>

    {bar}

    <Pager small justify="center" pages={pages} current={shownPage} marked={changedPages} onPage={setPageIndex}
      labels={{ previous: t.previousPage, next: t.nextPage, page: t.pageLabel }} />
  </Main>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: "16px 14px", fontSize: 13, color: C.muted, borderTop: `1px solid ${C.line}` }}>{children}</div>;
}
