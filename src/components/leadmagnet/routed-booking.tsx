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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  country: string | null;
  cityId?: string | null;
}) {
  useLocale();
  const [result, setResult] = useState<ContactResult | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setResult(null);
    setFailed(false);
    if (open && country)
      void fetchSalesContact(country, cityId ?? null)
        .then((r) => {
          if (live) setResult(r);
        })
        .catch(() => {
          if (live) setFailed(true);
        });
    return () => {
      live = false;
    };
  }, [open, country, cityId]);
  const contact = result?.contact;
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
        {!result && !failed && country ? (
          <p role="status" className="t-body">
            {t("Recherche de votre responsable…")}
          </p>
        ) : null}
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
        ) : result || failed || !country ? (
          <p className="notice-info t-body">
            {t(
              "Standex vérifiera votre secteur et vous recontactera. Aucun créneau n’est réservé à ce stade.",
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
