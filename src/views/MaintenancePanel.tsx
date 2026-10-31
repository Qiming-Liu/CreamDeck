import { DialogButton, Focusable } from "@decky/ui";
import { useState } from "react";
import { buttonStyle, GameRow, Help, RowLabel, secondaryStyle } from "../components/GameRow";
import type { Configuration } from "../domain/gamePage";
import type { GamePage } from "../utils/backend";
import { useTranslations } from "../utils/i18n";

export default function MaintenancePanel({ page, config, disabled, onUninstall, onCleanup }: {
  page?: GamePage; config: Configuration; disabled: boolean; onUninstall: () => void; onCleanup: () => void;
}) {
  const t = useTranslations();
  const [help, setHelp] = useState(false);
  const label = page?.unlockers?.find(value => value.key === config.unlocker)?.label ?? config.unlocker;
  return <Focusable flow-children="column">
    <GameRow><RowLabel description={page?.installed ? `${label} · ${page.proxy_dll ? `${t.proxyModeTitle} (${page.proxy_dll}.dll)` : config.unlocker === "koaloader" ? t.proxyModeTitle : t.directMode}` : t.notInstalled}>{t.currentInstall}</RowLabel></GameRow>
    {page?.installed && <GameRow><RowLabel description={t.uninstallHint}>{t.uninstall}</RowLabel>
      <DialogButton style={{ ...buttonStyle, background: "#a9323b", color: "#fff" }} disabled={disabled} onClick={onUninstall}>{t.uninstall}</DialogButton>
    </GameRow>}
    {page?.integrity_error && <>
      <h3 style={{ fontSize: 16, color: "#efc27e", margin: "18px 0 8px" }}>{t.integrityTitle}</h3>
      <div style={{ ...secondaryStyle, marginBottom: 12 }}>{t.integritySummary}</div>
      <GameRow><RowLabel description={t.cleanupHint}>{t.cleanupTitle}</RowLabel>
        <DialogButton style={{ ...buttonStyle, background: "#a9323b", color: "#fff" }} disabled={disabled} onClick={onCleanup}>{t.cleanupTitle}</DialogButton>
      </GameRow>
      <Help label={t.details} open={help} onToggle={() => setHelp(value => !value)}>{page.integrity_error}<br />{t.integrityHint}</Help>
    </>}
    <div style={{ ...secondaryStyle, marginTop: 16, lineHeight: 1.6 }}>{t.maintenanceHint}</div>
  </Focusable>;
}
