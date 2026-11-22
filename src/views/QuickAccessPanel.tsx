import { toaster, useQuickAccessVisible } from "@decky/api";
import { ConfirmModal, Focusable, Navigation, showModal, staticClasses } from "@decky/ui";
import { useEffect, useState } from "react";
import { NAV_BUTTON } from "../components/AdaptiveNavGlyph";
import { C, Icons, NavGlyph, PulseDot, PageStyle, VersionLine } from "../components/ui";
import { unlockerLabel } from "../domain/display";
import { refreshUpdate, RELEASES_URL, useUpdateInfo } from "../hooks/useUpdateInfo";
import { InstalledGame, listInstalledGames, logFrontend, removeLeftover } from "../utils/backend";
import { useTranslations } from "../utils/i18n";


const open = (route: string) => { Navigation.Navigate(route); Navigation.CloseSideMenus(); };

/**
 * The project logo in one colour: a game card with an open padlock and a row of contacts,
 * a second card peeking out behind it. The lock and contacts are cut out of the card so the
 * icon follows Steam's currentColor. Every copy draws the same mask, so a shared id is safe.
 */
function LogoMark() {
  const pins = [7.5, 10.3, 13.1, 15.9, 18.7];
  return <svg aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" style={{ flex: "0 0 auto" }}>
    <mask id="creamdeck-logo-cutout" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
      <rect width="24" height="24" fill="#fff" />
      <rect x="10" y="11.8" width="8" height="5.8" rx="1.3" fill="#000" />
      <path d="M11.6 12.3V9.6a2.4 2.4 0 0 1 4.8 0v.7" fill="none" stroke="#000" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M14 13.2a1.1 1.1 0 0 1 .6 2l.3 1.3h-1.8l.3-1.3a1.1 1.1 0 0 1 .6-2Z" fill="#fff" />
      {pins.map(x => <rect key={x} x={x} y="19.4" width="1.8" height="1.7" rx=".3" fill="#000" />)}
    </mask>
    <g fill="currentColor">
      <path d="M1.5 18.5V4.5a3 3 0 0 1 3-3h12a2.2 2.2 0 0 1 2.2 2.2H8a4.3 4.3 0 0 0-4.3 4.3v10.5a1.1 1.1 0 0 1-2.2 0Z" />
      <rect x="5" y="5" width="18" height="18" rx="3" mask="url(#creamdeck-logo-cutout)" />
    </g>
  </svg>;
}

export function PluginIcon() {
  const update = useUpdateInfo();
  return <span style={{ position: "relative", display: "inline-flex" }}>
    <LogoMark />
    {update?.latest && <span style={{ position: "absolute", top: -3, right: -5, display: "inline-flex" }}>
      <PulseDot size={9} ring="#1b1d23" /></span>}
  </span>;
}

export function PanelTitle() {
  const t = useTranslations();
  const update = useUpdateInfo();
  // Shrinks with the panel: Decky puts its back button beside this title.
  return <div className={staticClasses.Title} style={{ flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 8, paddingTop: 0, paddingRight: 0 }}>
    <div style={{ fontSize: 18, whiteSpace: "nowrap" }}>CreamDeck</div>
    {update && <VersionLine compact current={update.current} latest={update.latest} label={t.latestVersion}
      onOpen={() => { Navigation.NavigateToExternalWeb(RELEASES_URL); Navigation.CloseSideMenus(); }} />}
  </div>;
}

