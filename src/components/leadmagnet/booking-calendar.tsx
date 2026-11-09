import { useEffect, useMemo, useRef, useState } from "react";
import { msg, t, localeTag } from "@/lib/i18n/core";
import { Button } from "@/components/ui/button";
import {
  weekStart,
  workWeek,
  weekNavigable,
  navigateMonday,
} from "@/lib/leadmagnet/booking-calendar";
import {
  demoBookingProvider,
  type BookingProvider,
  type BookingSlot,
} from "@/lib/leadmagnet/booking-provider";
const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
/** Mounted per opening/contact. Demo is local; only the live provider can book. */
export function BookingCalendar({
  contactName,
  onClose,
  provider = demoBookingProvider,
}: {
  contactName: string;
  onClose: () => void;
  provider?: BookingProvider;
}) {
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<BookingSlot[]>([]);
  const generation = useRef(0);
  const bookingRequest = useRef<AbortController | null>(null);
  const [refresh, setRefresh] = useState(0);
  const now = useMemo(() => new Date(), [refresh]);
  const [monday, setMonday] = useState(() => weekStart(new Date()));
  const week = useMemo(() => workWeek(monday), [monday]);
  useEffect(() => {
    const request = new AbortController();
    generation.current++;
    setDay(null);
    setSlot(null);
    setAvailable([]);
    setLoading(true);
    setError(false);
    void provider
      .availability(monday, request.signal)
      .then((slots) => {
        if (!request.signal.aborted) {
          setAvailable(slots);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!request.signal.aborted) {
          setLoading(false);
          setError(true);
        }
      });
    return () => {
      request.abort();
      bookingRequest.current?.abort();
      generation.current++;
    };
  }, [monday, provider, refresh]);
  const navigate = (delta: number, unit: "month" | "week") =>
    setMonday(navigateMonday(monday, now, delta, unit));
  const slotsFor = (d: Date) =>
    available.filter((s) => new Date(s.start).toDateString() === d.toDateString());
  const tag = localeTag();
  const dayLabel = (d: Date) =>
    d.toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" });
  const timeLabel = (d: Date) => d.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });
  const monthLabel = (d: Date) => d.toLocaleDateString(tag, { month: "long", year: "numeric" });
  const selectedDay = day ? new Date(day) : null;
  const slots = selectedDay ? slotsFor(selectedDay) : [];
  const close = onClose;
  return confirmed ? (
    <div className="panel-block-lg space-y-2" data-testid="booking-confirmation">
      <p className="t-title-s">
        {t(
          provider.mode === "demo"
            ? "Votre rendez-vous de démonstration est confirmé"
            : "Votre rendez-vous est confirmé",
        )}
      </p>
      <p className="t-metric">{confirmed}</p>
      <p className="t-body">{contactName}</p>
      {provider.mode === "demo" ? (
        <p className="notice-warning t-body">
          {t(
            "Démonstration terminée : aucune réservation réelle ni invitation n'a été créée. Ce créneau sert uniquement à présenter le parcours de prise de rendez-vous.",
          )}
        </p>
      ) : (
        <p className="notice-success t-body">
          {t("Votre invitation sera envoyée par Microsoft Outlook.")}
        </p>
      )}
      <Button variant="outline" onClick={close}>
        {t("Revenir à mon projet")}
      </Button>
    </div>
  ) : (
    <div className="space-y-4" data-testid="booking-calendar">
      {provider.mode === "demo" && (
        <p className="notice-info t-caption">
          {t(
            "Démonstration : aucun agenda réel n’est consulté et aucune invitation ne sera envoyée.",
          )}
        </p>
      )}
      <p className="t-caption">
        {localTimeZone()} · {t("30 minutes")}
      </p>
      {loading && (
        <p role="status" className="t-body">
          {t("Chargement des horaires…")}
        </p>
      )}
      <fieldset className="space-y-3">
        <legend className="t-label">{t("Choisissez une date")}</legend>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 min-w-11 w-11 px-0"
              aria-label={t("Mois précédent")}
              disabled={busy || !weekNavigable(monday, now, -1, "month")}
              onClick={() => navigate(-1, "month")}
            >
              «
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 min-w-11 w-11 px-0"
              aria-label={t("Semaine précédente")}
              disabled={busy || !weekNavigable(monday, now, -1, "week")}
              onClick={() => navigate(-1, "week")}
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
              className="min-h-11 min-w-11 w-11 px-0"
              aria-label={t("Semaine suivante")}
              disabled={busy || !weekNavigable(monday, now, 1, "week")}
              onClick={() => navigate(1, "week")}
            >
              ›
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 min-w-11 w-11 px-0"
              aria-label={t("Mois suivant")}
              disabled={busy || !weekNavigable(monday, now, 1, "month")}
              onClick={() => navigate(1, "month")}
            >
              »
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2" data-testid="booking-week">
          {week.map((d) => {
            const value = d.toISOString();
            const active = value === day;
            const enabled = !busy && slotsFor(d).length > 0;
            return (
              <Button
                key={value}
                type="button"
                variant={active ? "default" : "outline"}
                className="min-h-16 flex-col gap-0 px-1 t-body"
                aria-pressed={active}
                aria-label={dayLabel(d)}
                disabled={!enabled}
                onClick={() => {
                  setDay(value);
                  setSlot(null);
                  setError(false);
                }}
              >
                <span className="t-caption text-inherit">
                  {d.toLocaleDateString(tag, { weekday: "short" })}
                </span>
                <span className="t-metric text-inherit">{d.getDate()}</span>
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
              const value = s.start;
              const active = value === slot;
              return (
                <Button
                  key={value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className="min-h-11 t-body"
                  aria-pressed={active}
                  disabled={busy}
                  onClick={() => setSlot(value)}
                >
                  <span className="t-metric text-inherit">{timeLabel(new Date(s.start))}</span>
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
        {error ? (
          <p role="alert" className="notice-warning t-body">
            {t(
              "La réservation n’a pas pu être confirmée. Vérifiez votre calendrier avant de réessayer.",
            )}
          </p>
        ) : null}
        {!loading && available.length === 0 && !error && (
          <p role="status" className="t-body">
            {t("Aucun horaire cette semaine. Choisissez une autre semaine.")}
          </p>
        )}
        {error && (
          <Button variant="outline" onClick={() => setRefresh((n) => n + 1)}>
            {t("Réessayer")}
          </Button>
        )}
        <Button
          disabled={!slot || busy || loading}
          onClick={async () => {
            if (bookingRequest.current) return;
            const chosen = available.find((s) => s.start === slot);
            if (!chosen || !selectedDay) return;
            const request = new AbortController();
            bookingRequest.current = request;
            const current = generation.current;
            setBusy(true);
            setError(false);
            try {
              const receipt = await provider.reserve(chosen, request.signal);
              if (!request.signal.aborted && current === generation.current)
                setConfirmed(
                  msg("{0} à {1} ({2})", [
                    dayLabel(new Date(receipt.start)),
                    timeLabel(new Date(receipt.start)),
                    localTimeZone(),
                  ]),
                );
            } catch {
              if (!request.signal.aborted && current === generation.current) {
                setSlot(null);
                setError(true);
              }
            } finally {
              if (bookingRequest.current === request) bookingRequest.current = null;
              if (!request.signal.aborted && current === generation.current) setBusy(false);
            }
          }}
        >
          {t(busy ? "Confirmation en cours…" : "Confirmer ce créneau")}
        </Button>
        <Button variant="outline" onClick={close}>
          {t("Revenir à mon projet")}
        </Button>
      </div>
    </div>
  );
}
