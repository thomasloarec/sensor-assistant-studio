import { LoaderCircle } from "lucide-react";
import { t } from "@/lib/i18n/core";

export function SceneLoading() {
  return <div className="lv-scene-loading t-caption" role="status">
    <LoaderCircle className="lv-loading-icon" size={24} aria-hidden="true" />
    <span>{t("Préparation de l’aperçu…")}</span>
  </div>;
}

export function SceneUnavailable() {
  return <p className="lv-scene-loading t-body">{t("L’aperçu nécessite un navigateur compatible WebGL.")}</p>;
}
