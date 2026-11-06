import { useQuickAccessVisible } from "@decky/api";
import { Focusable, Navigation, staticClasses } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaUnlock } from "react-icons/fa";
import { C, Icons, PulseDot, STYLES, VersionLine } from "../components/ui";
import { unlockerLabel } from "../domain/display";
import { refreshUpdate, RELEASES_URL, useUpdateInfo } from "../hooks/useUpdateInfo";
import { InstalledGame, listInstalledGames } from "../utils/backend";
import { useTranslations } from "../utils/i18n";

export const LOGS_ROUTE = "/creamdeck-logs";

const open = (route: string) => { Navigation.Navigate(route); Navigation.CloseSideMenus(); };

export function PluginIcon() {
  const update = useUpdateInfo();
  return <span style={{ position: "relative", display: "inline-flex" }}>
    <FaUnlock />
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
      .catch(() => { if (!cancelled) setGames([]); });
    return () => { cancelled = true; };
  }, [visible]);

  return <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 14, padding: "0 16px 16px 14px",
    color: C.text }}>
    <style>{STYLES}</style>
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
          if (!game.name) return <div key={game.app_id} role="listitem" style={style}>
            <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 14, color: C.secondary }}>{t.appId(game.app_id)}</div>{meta}</div>
          </div>;
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
    <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>{t.contextHint}</div>
    <Focusable className="cd-focus" onActivate={() => open(LOGS_ROUTE)} style={{ display: "flex", alignItems: "center", gap: 10,
      height: 44, boxSizing: "border-box", padding: "0 12px", borderRadius: 4, background: C.well, color: C.white, fontSize: 14 }}>
      {Icons.doc()}<span style={{ flex: "1 1 auto" }}>{t.logs}</span>{Icons.chevronRight(C.muted)}
    </Focusable>
  </Focusable>;
}
