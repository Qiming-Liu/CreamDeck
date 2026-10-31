import { DialogButton, Focusable, TextField, Toggle } from "@decky/ui";
import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { buttonStyle, GameRow, Help, RowLabel, secondaryStyle } from "../components/GameRow";
import { Configuration, filterDlcs, selectVisible, supportsDlcList } from "../domain/gamePage";
import type { DlcInfo } from "../utils/backend";
import { useTranslations } from "../utils/i18n";

interface Props {
  dlcs: DlcInfo[];
  config: Configuration;
  onChange: Dispatch<SetStateAction<Configuration>>;
  disabled: boolean;
}

export default function DlcPanel({ dlcs, config, onChange, disabled }: Props) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [help, setHelp] = useState(false);
  const visible = useMemo(() => filterDlcs(dlcs, query, selectedOnly, config.enabledIds), [dlcs, query, selectedOnly, config.enabledIds]);
  const selected = new Set(config.enabledIds);
  const count = dlcs.filter(dlc => selected.has(dlc.id)).length;
  const filtered = !!query.trim() || selectedOnly;
  const batch = (checked: boolean) => onChange(previous => ({ ...previous, enabledIds: selectVisible(previous.enabledIds, visible, checked) }));

  if (!supportsDlcList(config)) return <GameRow><RowLabel description={config.unlocker === "koaloader" ? t.koaloaderDlcHint : t.unlockAllHint}>
    {config.unlocker === "koaloader" ? t.noDlcSelection : t.unlockAll}
  </RowLabel></GameRow>;

  return <Focusable flow-children="column">
    <style>{".creamdeck-search .DialogInputLabelGroup { margin-bottom: 0; }"}</style>
    <GameRow className="creamdeck-search"><div style={{ flex: 1, minWidth: 0 }}>
      <TextField aria-label={t.searchDlc} label={t.searchDlc} bShowClearAction value={query} onChange={event => setQuery(event.target.value)} />
    </div></GameRow>
    <Focusable flow-children="row" style={{ display: "flex", gap: 6, alignItems: "center", margin: "10px 0", flexWrap: "wrap" }}>
      <div style={{ ...secondaryStyle, margin: 0, flex: "1 0 100%" }}>{t.dlcTitle(count, dlcs.length)}{filtered ? ` · ${t.results(visible.length)}` : ""}</div>
      <DialogButton style={buttonStyle} onClick={() => setSelectedOnly(value => !value)}>{selectedOnly ? t.showAll : t.showSelected}</DialogButton>
      <DialogButton style={buttonStyle} disabled={disabled || visible.length === 0} onClick={() => batch(true)}>{filtered ? t.selectResults : t.selectAll}</DialogButton>
      <DialogButton style={buttonStyle} disabled={disabled || visible.length === 0} onClick={() => batch(false)}>{filtered ? t.clearResults : t.deselectAll}</DialogButton>
    </Focusable>
    {dlcs.some(dlc => dlc.has_depot) && <Help label={t.depotHelp} open={help} onToggle={() => setHelp(value => !value)}>{t.depotWarningNote}</Help>}
    {dlcs.length === 0 ? <div style={{ ...secondaryStyle, padding: "16px 0" }}>{t.noDlcFound}</div>
      : visible.length === 0 ? <div style={{ ...secondaryStyle, padding: "16px 0" }}>{t.noResults}</div>
      : visible.map(dlc => <GameRow key={dlc.id}>
        <RowLabel description={<>{dlc.id}{dlc.has_depot && <span style={{ marginLeft: 10, color: "#efc27e" }}>● {t.separateContent}</span>}</>}>{dlc.name}</RowLabel>
        <div role="group" aria-label={dlc.name}><Toggle value={selected.has(dlc.id)} disabled={disabled} onChange={checked => {
          onChange(previous => ({ ...previous, enabledIds: selectVisible(previous.enabledIds, [dlc], checked) }));
        }} /></div>
      </GameRow>)}
  </Focusable>;
}
