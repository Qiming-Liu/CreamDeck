import { DialogButton, Dropdown, Focusable, TextField, Toggle } from "@decky/ui";
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { buttonStyle, GameRow, Help, RowLabel, secondaryStyle } from "../components/GameRow";
import { Configuration, proxyChoices, selectUnlocker } from "../domain/gamePage";
import type { GamePage, UnlockerInfo } from "../utils/backend";
import { useTranslations } from "../utils/i18n";
import { useWineDllOverride } from "../hooks/useWineDllOverride";

interface Props {
  config: Configuration;
  onChange: Dispatch<SetStateAction<Configuration>>;
  unlockers: UnlockerInfo[];
  installed: boolean;
  disabled: boolean;
  page?: GamePage;
  onTarget: (directory: string) => void;
  launch: ReturnType<typeof useWineDllOverride>;
}

export default function InstallPanel({ config, onChange, unlockers, installed, disabled, page, onTarget, launch }: Props) {
  const t = useTranslations();
  const [help, setHelp] = useState(false);
  const [directory, setDirectory] = useState(page?.target_directory ?? ".");
  useEffect(() => { setDirectory(page?.target_directory ?? "."); }, [page?.target_directory]);
  const choices = proxyChoices(config.unlocker);
  const info = unlockers.find(unlocker => unlocker.key === config.unlocker);
  const locked = installed || disabled;

  return <Focusable flow-children="column">
    <GameRow><RowLabel description={t.targetDirectoryHint}>{t.targetDirectory}</RowLabel>
      <div style={{ width: "52%", minWidth: 140, overflowWrap: "anywhere" }}>{page?.target_directory ?? "."}</div>
    </GameRow>
    {(page?.targets?.length ?? 0) > 0 && <GameRow><RowLabel>{t.detectedDirectories}</RowLabel>
      <div style={{ width: "52%", minWidth: 140 }}><Dropdown disabled={locked} selectedOption={page?.target_directory ?? "."}
        rgOptions={(page?.targets ?? []).map(target => ({ data: target.path, label: `${target.path} · ${target.bitness}-bit${target.detected ? " ✓" : ""}` }))}
        onChange={option => onTarget(option.data)} /></div>
    </GameRow>}
    <GameRow><RowLabel description={t.manualDirectoryHint}>{t.manualDirectory}</RowLabel>
      <div style={{ width: "52%", minWidth: 140 }}>
        <TextField disabled={locked} value={directory} onChange={event => setDirectory(event.target.value)} />
        <DialogButton style={{ ...buttonStyle, marginTop: 8 }} disabled={locked || !directory.trim()}
          onClick={() => onTarget(directory.trim())}>{t.useDirectory}</DialogButton>
      </div>
    </GameRow>
    {!installed && <div style={{ ...secondaryStyle, marginBottom: 12, lineHeight: 1.6 }}>{t.defaultSetupHint}</div>}
    {installed && <div style={{ ...secondaryStyle, marginBottom: 12 }}>{t.settingsLocked}</div>}
    <GameRow><RowLabel description={info?.detected ? t.targetDetected : t.targetNotDetected}>{t.unlockerTitle}</RowLabel>
      <div style={{ width: "52%", minWidth: 140 }}><Dropdown disabled={locked} selectedOption={config.unlocker}
        rgOptions={unlockers.map(unlocker => ({ data: unlocker.key, label: `${unlocker.label}${unlocker.detected ? " ✓" : ""}` }))}
        onChange={option => onChange(previous => selectUnlocker(previous, option.data))} /></div>
    </GameRow>
    {choices.length > 0 && <>
      <GameRow><RowLabel description={t.installModeHint}>{t.installMode}</RowLabel>
        <div style={{ width: "52%", minWidth: 140 }}><Dropdown disabled={locked} selectedOption={config.proxy}
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
        {(launch.loading || launch.saving) && <div role="status" style={{ ...secondaryStyle, margin: "8px 0 12px" }}>
          {launch.loading ? t.launchOptionReading : t.working}
        </div>}
        {launch.error && <GameRow><RowLabel description={launch.error === "unsupported" ? t.launchOptionUnsupported : t.launchOptionSwitchError}>{t.launchOptionFailed}</RowLabel>
          <DialogButton style={buttonStyle} disabled={disabled || launch.saving} onClick={launch.retry}>{t.retry}</DialogButton>
        </GameRow>}
        <Help label={t.proxyHelp} open={help} onToggle={() => setHelp(value => !value)}>{t.protonOverrideNote(config.proxyDll)}</Help>
      </>}
    </>}
  </Focusable>;
}