// How to reach a game's CreamDeck page: Library, a game's options button, then the menu item.
function HowTo() {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 4, background: C.well,
    fontSize: 12, color: C.muted }}>
    {Icons.library()}
    {Icons.chevronRight(C.muted, 10)}
    <NavGlyph button={NAV_BUTTON.MENU} fallback="≡" />
    {Icons.chevronRight(C.muted, 10)}
    <span style={{ display: "inline-flex", fontSize: 16, color: C.blueText }}><LogoMark /></span>
    <span style={{ minWidth: 0, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>CreamDeck</span>
  </div>;
}

// Quick access: games that have an unlocker, read from the install record only.
export default function QuickAccessPanel() {
  const t = useTranslations();
  const [games, setGames] = useState<InstalledGame[]>();
  const visible = useQuickAccessVisible();
  // Re-read the installations and the release check each time the panel opens.
  useEffect(() => {
    if (!visible) return;
    void refreshUpdate();
    let cancelled = false;
    listInstalledGames().then(result => { if (!cancelled) setGames(result.games ?? []); })
      .catch(error => { logFrontend("warning", "List installed games", error); if (!cancelled) setGames([]); });
    return () => { cancelled = true; };
  }, [visible]);

  // A game Steam no longer has can't be opened; the only thing left to do is clear it away.
  const remove = (appId: string) => showModal(<ConfirmModal strTitle={t.removeLeftoverTitle(appId)}
    strDescription={t.removeLeftoverConfirm} strOKButtonText={t.removeLeftover} strCancelButtonText={t.cancel}
    bDestructiveWarning onOK={async () => {
      const notify = (title: string, body: string) => toaster.toast({ title, body, duration: 5000 });
      try {
        const result = await removeLeftover(appId);
        if (!result.success) { notify(t.toastFailed(t.appId(appId)), t.operationError(result.error_code)); return; }
        notify(t.toastLeftoverRemoved(appId), result.files_removed ? t.toastLeftoverFiles : t.toastLeftoverRecord);
        setGames(current => current?.filter(game => game.app_id !== appId));
      } catch (error) {
        logFrontend("error", `Remove leftovers of app ${appId}`, error);
        notify(t.toastFailed(t.appId(appId)), t.operationError());
      }
    }} />, window);

  return <Focusable flow-children="column" className="cd-font" style={{ display: "flex", flexDirection: "column", gap: 14, padding: "0 16px 16px 14px",
    color: C.text }}>
    <PageStyle />
    <HowTo />
    <section style={{ boxSizing: "border-box", padding: "12px 14px 6px 14px", borderRadius: 4, background: C.well,
      display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted }}>
        <span>{t.installedGames}</span>{games && <span>{games.length}</span>}</div>
      <div role="list" style={{ display: "flex", flexDirection: "column" }}>
        {games?.length === 0 && <div style={{ padding: "10px 2px", borderTop: `1px solid ${C.line}`, fontSize: 13, color: C.muted }}>
          {t.noneInstalled}</div>}
        {games?.map((game, index) => {
          const last = index === games.length - 1;
          const style = { display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderTop: `1px solid ${C.line}`,
            borderBottom: last ? `1px solid ${C.line}` : undefined } as const;
          const meta = <div style={{ fontSize: 11, color: C.muted }}>
            {game.name ? t.gameMeta(unlockerLabel(game.unlocker), game.proxy ? t.proxy : t.direct, game.dlc_count) : t.notInLibrary}</div>;
          if (!game.name) return <Focusable key={game.app_id} role="listitem" className="cd-focus" style={style}
            aria-label={`${t.removeLeftover} ${t.appId(game.app_id)}`} onActivate={() => remove(game.app_id)}>
            <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 14, color: C.secondary }}>{t.appId(game.app_id)}</div>{meta}</div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.red }}>
              {Icons.trash()}{t.removeLeftover}</span>
          </Focusable>;
          return <Focusable key={game.app_id} role="listitem" className="cd-focus" style={style}
            onActivate={() => open(`/creamdeck/${game.app_id}`)}>
            <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 14, color: C.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{game.name}</div>
              {meta}
            </div>
            {Icons.chevronRight(C.dim)}
          </Focusable>;
        })}
      </div>
      <div style={{ fontSize: 11, color: C.dim, padding: "6px 0 4px 0" }}>{t.onlyInstalled}</div>
    </section>
  </Focusable>;
}
