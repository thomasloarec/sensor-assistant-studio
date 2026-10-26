/** À importer EN PREMIER : react-dom détecte l'événement « input » au
 *  chargement ; sans document à ce moment, les curseurs ne déclenchent rien. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });
