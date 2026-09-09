import { t } from "@/lib/i18n/core";
import { CircleHelp, Lightbulb, Zap, Unplug } from "lucide-react";
import type { Contact } from "@/lib/standex/magnetic-workshop";

export default function ContactIndicator({ contact }: { contact: Contact }) {
  const closed = contact === "closed",
    unknown = contact === "unknown";
  return (
    <section
      className={`mw-contact-indicator ${contact}`}
      aria-label={t("Lecture électrique du contact")}
    >
      <div className="mw-contact-copy" role="status" aria-live="polite">
        <span className="mw-contact-badge">
          {closed ? <Zap size={20} /> : unknown ? <CircleHelp size={20} /> : <Unplug size={20} />}
        </span>
        <div>
          <p>{t("À L'INTÉRIEUR DU CAPTEUR")}</p>
          <h2>{t(closed ? "Contact fermé" : unknown ? "État indéterminé" : "Contact ouvert")}</h2>
          <span>
            {t(
              closed
                ? "Les lames se touchent. Le courant circule dans le circuit illustré."
                : unknown
                  ? "Le modèle ne permet pas de conclure sur ce montage."
                  : "Les lames sont séparées. Le courant est interrompu.",
            )}
          </span>
        </div>
      </div>
      <svg
        className="mw-circuit"
        viewBox="0 0 330 108"
        role="img"
        aria-label={t(
          closed
            ? "Circuit illustré fermé : lampe allumée"
            : unknown
              ? "Circuit indéterminé : lampe grisée"
              : "Circuit illustré ouvert : lampe éteinte",
        )}
      >
        <path className="mw-wire" d="M105 27 H26 V83 H136 M168 83 H294 V27 H224" />
        <rect className="mw-reed-capsule" x="92" y="9" width="143" height="38" rx="19" />
        <path
          className="mw-blade"
          d={
            closed
              ? "M105 27 H169 M224 27 H159"
              : unknown
                ? "M105 27 L167 18 M224 27 H174"
                : "M105 27 L164 15 M224 27 H174"
          }
        />
        <circle className="mw-contact-dot" cx={closed ? 164 : 174} cy="27" r="4" />
        {closed && <path className="mw-current" d="M26 27 H294 V83 H26 Z" />}
        <path className="mw-battery" d="M147 70 V96 M159 75 V91 M136 83 H147 M159 83 H168" />
        <circle className="mw-lamp" cx="294" cy="56" r="12" />
        <path className="mw-lamp-filament" d="M288 50 L300 62 M300 50 L288 62" />
        <text x="163" y="63" textAnchor="middle">
          {t(closed ? "Passage du courant" : unknown ? "Non déterminé" : "Circuit interrompu")}
        </text>
      </svg>
      <p className="mw-circuit-note">
        <Lightbulb size={13} />
        {t("Circuit alimenté fictif · aucun courant réel calculé")}
      </p>
    </section>
  );
}
