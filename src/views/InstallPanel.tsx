import { DialogButton, Dropdown, Focusable, Toggle } from "@decky/ui";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { buttonStyle, GameRow, Help, RowLabel, secondaryStyle } from "../components/GameRow";
import { AUTOLOAD_CHOICES, Configuration, proxyChoices, selectUnlocker } from "../domain/gamePage";
import type { UnlockerInfo } from "../utils/backend";
import { useTranslations } from "../utils/i18n";
import { useWineDllOverride } from "../hooks/useWineDllOverride";

interface Props {
  appId: string;
  config: Configuration;
  onChange: Dispatch<SetStateAction<Configuration>>;
  unlockers: UnlockerInfo[];
  installed: boolean;
  disabled: boolean;
  onLaunchBusy: (busy: boolean) => void;
}

export default function InstallPanel({ appId, config, onChange, unlockers, installed, disabled, onLaunchBusy }: Props) {
  const t = useTranslations();
  const [help, setHelp] = useState(false);
  const choices = proxyChoices(config.unlocker);
  const info = unlockers.find(unlocker => unlocker.key === config.unlocker);
  const locked = installed || disabled;
  const launch = useWineDllOverride(Number(appId), config.proxyDll, config.proxy && choices.length > 0, onLaunchBusy);

  return <Focusable flow-children="column">
    {!installed && <div style={{ ...secondaryStyle, marginBottom: 12, lineHeight: 1.6 }}>{t.defaultSetupHint}</div>}
    {installed && <div style={{ ...secondaryStyle, marginBottom: 12 }}>{t.settingsLocked}</div>}
    <GameRow><RowLabel description={info?.detected ? t.targetDetected : config.unlocker === "koaloader" ? t.loaderHint : t.targetNotDetected}>{t.unlockerTitle}</RowLabel>
      <div style={{ width: "52%", minWidth: 140 }}><Dropdown disabled={locked} selectedOption={config.unlocker}
        rgOptions={unlockers.map(unlocker => ({ data: unlocker.key, label: `${unlocker.label}${unlocker.detected ? " ✓" : ""}` }))}
        onChange={option => onChange(previous => selectUnlocker(previous, option.data))} /></div>
    </GameRow>
    {choices.length > 0 && <>
      <GameRow><RowLabel description={t.installModeHint}>{t.installMode}</RowLabel>
        <div style={{ width: "52%", minWidth: 140 }}><Dropdown disabled={locked || config.unlocker === "koaloader"} selectedOption={config.proxy}
          rgOptions={[{ data: true, label: t.proxyModeTitle }, { data: false, label: t.directMode }]}
          onChange={option => onChange(previous => ({ ...previous, proxy: option.data }))} /></div>
      </GameRow>
      {config.proxy && <>
        <GameRow><RowLabel>{t.proxyFile}</RowLabel><div style={{ width: "52%", minWidth: 140 }}>
          <Dropdown disabled={locked} selectedOption={config.proxyDll} rgOptions={choices.map(name => ({ data: name, label: `${name}.dll` }))}
            onChange={option => onChange(previous => ({ ...previous, proxyDll: option.data }))} />
        </div></GameRow>
        <GameRow><RowLabel description={<>{t.launchOptionHint}<br /><code>{`WINEDLLOVERRIDES="${config.proxyDll}=n,b"`}</code></>}>{t.protonLaunchOption}</RowLabel>
          <div role="group" aria-label={t.protonLaunchOption}><Toggle value={launch.enabled}
            disabled={disabled || launch.loading || launch.saving || !launch.editable} onChange={enabled => { void launch.toggle(enabled); }} /></div>
        </GameRow>
        {(launch.loading || launch.saving || launch.changed) && <div role="status" style={{ ...secondaryStyle, margin: "8px 0 12px" }}>
          {launch.loading ? t.launchOptionReading : launch.saving ? t.working : t.launchOptionChanged}
        </div>}
        {launch.error && <GameRow><RowLabel description={launch.error === "unsupported" ? t.launchOptionUnsupported : t.launchOptionSwitchError}>{t.launchOptionFailed}</RowLabel>
          <DialogButton style={buttonStyle} disabled={disabled || launch.saving} onClick={launch.retry}>{t.retry}</DialogButton>
        </GameRow>}
        <Help label={t.proxyHelp} open={help} onToggle={() => setHelp(value => !value)}>{t.protonOverrideNote(config.proxyDll)}</Help>
      </>}
    </>}
    {config.unlocker === "koaloader" && <>
      <h3 style={{ fontSize: 16, margin: "18px 0 10px" }}>{t.koaloaderAutoloadTitle}</h3>
      {AUTOLOAD_CHOICES.map(key => {
        const unlocker = unlockers.find(value => value.key === key);
        return <GameRow key={key}><RowLabel description={unlocker?.detected ? t.detectedInGame : undefined}>{unlocker?.label ?? key}</RowLabel>
          <div role="group" aria-label={unlocker?.label ?? key}><Toggle value={config.autoload.includes(key)} disabled={locked} onChange={checked => {
            onChange(previous => ({ ...previous, autoload: checked ? [...new Set([...previous.autoload, key])] : previous.autoload.filter(value => value !== key) }));
          }} /></div>
        </GameRow>;
      })}
    </>}
  </Focusable>;
}
