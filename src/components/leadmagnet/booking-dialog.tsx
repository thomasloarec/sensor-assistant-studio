import { t } from "@/lib/i18n/core";
import { salesContactFor, bookingUrl } from "@/lib/leadmagnet/sales-contact";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  if (!contact) return null;
  const url = bookingUrl(
    {
      france: import.meta.env["VITE_BOOKING_FRANCE_URL"],
      germany: import.meta.env["VITE_BOOKING_GERMANY_URL"],
      international: import.meta.env["VITE_BOOKING_INTERNATIONAL_URL"],
    }[contact.id],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
        ) : (
          <p className="notice-info t-body">
            {t(
              "La réservation en ligne sera bientôt disponible. Votre responsable Standex vous recontactera pour convenir d’un rendez-vous. Aucun créneau n’est réservé à ce stade.",
            )}
          </p>
        )}
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("Revenir à mon projet")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
