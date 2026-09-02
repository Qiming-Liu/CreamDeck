import {
  ButtonItem,
  Dropdown,
  Focusable,
  PanelSection,
  PanelSectionRow,
  Spinner,
  staticClasses,
  ToggleField,
} from "@decky/ui";
import { useEffect, useMemo, useState } from "react";

import {
  DlcInfo,
  forceCleanup,
  getGamePage,
  installDlcUnlocker,
  UnlockerInfo,
  uninstallDlcUnlocker,
} from "../utils/backend";
import { applyWineDllOverride } from "../utils/wineDllOverride";

// Which unlockers Koaloader can autoload alongside its proxy DLL.
const KOALOADER_AUTOLOAD_CHOICES = ["smokeapi", "screamapi", "uplay_r1", "uplay_r2"];

// routerHook passes react-router v5-style props, but the exact shape isn't
// part of @decky/ui's stable public types, so the appid is read straight out
// of the URL instead of trusting a particular prop shape across versions.
function getAppIdFromLocation(): string | null {
  const match = window.location.pathname.match(/\/creamdeck\/(\d+)/);
  return match ? match[1] : null;
}

// SmokeAPI/CreamAPI/Koaloader support a proxy DLL install; ScreamAPI/UplayR1/R2 don't.
const PROXY_CAPABLE_UNLOCKERS = new Set(["smokeapi", "creamapi", "koaloader"]);

// Full-page routes (unlike the QuickAccess panel) render underneath Big
// Picture's fixed status bar (clock/battery/etc, ~40px tall, z-index 6000) —
// nothing in that outer chrome reserves space for it, so this page has to
// push its own content down far enough to clear it.
const PAGE_TOP_OFFSET = "56px";

