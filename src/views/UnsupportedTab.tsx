import { Focusable, Navigation } from "@decky/ui";
import { Button, C, Icons, Main, PageTitle, StatusCard } from "../components/ui";
import { useTranslations } from "../utils/i18n";

// Shown instead of the tabs while the game has no compatibility tool selected.
export default function UnsupportedTab({ onRecheck }: { onRecheck: () => void }) {
  const t = useTranslations();
  return <Main>
    <PageTitle>{t.unsupportedTitle}</PageTitle>
    <StatusCard tone="warn" icon={Icons.warn()} title={t.notProtonTitle} align="flex-start">
      <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5, marginTop: 3 }}>{t.notProtonDetail}</div>
    </StatusCard>
    <section style={{ boxSizing: "border-box", padding: "14px 18px", borderRadius: 4, background: C.well,
      display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, color: C.muted }}>{t.howTo}</div>
      <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>{t.howToSteps}</div>
    </section>
    <div style={{ flex: "1 1 auto" }} />
    <Focusable flow-children="row" style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12,
      borderTop: `1px solid ${C.line}` }}>
      <Button variant="primary" onClick={onRecheck}>{t.recheckDone}</Button>
      <Button onClick={() => Navigation.NavigateBack()}>{t.backToGame}</Button>
    </Focusable>
  </Main>;
}
