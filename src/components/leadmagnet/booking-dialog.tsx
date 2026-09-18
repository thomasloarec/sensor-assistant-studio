import { useEffect, useMemo, useState } from "react";
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
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(days) || days < 0 || days > 60) return [];
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
  if (day.getDay() === 0 || day.getDay() === 6) return [];
  return SLOT_MINUTES.map(
    (minutes) =>
      new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60),
  ).filter((slot) => slot.getTime() > now.getTime());
}

/* --------------------------------------------------------------------------
 * Calendrier : semaine de travail lundi → vendredi, navigation par semaine et
 * par mois. La navigation est purement locale à cet écran : elle ne lit ni
 * n'écrit aucun agenda, et un jour sans créneau futur reste non sélectionnable.
 * ------------------------------------------------------------------------ */
const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Lundi de la semaine contenant `d`. */
export function weekStart(d: Date): Date {
  const base = dayOnly(d);
  const shift = (base.getDay() + 6) % 7; // lundi = 0
  base.setDate(base.getDate() - shift);
  return base;
}

/** Les cinq jours ouvrés de la semaine commençant au lundi `monday`. */
export function workWeek(monday: Date): Date[] {
  const start = weekStart(monday);
  return [0, 1, 2, 3, 4].map((i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Premier lundi qui tombe RÉELLEMENT dans le mois de `d`. */
function firstMondayInMonth(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const shift = (8 - first.getDay()) % 7; // 0 si le 1er est déjà un lundi
  return dayOnly(new Date(first.getFullYear(), first.getMonth(), 1 + shift));
}

/**
 * Décalage de semaines (`unit: "week"`) ou de mois (`unit: "month"`).
 *
 * Pour un mois, on vise le premier lundi SITUÉ DANS le mois cible. Prendre le
 * lundi de la semaine du 1er ramenait dans le mois précédent (28 septembre pour
 * octobre, 30 novembre pour décembre) et le libellé du mois semblait bloqué.
 */
export function shiftWeek(monday: Date, delta: number, unit: "week" | "month"): Date {
  const d = weekStart(monday);
  if (unit === "week") {
    d.setDate(d.getDate() + delta * 7);
    return weekStart(d);
  }
  // Le mois affiché est celui du lundi de la semaine (libellé monthLabel(monday)).
  return firstMondayInMonth(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

/** Un jour n'est proposé que s'il lui reste au moins un créneau futur. */
export function daySelectable(day: Date, now: Date): boolean {
  return demoSlots(day, now).length > 0;
}

/**
 * Semaine réellement atteinte : revenir au mois en cours ramène à la semaine
 * courante, pas à un lundi déjà passé. Les deux boutons et leur état désactivé
 * utilisent cette même valeur, donc l'affichage ne peut pas mentir.
 */
export function navigateMonday(monday: Date, now: Date, delta: number, unit: "week" | "month"): Date {
  const target = shiftWeek(monday, delta, unit);
  const floor = weekStart(now);
  if (unit === "month" && target.getTime() < floor.getTime()) {
    const sameMonth =
      target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth();
    if (sameMonth) return floor;
  }
  return target;
}

/** Navigation bornée : jamais avant la semaine en cours, jamais au-delà d'un an. */
export function weekNavigable(monday: Date, now: Date, delta: number, unit: "week" | "month"): boolean {
  const target = navigateMonday(monday, now, delta, unit);
  const floor = weekStart(now);
  const ceiling = weekStart(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()));
  if (target.getTime() === weekStart(monday).getTime()) return false;
  return target.getTime() >= floor.getTime() && target.getTime() <= ceiling.getTime();
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
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { setDay(null); setSlot(null); setConfirmed(null); setError(false); }, [open, country]);
  // L'instant de référence est figé à l'ouverture : la liste ne doit pas changer
  // sous les doigts de la personne pendant qu'elle choisit.
  const now = useMemo(() => new Date(), [open, country, refresh]);
  const [monday, setMonday] = useState(() => weekStart(new Date()));
  useEffect(() => {
    if (open) setMonday(weekStart(new Date()));
  }, [open, country]);
  const week = useMemo(() => workWeek(monday), [monday]);
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
  const monthLabel = (d: Date) => d.toLocaleDateString(tag, { month: "long", year: "numeric" });
  const selectedDay = day ? new Date(day) : null;
  const slots = selectedDay ? demoSlots(selectedDay, now) : [];
  const close = () => {
    setDay(null);
    setSlot(null);
    setConfirmed(null);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
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
            <p className="t-title-s">{t("Votre rendez-vous de démonstration est confirmé")}</p>
            <p className="t-metric">{confirmed}</p>
            <p className="t-body">{msg("Avec {0}, {1}.", [contact.name, t(contact.territory)])}</p>
            <p className="notice-warning t-body">
              {t(
                "Démonstration terminée : aucune réservation réelle ni invitation n'a été créée. Ce créneau sert uniquement à présenter le parcours de prise de rendez-vous.",
              )}
            </p>
            <Button variant="outline" onClick={close}>
              {t("Revenir à mon projet")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4" data-testid="booking-calendar">
            <fieldset className="space-y-3">
              <legend className="t-label">{t("Choisissez une date")}</legend>
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 min-w-11"
                    aria-label={t("Mois précédent")}
                    disabled={!weekNavigable(monday, now, -1, "month")}
                    onClick={() => setMonday(navigateMonday(monday, now, -1, "month"))}
                  >
                    «
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 min-w-11"
                    aria-label={t("Semaine précédente")}
                    disabled={!weekNavigable(monday, now, -1, "week")}
                    onClick={() => setMonday(navigateMonday(monday, now, -1, "week"))}
                  >
                    ‹
                  </Button>
                </div>
                <p className="t-title-s text-center" aria-live="polite">
                  {monthLabel(monday)}
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 min-w-11"
                    aria-label={t("Semaine suivante")}
                    disabled={!weekNavigable(monday, now, 1, "week")}
                    onClick={() => setMonday(navigateMonday(monday, now, 1, "week"))}
                  >
                    ›
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 min-w-11"
                    aria-label={t("Mois suivant")}
                    disabled={!weekNavigable(monday, now, 1, "month")}
                    onClick={() => setMonday(navigateMonday(monday, now, 1, "month"))}
                  >
                    »
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2" data-testid="booking-week">
                {week.map((d) => {
                  const value = d.toISOString();
                  const active = value === day;
                  const enabled = daySelectable(d, now);
                  return (
                    <Button
                      key={value}
                      type="button"
                      variant={active ? "default" : "outline"}
                      className="min-h-16 flex-col gap-0 px-1 text-base"
                      aria-pressed={active}
                      aria-label={dayLabel(d)}
                      disabled={!enabled}
                      onClick={() => {
                        setDay(value);
                        setSlot(null);
                        setError(false);
                      }}
                    >
                      <span className="t-caption">
                        {d.toLocaleDateString(tag, { weekday: "short" })}
                      </span>
                      <span className="t-metric">{d.getDate()}</span>
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
              {error ? <p role="alert" className="notice-warning t-body">{t("Ce créneau est passé. Choisissez un nouvel horaire.")}</p> : null}
              <Button
                disabled={!slot}
                onClick={() => {
                  if (!selectedDay || !slot || !demoSlots(selectedDay, new Date()).some(s => s.toISOString() === slot)) {
                    setSlot(null); setError(true); setRefresh(n => n + 1); return;
                  }
                  setConfirmed(
                    msg("{0} à {1} ({2})", [
                      dayLabel(selectedDay!),
                      timeLabel(new Date(slot!)),
                      localTimeZone(),
                    ]),
                  );
                }}
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
