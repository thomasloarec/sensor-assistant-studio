# Correction utilisateur MK26 — 2026-10-13

Base HEAD : c62c45990dddb0fc47d43159e156312c09133077.

**Correction de l'utilisateur :** « ignore ma remarque sur MK26 ; la suggestion était pertinente » (il avait confondu MK26 et MK27). Le lot 1 écartait MK26 des trois premières cartes sauf si la tension écrite dépassait 180 V. Cette mise à l'écart est annulée, et seulement elle.

- `suggestion-ranking.ts` : `UNRESERVED = {MK26}`. MK26 n'est plus réservé, il est classé sur ses critères ordinaires : montage, dimensions, température au capteur. Il n'est jamais forcé en tête.
- Une tension commutée plus élevée vérifiée le promeut toujours, avec sa raison. Cela ne garantit pas que le courant ou la puissance conviennent.
- MK21 (haute température), MK02 (aimant intégré) et MK27 (aluminium) gardent leur réserve. Les matériaux ne changent pas : MK26 est en PBT renforcé de fibres de verre, MK27 en aluminium.

**Tests modifiés :** deux tests du lot 1 exigeaient que MK26 soit exclu ou réservé dans le cas ordinaire. Ils traduisaient une exigence que l'utilisateur a retirée. Ils ont été remplacés par des tests positifs : MK26 est éligible, non réservé, sans raison promue, et MK04 et MK13 restent présents. Ce remplacement suit la correction de l'utilisateur. Il ne masque aucun échec.

**Résultats :** `bun test tests/` 1 699 pass / 0 fail (108 fichiers). `bunx tsgo --noEmit` propre. Inventaire i18n : 0 manquant. Le build tourne automatiquement sur la plateforme. Aucune publication, aucune modification de la base, du NDA ni de la connexion.
