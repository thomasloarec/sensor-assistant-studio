import { t } from "@/lib/i18n/core";
import type { Contact } from "@/lib/standex/magnetic-workshop";

/** A readout of the simulation's contact, never a second electrical model. */
export default function ContactCircuit({ contact }: { contact: Contact }) {
  const closed = contact === "closed";
  const unknown = contact === "unknown";
  const label = t(unknown
    ? "Circuit indéterminé : lampe grisée"
    : closed
      ? "Circuit illustré fermé : lampe allumée"
      : "Circuit illustré ouvert : lampe éteinte");

  return (
    <div className="mw-contact-circuit" data-contact={contact} role="img" aria-label={label}>
      <svg viewBox="0 0 208 86" aria-hidden="true">
        {/* The source, reed and lamp are in series, with gaps at each symbol. */}
        <path className="mw-mini-wire" d="M24 39 V20 H78 M130 20 H178 V35 M178 61 V74 H24 V53" />
        <path className="mw-mini-source" d="M14 39 H34 M18 46 H30 M14 53 H34" />
        <rect className="mw-mini-capsule" x="71" y="8" width="66" height="25" rx="12" />
        {!unknown && <path className="mw-mini-switch" d="M78 20 H114" />}
        <path className="mw-mini-wire" d="M115 20 H130" />
        <circle className="mw-mini-terminal" cx="78" cy="20" r="2.5" />
        <circle className="mw-mini-terminal" cx="114" cy="20" r="2.5" />
        {closed && <path className="mw-mini-current" d="M24 20 H178 V74 H24 Z" />}
        <circle className="mw-mini-bulb" cx="178" cy="48" r="13" />
        <path className="mw-mini-filament" d="M172 42 L184 54 M184 42 L172 54" />
        {closed && <path className="mw-mini-rays" d="M178 28 V25 M198 48 H201 M194 32 L197 29 M194 64 L197 67 M158 48 H155" />}
        {unknown ? <text x="104" y="25" textAnchor="middle">?</text> : null}
        <text x="104" y="57" textAnchor="middle">{t("Reed")}</text>
      </svg>
      <span className="t-caption">{t(unknown ? "État indéterminé" : closed ? "Lampe allumée" : "Lampe éteinte")}</span>
    </div>
  );
}
