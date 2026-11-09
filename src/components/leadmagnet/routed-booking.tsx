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
  loadContact = fetchSalesContact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  country: string | null;
  cityId?: string | null;
  industry?: string | null;
  loadContact?: typeof fetchSalesContact;
}) {
  useLocale();
  const lookupKey = JSON.stringify([country, cityId ?? null, industry ?? null]);
  const [result, setResult] = useState<{ lookupKey: string; value: ContactResult } | null>(null);
  useEffect(() => {
    let live = true;
    setResult(null);
    if (!open) return;
    if (!country) {
      return;
    }
    void loadContact(country, cityId ?? null, industry ?? null)
      .then((r) => {
        if (!live) return;
        setResult({ lookupKey, value: r });
      })
      .catch(() => {
        // Routing is supplementary: a lookup failure never alters confirmation.
      });
    return () => {
      live = false;
    };
  }, [open, country, cityId, industry, lookupKey, loadContact]);
  const contact =
    result?.lookupKey === lookupKey && result.value.reason === "assigned"
      ? result.value.contact
      : null;
  // Submission is already confirmed. Routing must never dismiss that next step.
  if (!open) return null;
  const known = Boolean(contact?.id && contact.name);
  const url = bookingUrl(contact?.booking_url ?? undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Projet envoyé")}</DialogTitle>
          <DialogDescription>
            {t("Merci ! Votre projet a bien été reçu par Standex.")}
          </DialogDescription>
        </DialogHeader>
        {known && contact ? (
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
        {known && url ? (
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
        ) : null}
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("Revenir à mon projet")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
