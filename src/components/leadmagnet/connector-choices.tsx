import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, msg } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { DOCUMENTED_HOUSINGS, type DocumentedHousing } from "@/lib/leadmagnet/connector-library";
import { geometryByHousingId } from "@/lib/leadmagnet/connector-geometry";
import { connectorSummaryLines, type Termination } from "@/lib/leadmagnet/connectors";
import { ConnectorPreview, ConnectorGeometryDetails } from "./connector-preview";

/** Shared presentation only: both entry points keep DesignSpace's dossier handlers. */
export function ConnectorChoices({ termination, onSelect }: {
  termination: Termination;
  onSelect: (housing: DocumentedHousing) => void;
}) {
  useLocale();
  const selectedMpn = termination.kind === "unqualified_connector" ? termination.spec.mpn : null;
  const selected = DOCUMENTED_HOUSINGS.find(h => h.housingMpn === selectedMpn);
  const name = termination.kind === "bare_leads" ? null
    : termination.kind === "free_reference" ? termination.text
    : termination.kind === "qualified_connector"
      ? `${termination.combo.connector.manufacturer} ${termination.combo.connector.mpn}`
      : `${termination.spec.manufacturer} ${termination.spec.mpn}`;

  return <div data-testid="connector-choices" className="space-y-3">
    <p className="t-body" data-testid="connector-selection">
      {name ? <><strong>{name}</strong>{" — "}</> : null}
      {t("Compatibilité à confirmer par Standex")}
    </p>
    <p className="t-caption">{t("Boîtiers documentés par le fabricant")}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {DOCUMENTED_HOUSINGS.map(h => {
        const geometry = geometryByHousingId(h.housingMpn);
        const isSelected = h.housingMpn === selectedMpn;
        return <Button key={h.housingMpn} type="button" variant="ghost"
          className="connector-option surface-interactive h-auto min-h-11 min-w-0 flex-col items-start whitespace-normal p-4 text-left"
          aria-label={`${h.manufacturer} ${h.housingMpn}`}
          aria-pressed={isSelected} onClick={() => onSelect(h)}>
          <span className="t-title-s flex items-center gap-2">
            {isSelected ? <Check aria-hidden="true" /> : null}{h.manufacturer} {h.housingMpn}
          </span>
          <span className="t-caption">{msg("{0} voies · pas {1} mm", [h.positions, h.pitchMm])}</span>
          {geometry ? <span className="t-caption"><span className="t-metric">
            {geometry.width.valueMm} × {geometry.height.valueMm} × {geometry.depth.valueMm} mm
          </span></span> : null}
        </Button>;
      })}
    </div>
    <details data-testid="connector-technical-details">
      <summary className="t-body flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2">
        {t("Détails techniques · sources et compatibilité")}
        <span className="technical-details-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="space-y-3 pt-2">
        <p className="t-caption">{t("Quelques boîtiers documentés seulement, pas le marché entier. Boîtier, contacts à sertir et embase restent trois références distinctes ; brochage, section de fil réelle et disponibilité restent inconnus et à vérifier par les ingénieurs Standex.")}</p>
        <p className="notice-info t-caption">{t("Aucune combinaison connecteur/capteur qualifiée n'est documentée dans ce projet : toute référence saisie, sa contrepartie et son brochage restent à vérifier par les ingénieurs Standex.")}</p>
        <p className="t-caption">{t("Câble, genre des contacts, sertissage et conditions d'usage restent à confirmer avant commande.")}</p>
        {termination.kind !== "bare_leads" ? <ul className="t-caption list-disc pl-5">
          {connectorSummaryLines(termination, t).map((line, i) => <li key={i}>{line}</li>)}
        </ul> : null}
        {selected ? <ConnectorPreview housing={selected} showCaption={false} /> : null}
        <dl className="space-y-3">
          {DOCUMENTED_HOUSINGS.map(h => <div key={h.housingMpn}>
            <dt className="t-body font-semibold">{h.manufacturer} {h.housingMpn}</dt>
            <dd className="space-y-1">
              <p className="t-caption">{t("Référence du contact")} : {h.contactMpn}{" · "}
                {t("Contrepartie")} : {h.matingHeaderModel}</p>
              <p className="t-caption">{t("Plage de fil documentée")} : {h.wireRangeHint}</p>
              <ConnectorGeometryDetails housing={h} />
            </dd>
          </div>)}
        </dl>
      </div>
    </details>
  </div>;
}