export default function CreamDeckPage() {
  const appId = useMemo(() => getAppIdFromLocation(), []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameName, setGameName] = useState<string>("");
  const [dlcs, setDlcs] = useState<DlcInfo[]>([]);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [installed, setInstalled] = useState(false);
  const [unlockers, setUnlockers] = useState<UnlockerInfo[]>([]);
  const [selectedUnlocker, setSelectedUnlocker] = useState("smokeapi");
  const [proxyChoices, setProxyChoices] = useState<string[]>([]);
  const [useProxy, setUseProxy] = useState(false);
  const [proxyDll, setProxyDll] = useState("winmm");
  const [koaloaderAutoload, setKoaloaderAutoload] = useState<Set<string>>(new Set());
  const [integrityError, setIntegrityError] = useState<string | null>(null);
  const [launchOptionStatus, setLaunchOptionStatus] = useState<
    "idle" | "working" | "applied" | "already" | "error"
  >("idle");

  useEffect(() => {
    if (!appId) {
      setError("No appid in URL");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const page = await getGamePage(appId);
        if (!page.found) {
          setError("This game isn't installed (or its Steam library couldn't be read).");
          setLoading(false);
          return;
        }
        setGameName(page.name ?? appId);
        setDlcs(page.dlcs ?? []);
        setEnabledIds(new Set(page.enabled_dlc_ids ?? []));
        setInstalled(!!page.installed);
        setUnlockers(page.unlockers ?? []);
        setSelectedUnlocker(page.selected_unlocker ?? "smokeapi");
        setProxyChoices(page.proxy_dll_choices ?? []);
        setKoaloaderAutoload(new Set(page.koaloader_autoload ?? []));
        setIntegrityError(page.integrity_error ?? null);
        if (page.proxy_dll) {
          setUseProxy(true);
          setProxyDll(page.proxy_dll);
        }
        setLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load this game's info.");
        setLoading(false);
      }
    })();
  }, [appId]);

  const toggleDlc = (id: string, checked: boolean) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAll = (checked: boolean) => {
    setEnabledIds(checked ? new Set(dlcs.map((dlc) => dlc.id)) : new Set());
  };

  const toggleKoaloaderAutoload = (key: string, checked: boolean) => {
    setKoaloaderAutoload((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const onInstall = async () => {
    if (!appId) return;
    setBusy(true);
    setError(null);
    const result = await installDlcUnlocker(
      appId,
      selectedUnlocker,
      Array.from(enabledIds),
      useProxy,
      proxyDll,
      Array.from(koaloaderAutoload),
    );
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? "Install failed");
      return;
    }
    setInstalled(true);
    setIntegrityError(null);
  };

  const onUninstall = async () => {
    if (!appId) return;
    setBusy(true);
    setError(null);
    const result = await uninstallDlcUnlocker(appId);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? "Uninstall failed");
      return;
    }
    setInstalled(false);
    setIntegrityError(null);
  };

  const onApplyWineDllOverride = async () => {
    if (!appId) return;
    setLaunchOptionStatus("working");
    try {
      const result = await applyWineDllOverride(Number(appId), proxyDll);
      setLaunchOptionStatus(result ? (result.alreadySet ? "already" : "applied") : "error");
    } catch {
      setLaunchOptionStatus("error");
    }
  };

  const onForceCleanup = async () => {
    if (!appId) return;
    setBusy(true);
    setError(null);
    const result = await forceCleanup(appId);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? "Cleanup failed");
      return;
    }
    setInstalled(false);
    setIntegrityError(null);
    setEnabledIds(new Set());
  };

  const pageTitle = gameName ? `CreamDeck (${gameName})` : "CreamDeck";

  if (loading) {
    return (
      <Focusable style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div
          className={staticClasses.Title}
          style={{ padding: "1em", paddingTop: PAGE_TOP_OFFSET, flexShrink: 0 }}
        >
          {pageTitle}
        </div>
        <div style={{ marginTop: "0.75em" }}>
          <PanelSection>
            <PanelSectionRow>
              <div style={{ display: "flex", justifyContent: "center", padding: "1em 0" }}>
                <Spinner style={{ width: "32px", height: "32px" }} />
              </div>
            </PanelSectionRow>
          </PanelSection>
        </div>
      </Focusable>
    );
  }

  if (error) {
    return (
      <Focusable style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div
          className={staticClasses.Title}
          style={{ padding: "1em", paddingTop: PAGE_TOP_OFFSET, flexShrink: 0 }}
        >
          {pageTitle}
        </div>
        <div style={{ marginTop: "0.75em" }}>
          <PanelSection>
            <PanelSectionRow>{error}</PanelSectionRow>
          </PanelSection>
        </div>
      </Focusable>
    );
  }

  const selectedInfo = unlockers.find((u) => u.key === selectedUnlocker);
  const showKoaloaderAutoload = selectedUnlocker === "koaloader";
  // Koaloader only has a DLC list when it's actually auto-loading SmokeAPI — picking
  // "Koaloader" alone doesn't imply a DLC list the way picking "SmokeAPI" does.
  const showDlcList = showKoaloaderAutoload
    ? koaloaderAutoload.has("smokeapi")
    : selectedInfo?.supports_dlc_list ?? false;
  const showProxyControls = PROXY_CAPABLE_UNLOCKERS.has(selectedUnlocker);

  return (
    <Focusable style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        className={staticClasses.Title}
        style={{ padding: "1em", paddingTop: PAGE_TOP_OFFSET, flexShrink: 0 }}
      >
        {pageTitle}
      </div>

      <Focusable style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0.75em 1em 1em" }}>
        {integrityError && (
          <PanelSection title="Integrity check failed">
            <PanelSectionRow>{integrityError}</PanelSectionRow>
            <PanelSectionRow>
              Already verified and it's still showing this? Steam's verify only restores the
              game's own files — it won't remove an unlocker's leftover config/proxy files, which
              is usually what's actually causing this. Use the button below to remove them
              directly.
            </PanelSectionRow>
            <PanelSectionRow>
              <ButtonItem layout="below" disabled={busy} onClick={onForceCleanup}>
                {busy ? "Working..." : "Remove all unlocker files"}
              </ButtonItem>
            </PanelSectionRow>
          </PanelSection>
        )}

        <PanelSection title="Unlocker">
          <PanelSectionRow>
            <Dropdown
              rgOptions={unlockers.map((u) => ({
                data: u.key,
                label: u.detected ? `${u.label} (detected)` : u.label,
              }))}
              selectedOption={selectedUnlocker}
              disabled={installed}
              onChange={(option) => setSelectedUnlocker(option.data)}
            />
          </PanelSectionRow>
          {!selectedInfo?.detected && selectedUnlocker !== "koaloader" && (
            <PanelSectionRow>
              This game doesn't seem to have {selectedInfo?.label ?? "this unlocker"}'s target
              file — installing it anyway probably won't do anything.
            </PanelSectionRow>
          )}
        </PanelSection>

        {showKoaloaderAutoload && (
          <PanelSection title="Koaloader: auto-load">
            {KOALOADER_AUTOLOAD_CHOICES.map((key) => {
              const info = unlockers.find((u) => u.key === key);
              return (
                <PanelSectionRow key={key}>
                  <ToggleField
                    label={info?.label ?? key}
                    description={info?.detected ? "detected in this game" : undefined}
                    checked={koaloaderAutoload.has(key)}
                    disabled={installed}
                    onChange={(checked) => toggleKoaloaderAutoload(key, checked)}
                  />
                </PanelSectionRow>
              );
            })}
          </PanelSection>
        )}

        {showDlcList ? (
          <PanelSection title={`DLC (${enabledIds.size}/${dlcs.length} enabled)`}>
            <PanelSectionRow>
              <ButtonItem layout="below" onClick={() => selectAll(true)}>
                Select all
              </ButtonItem>
            </PanelSectionRow>
            <PanelSectionRow>
              <ButtonItem layout="below" onClick={() => selectAll(false)}>
                Deselect all
              </ButtonItem>
            </PanelSectionRow>

            {dlcs.length === 0 && <PanelSectionRow>No DLC found for this game.</PanelSectionRow>}

            {dlcs.map((dlc) => (
              <PanelSectionRow key={dlc.id}>
                <ToggleField
                  label={dlc.name}
                  description={dlc.id}
                  checked={enabledIds.has(dlc.id)}
                  onChange={(checked) => toggleDlc(dlc.id, checked)}
                />
              </PanelSectionRow>
            ))}
          </PanelSection>
        ) : (
          <PanelSection title="DLC">
            <PanelSectionRow>
              {selectedInfo?.label ?? "This unlocker"} unlocks everything by default — there's no
              per-DLC list for it in this plugin (it needs a catalog this plugin doesn't have,
              since it only scans Steam).
            </PanelSectionRow>
          </PanelSection>
        )}

        {showProxyControls && (
          <PanelSection title="Proxy mode">
            <PanelSectionRow>
              <ToggleField
                label="Use a proxy DLL"
                description="Instead of replacing the unlocker's target file directly — use this if the game doesn't get along with a direct replacement."
                checked={useProxy}
                disabled={installed}
                onChange={(checked) => {
                  setUseProxy(checked);
                  setLaunchOptionStatus("idle");
                }}
              />
            </PanelSectionRow>
            {useProxy && (
              <PanelSectionRow>
                <Dropdown
                  rgOptions={proxyChoices.map((name) => ({ data: name, label: `${name}.dll` }))}
                  selectedOption={proxyDll}
                  disabled={installed}
                  onChange={(option) => {
                    setProxyDll(option.data);
                    setLaunchOptionStatus("idle");
                  }}
                />
              </PanelSectionRow>
            )}
            {useProxy && (
              <>
                <PanelSectionRow>
                  On Steam Deck, Proton's own built-in {proxyDll}.dll is normally preferred over
                  the one CreamDeck drops into the game folder — so the unlocker never actually
                  loads unless this game's launch options tell Proton to prefer it instead. Without
                  this, the game will launch fine but DLC will stay locked.
                </PanelSectionRow>
                <PanelSectionRow>
                  <ButtonItem
                    layout="below"
                    disabled={launchOptionStatus === "working"}
                    onClick={onApplyWineDllOverride}
                  >
                    {launchOptionStatus === "working"
                      ? "Working..."
                      : `Set launch option for ${proxyDll}.dll`}
                  </ButtonItem>
                </PanelSectionRow>
                {launchOptionStatus === "applied" && (
                  <PanelSectionRow>
                    Done — launch options updated. Fully close and relaunch the game for it to take
                    effect.
                  </PanelSectionRow>
                )}
                {launchOptionStatus === "already" && (
                  <PanelSectionRow>This game's launch options already have it set.</PanelSectionRow>
                )}
                {launchOptionStatus === "error" && (
                  <PanelSectionRow>
                    Couldn't read this game's launch options. Set it manually instead: add{" "}
                    {`WINEDLLOVERRIDES="${proxyDll}=n,b" %command%`} to this game's Launch Options
                    in Steam (Properties → General).
                  </PanelSectionRow>
                )}
              </>
            )}
          </PanelSection>
        )}

        <PanelSection>
          <PanelSectionRow>
            <ButtonItem layout="below" disabled={busy || !!integrityError} onClick={onInstall}>
              {busy ? "Working..." : installed ? "Update install" : "Install"}
            </ButtonItem>
          </PanelSectionRow>
          {installed && (
            <PanelSectionRow>
              <ButtonItem layout="below" disabled={busy} onClick={onUninstall}>
                Uninstall
              </ButtonItem>
            </PanelSectionRow>
          )}
        </PanelSection>
      </Focusable>
    </Focusable>
  );
}
