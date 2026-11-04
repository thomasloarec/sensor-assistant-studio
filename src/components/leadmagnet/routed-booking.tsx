import { useEffect, useState } from "react";
import { t } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { fetchSalesContact } from "@/lib/leadmagnet/territory-adapter";
import type { ContactResult } from "@/lib/leadmagnet/territories";
import { bookingUrl } from "@/lib/leadmagnet/sales-contact";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SalesAvatar } from "./sales-avatar";
export function RoutedBooking({
  open,
  onOpenChange,
  country,
  cityId,
  industry,
  onContactAvailabilityChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  country: string | null;
  cityId?: string | null;
  industry?: string | null;
  onContactAvailabilityChange?: (available: boolean) => void;
}) {
  useLocale();
  const lookupKey = JSON.stringify([country, cityId ?? null, industry ?? null]);
  const [result, setResult] = useState<{ lookupKey: string; value: ContactResult } | null>(null);
  useEffect(() => {
    let live = true;
    setResult(null);
    if (!open) return;
    onContactAvailabilityChange?.(false);
    if (!country) {
      onOpenChange(false);
      return;
    }
    void fetchSalesContact(country, cityId ?? null, industry ?? null)
      .then((r) => {
        if (!live) return;
        const known = r.reason === "assigned" && Boolean(r.contact?.id && r.contact?.name);
        setResult({ lookupKey, value: r });
        onContactAvailabilityChange?.(known);
        if (!known) onOpenChange(false);
      })
      .catch(() => {
        if (!live) return;
        onContactAvailabilityChange?.(false);
        onOpenChange(false);
      });
    return () => {
      live = false;
    };
  }, [open, country, cityId, industry, lookupKey, onOpenChange, onContactAvailabilityChange]);
  const contact =
    result?.lookupKey === lookupKey && result.value.reason === "assigned"
      ? result.value.contact
      : null;
  // Resolve silently before mounting the modal; never show an unassigned or stale contact.
  if (!open || !contact?.id || !contact.name) return null;
  const url = bookingUrl(contact?.booking_url ?? undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Échangez avec votre responsable Standex")}</DialogTitle>
          <DialogDescription>
            {t("Votre projet a bien été reçu. Préparons la suite ensemble.")}
          </DialogDescription>
        </DialogHeader>
        {contact ? (
          <div className="flex items-center gap-4">
            <SalesAvatar
              name={contact.name}
              photo={contact.photo_path}
              microsoftPhoto={contact.microsoft_photo_path}
              large
            />
            <p className="t-title-m">{contact.name}</p>
          </div>
        ) : null}
        {contact && url ? (
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
        ) : contact ? (
          <p className="notice-info t-body">
            {t(
              "La réservation en ligne sera bientôt disponible. Votre responsable Standex vous recontactera pour convenir d’un rendez-vous. Aucun créneau n’est réservé à ce stade.",
            )}
          </p>
        ) : null}
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("Revenir à mon projet")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
