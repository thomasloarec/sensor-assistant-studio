import { useMemo, useState } from "react";
import { msg, t, localeTag } from "@/lib/i18n/core";
import { salesContactFor, bookingUrl } from "@/lib/leadmagnet/sales-contact";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Créneaux proposés en démonstration : demi-heures d'une journée de travail.
 *  Ce ne sont PAS les disponibilités réelles du responsable : aucun agenda n'est
 *  lu, aucune écriture n'est faite, aucune invitation n'est envoyée. */
const SLOT_MINUTES = [9 * 60, 9 * 60 + 30, 10 * 60, 10 * 60 + 30, 11 * 60, 14 * 60, 14 * 60 + 30, 15 * 60, 15 * 60 + 30, 16 * 60] as const;
const OPEN_DAYS = 10;

/** Jours ouvrés à venir, à partir d'aujourd'hui. Un jour n'est proposé que s'il
 *  lui reste au moins un créneau dans le futur. */
export function demoDays(now: Date, days = OPEN_DAYS): Date[] {
  const out: Date[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (out.length < days) {
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6 && demoSlots(cursor, now).length > 0)
      out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Créneaux d'un jour, strictement postérieurs à l'instant présent. */
export function demoSlots(day: Date, now: Date): Date[] {
  return SLOT_MINUTES.map(
    (minutes) =>
      new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60),
  ).filter((slot) => slot.getTime() > now.getTime());
}

const localTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export function BookingDialog({
  open,
  onOpenChange,
  country,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  country: string | null;
}) {
  const contact = salesContactFor(country);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  // L'instant de référence est figé à l'ouverture : la liste ne doit pas changer
  // sous les doigts de la personne pendant qu'elle choisit.
  const now = useMemo(() => new Date(), [open]);
  const days = useMemo(() => demoDays(now), [now]);
  if (!contact) return null;
  const url = bookingUrl(
    {
      france: import.meta.env["VITE_BOOKING_FRANCE_URL"],
      germany: import.meta.env["VITE_BOOKING_GERMANY_URL"],
      international: import.meta.env["VITE_BOOKING_INTERNATIONAL_URL"],
    }[contact.id],
  );
  const tag = localeTag();
  const dayLabel = (d: Date) =>
    d.toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" });
  const timeLabel = (d: Date) => d.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });
  const selectedDay = days.find((d) => d.toISOString() === day) ?? null;
  const slots = selectedDay ? demoSlots(selectedDay, now) : [];
  const close = () => {
    setDay(null);
    setSlot(null);
    setConfirmed(null);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Échangez avec votre responsable Standex")}</DialogTitle>
          <DialogDescription>
            {t("Votre projet a bien été reçu. Préparons la suite ensemble.")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-5">
          <img
            src={contact.photo}
            alt={contact.name}
            width={112}
            height={112}
            className="h-28 w-28 rounded-[var(--r-pill)] object-cover"
          />
          <div>
            <p className="t-title-m">{contact.name}</p>
            <p className="t-body">{t(contact.territory)}</p>
          </div>
        </div>
        {url ? (
          <>
            <p className="t-body">
              {t(
                "Choisissez une date et un horaire dans le calendrier de votre interlocuteur. La confirmation et les invitations vous seront envoyées par le service de réservation.",
              )}
            </p>
            <Button asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {t("Choisir mon rendez-vous")}
              </a>
            </Button>
          </>
        ) : confirmed ? (
          <div className="panel-block-lg space-y-2" data-testid="booking-confirmation">
            <p className="t-title-s">{t("Votre souhait de rendez-vous est noté")}</p>
            <p className="t-metric">{confirmed}</p>
            <p className="t-body">{msg("Avec {0}, {1}.", [contact.name, t(contact.territory)])}</p>
            <p className="notice-warning t-body">
              {t(
                "Mode démonstration : aucun agenda n'est consulté ni modifié, et aucune invitation n'est envoyée. Votre responsable Standex vous recontactera pour confirmer ce créneau.",
              )}
            </p>
            <Button variant="outline" onClick={close}>
              {t("Revenir à mon projet")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4" data-testid="booking-calendar">
            <p className="notice-info t-body">
              {t(
                "Mode démonstration : les créneaux affichés sont des exemples, pas les disponibilités réelles de votre responsable. Choisir un créneau n'écrit dans aucun agenda.",
              )}
            </p>
            <fieldset className="space-y-2">
              <legend className="t-label">{t("Choisissez une date")}</legend>
              <div className="flex flex-wrap gap-2">
                {days.map((d) => {
                  const value = d.toISOString();
                  const active = value === day;
                  return (
                    <Button
                      key={value}
                      type="button"
                      variant={active ? "default" : "outline"}
                      className="min-h-11 text-base"
                      aria-pressed={active}
                      onClick={() => {
                        setDay(value);
                        setSlot(null);
                      }}
                    >
                      {dayLabel(d)}
                    </Button>
                  );
                })}
              </div>
            </fieldset>
            {selectedDay ? (
              <fieldset className="space-y-2">
                <legend className="t-label">{t("Choisissez un horaire")}</legend>
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => {
                    const value = s.toISOString();
                    const active = value === slot;
                    return (
                      <Button
                        key={value}
                        type="button"
                        variant={active ? "default" : "outline"}
                        className="min-h-11 text-base"
                        aria-pressed={active}
                        onClick={() => setSlot(value)}
                      >
                        <span className="t-metric">{timeLabel(s)}</span>
                      </Button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
            {selectedDay && slot ? (
              <p className="t-body" data-testid="booking-recap">
                {msg("{0} à {1} ({2})", [
                  dayLabel(selectedDay),
                  timeLabel(new Date(slot)),
                  localTimeZone(),
                ])}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!slot}
                onClick={() =>
                  setConfirmed(
                    msg("{0} à {1} ({2})", [
                      dayLabel(selectedDay!),
                      timeLabel(new Date(slot!)),
                      localTimeZone(),
                    ]),
                  )
                }
              >
                {t("Confirmer ce créneau")}
              </Button>
              <Button variant="outline" onClick={close}>
                {t("Revenir à mon projet")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
