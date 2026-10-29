"""Review-only scientific figures. Does not change the product or fit silhouettes."""
from pathlib import Path
import sys, json, shutil, html
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

out=Path(sys.argv[1] if len(sys.argv)>1 else '../detection-reanchor-20261029').resolve()
prior=Path(sys.argv[2] if len(sys.argv)>2 else '../detection-lambda-20261029').resolve()
r=json.loads((out/'results.json').read_text()); (out/'figures').mkdir(exist_ok=True)
green='#57b8ac'; yellow='#e3c87c'; gray='#d5d9de'; ink='#254061'
plt.rcParams.update({'font.size':11,'figure.facecolor':'white','axes.spines.top':False,'axes.spines.right':False})
legend=[Patch(color=green,label='Au-dessus du seuil de la borne moins sensible'),Patch(color=yellow,label='Entre les deux seuils de classe'),Patch(color=gray,label='Collision aimant / enveloppe du verre')]
for orient in ['parallel','perpendicular']:
 fig,axes=plt.subplots(2,2,figsize=(14,10),sharex=True,sharey=True)
 for row,mag in enumerate(['SMCO5-5X4','N45-4X19']):
  source=prior/f'{mag}-{orient}-raw.json';shutil.copy2(source,out/source.name)
  g=json.loads(source.read_text());x=np.array(g['xs']);z=np.array(g['zs']);shape=(len(z),len(x))
  a=np.array(g['m1'],float).reshape(shape);b=np.array(g['m2'],float).reshape(shape)
  for col,lam in enumerate([0,1]):
   ax=axes[row,col];response=np.maximum(0,abs((a+b)/2)-lam*abs((a-b)/2));valid=np.isfinite(response)
   ax.contourf(x,z,np.where(valid,np.nan,1),levels=[.5,1.5],colors=[gray])
   ax.contourf(x,z,np.ma.masked_invalid(response),levels=[g['thresholds']['to'],g['thresholds']['up'],1e8],colors=[yellow,green],alpha=.85)
   ax.contour(x,z,np.ma.masked_invalid(response),levels=[g['thresholds']['to'],g['thresholds']['up']],colors=[ink],linewidths=.7)
   ax.contour(x,z,np.ma.masked_invalid((a+b)/2),levels=[0],colors=['#ac5271'],linestyles='--',linewidths=.8)
   ax.plot([-7,7],[0,0],color=ink,lw=4);ax.set(xlim=(-40,40),ylim=(0,29),aspect='equal',title=f'{mag} · {"A, λ = 0" if lam==0 else "B, λ = 1"}')
   ax.grid(alpha=.15)
   if row==1:ax.set_xlabel('x du centre de l’aimant (mm)')
   if col==0:ax.set_ylabel('z du centre de l’aimant (mm)')
 fig.suptitle('Coupe brute · classe C · aimant '+('parallèle' if orient=='parallel' else 'perpendiculaire')+' au reed',fontsize=17)
 fig.legend(handles=legend,loc='lower center',ncol=1,fontsize=11)
 fig.subplots_adjust(left=.07,right=.98,bottom=.17,top=.91,hspace=.22,wspace=.16);fig.savefig(out/'figures'/f'comparaison-{orient}.png',dpi=150);plt.close(fig)

# An independent view of residuals; the two suspect bounds remain in these plots.
fig,axs=plt.subplots(1,2,figsize=(13,5),sharey=True)
for ax,variant in zip(axs,[r['results'][0],r['results'][-1]]):
 rows=[t for t in variant['table'] if t['className'] in 'BCDE' and t['status']=='control' and t['approach']!='D1' and t['errorMm'] is not None]
 for i,approach in enumerate(['D3','D4','D5']):
  pts=[t for t in rows if t['approach']==approach]
  for j,t in enumerate(pts):
   suspect='SUSPECTED_D1_TO_D3_COPY_RETAINED' in t['notes']
   ax.scatter(i+(j-(len(pts)-1)/2)*.025,t['errorMm'],color='#bd3651' if suspect else ink,marker='x' if suspect else 'o',s=45 if suspect else 20)
 ax.axhline(0,color=ink,lw=.8);ax.axhspan(-1,1,color=green,alpha=.12)
 ax.set_xticks([0,1,2],['D3','D4 corrigé','D5']);ax.set_title('A ré-ancré' if variant['lambda']==0 else 'B ré-ancré');ax.set_ylabel('Estimé − publié (mm)');ax.grid(axis='y',alpha=.2)
fig.suptitle('Contrôles B–E · recopies suspectes conservées (croix rouges)')
fig.text(.5,.01,'La bande ±1 mm est un repère graphique. La tolérance par borne est max(1 mm ; 15 % du publié).',ha='center')
fig.tight_layout(rect=(0,.04,1,.94));fig.savefig(out/'figures'/'residus.png',dpi=150);plt.close(fig)
source=Path(sys.argv[3]) if len(sys.argv)>3 else Path('C:/Users/THOMAS~1/AppData/Local/Temp/codex-clipboard-69ae9b3d-aaa2-4ac1-9bef-847664f3d5c2.png')
if source.exists():shutil.copy2(source,out/'reference-standex-fournie.png')
def n(x):return '—' if x is None else f'{x:.3f}'
lines=[]
for v in r['results']:
 s=v['scores']['grouped']; ss=v['secondaryWithoutSuspects'];bias={b['approach']:b['meanMm'] for b in s['biases']}
 lines.append(f'<tr><td>{v["lambda"]}</td><td>{n(v["anchor"]["datumMm"])}</td><td>{v["before"]["passed"]}/45 → {s["passed"]}/45</td><td>{n(s["medianAbsMm"])}</td><td>{n(bias["D3"])}</td><td>{n(bias["D4"])}</td><td>{n(bias["D5"])}</td><td>{"Passe" if s["pass"] else "Ne passe pas"}</td><td>{ss["passed"]}/{ss["total"]}, {"passe" if ss["pass"] else "ne passe pas"}</td></tr>')
page='''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sensor Studio — ré-ancrage par modèle</title><style>
body{font:18px/1.6 system-ui,sans-serif;color:#254061;background:#f3f6f9;margin:0}main{max-width:1160px;margin:auto;padding:32px}section{background:white;padding:28px;margin:22px 0;border-radius:18px}h1{font-size:34px;line-height:1.2}h2{font-size:25px}img{width:100%;height:auto}table{border-collapse:collapse;width:100%;font-size:15px}td,th{padding:9px;text-align:left;border-bottom:1px solid #dce5eb}th{background:#edf3f7}a{color:#005e92}small{font-size:15px}.scroll{overflow:auto}.notice{background:#e3f2ec;padding:20px;border-radius:12px}.reference{max-width:560px;display:block;margin:auto}code{font-size:16px}</style><main>
<h1>Ré-ancrage de la grille λ</h1><p>Sensor Studio · 29 octobre 2026 · étude isolée, atelier publié inchangé.</p>
<section><h2>Résultat : A redevient un candidat sérieux</h2><p class="notice">Après ré-ancrage, A satisfait la tolérance de <strong>43 bornes sur 45</strong>, avec un écart absolu médian de <strong>0,49 mm</strong>. B satisfait également 43/45. Le résultat à repère fixe ne permettait donc pas de rejeter A après recalage documentaire.</p>
<p>Le critère complet reste cependant non satisfait par A : le biais moyen D3 est de −1,134 mm, contre la limite de 1 mm. Les deux valeurs D3 suspectées de recopier D1 restent dans ce score. Sans elles, en analyse secondaire explicitement séparée, A passe : 43/43 et biais moyen D3 de −0,749 mm. Ce résultat ne prouve pas que les deux valeurs sont des coquilles.</p>
<p><strong>Recommandation :</strong> retenir A comme candidat prioritaire pour la forme brute, soumettre cette réserve chiffrée à Claude, puis décider explicitement du statut des deux données avant de figer le modèle. Ne pas ajouter une pondération A_w simplement pour compenser ces deux valeurs et ne pas annoncer une validation complète déjà acquise.</p></section>
<section><h2>Protocole exécuté</h2><p>Un seul paramètre ajusté par λ : le repère documentaire axial, sur Form C / SmCo5 Ø5×4 / D3 / up = 7,5 mm. L = 15,634 mm et k = 0,135605 mT/AT restent fixes. La correction scalaire D4 = −1,491290 mm reste celle de B, appliquée aux tableaux uniquement. Les anciennes ancres D3 et D4 sont exclues des contrôles dans toutes les variantes.</p>
<p>Critère conservé : |erreur| ≤ max(1 mm ; 15 % de la valeur publiée) sur au moins 90 % des bornes, et valeur absolue des biais moyen <em>et</em> médian ≤ 1 mm par approche. Les 45 contrôles B–E comportent 21 C/E et 24 B/D. Les classes A/F sont rapportées à part ; G n’a pas de données publiées dans cet extrait.</p>
<p>Le repère A vaut <strong>8,903 mm</strong>, et non environ 8,3 mm avec cette ancre précise. Son déplacement de +5,569 mm est la conséquence du choix d’une borne unique, pas de la moyenne des contrôles. Une seconde résolution avec le code A historique retrouve le même repère à moins de 0,00001 mm et les distances à moins de 0,0001 mm.</p>
<p>Ce repère sert à comparer une distance au document. Il ne déplace ni le reed, ni l’aimant, ni les lobes. Sa proximité avec une extrémité supposée ne constitue pas une mesure de cette extrémité. Il peut aussi absorber un biais du modèle. Les données ayant déjà été examinées, il s’agit d’une comparaison rétrospective, pas d’une nouvelle validation aveugle.</p></section>
<section><h2>Tous les λ, sans masquer les échecs</h2><div class="scroll"><table><thead><tr><th>λ</th><th>Repère mm</th><th>Bornes avant → après</th><th>Médiane |e| mm</th><th>Biais D3 mm</th><th>Biais D4 mm</th><th>Biais D5 mm</th><th>Critère complet</th><th>Secondaire sans 2 suspectes</th></tr></thead><tbody>'''+''.join(lines)+'''</tbody></table></div>
<p>Les deux dépassements individuels de A sont B–N45–D3–up : 17,3 publié / 13,867 estimé (−3,433 mm), et C–N45–D3–to : 17,7 / 13,867 (−3,833 mm). Leur égalité aux valeurs D1 est un indice documentaire, pas une confirmation du fabricant.</p>
<p>Sans ces deux bornes, l’erreur médiane de A est 0,460 mm, le maximum 1,971 mm : « toutes les bornes conformes » ne signifie donc pas « toutes à moins de 1 mm », puisque le critère comporte aussi 15 %. F passe sur 14/14 bornes. A : les huit bornes up passent, les huit bornes to échouent ; aucun seuil effectif supplémentaire n’a été ajusté.</p><img src="figures/residus.png" alt="Résidus A et B, anomalies conservées"></section>
<section><h2>Formes brutes : référence officielle, sans contour rouge</h2><p>Référence fournie par Thomas, attribuée à Standex : appréciation qualitative uniquement, sans extraction de dimensions. Son contour bleu représente le relâchement (drop-out), et le gris l’enclenchement (pull-in). Nos couleurs verte et jaune représentent deux seuils de sensibilité de classe : elles n’ont pas cette signification d’hystérésis.</p><img class="reference" src="reference-standex-fournie.png" alt="Schéma Standex fourni par Thomas">
<p>Les coupes ci-dessous réutilisent exactement les moyennes de champ de la grille précédente : le ré-ancrage documentaire ne change aucune silhouette. A donne un lobe central plus ample et arrondi que B. Le schéma seul ne permet pas d’en certifier la largeur. La ligne rose est la nodale de la moyenne signée, identique pour tous les λ.</p><img src="figures/comparaison-parallel.png" alt="Coupes brutes parallèles A et B">
<p>La zone grise exclut les positions du <strong>centre de l’aimant</strong> pour lesquelles son corps rencontre l’enveloppe du verre modélisé. Ces pilotes sont Form 66 : cette zone n’est pas une mesure de l’encombrement MK04. L’occultation du pincement dans un boîtier précis doit être vérifiée avec sa géométrie et son placement interne estimé.</p><img src="figures/comparaison-perpendicular.png" alt="Coupes brutes perpendiculaires A et B"></section>
<section><h2>Zone centrale sans activation : elle subsiste avec A</h2><p>Le zéro exact a une largeur pratiquement nulle pour A. Ce n’est pas la largeur sous le seuil. Avec la borne sensible C (15 AT), les demi-largeurs raffinées sont <strong>2,946 mm pour SmCo</strong> et <strong>3,159 mm pour N45</strong>, aux profondeurs du centre fixées respectivement à 8,633 et 18,697 mm. Ce sont des résultats pour ces coupes, pas des constantes universelles.</p>
<p>Un balayage latéral mesuré à profondeur fixée reste le test le plus utile pour départager les formes. La brochure ne fournit pas ici de mesures de largeur. D2 n’est pas ajouté au score : les références de produit M04 et leurs valeurs pull-in/drop-out ne sont pas interchangeables avec les deux aimants pilotes et les bornes de classe.</p></section>
<section><h2>Prochaine décision</h2><p>Claude avait raison de demander le ré-ancrage et de distinguer zéro exact et sous-seuil. Je ne conserve donc pas le rejet de A fondé sur le tableau à repère fixe. Je propose de poursuivre avec A, sous réserve explicite concernant le biais D3 et les deux sources suspectes. Si ce choix est accepté, retirer la déformation pédagogique dans le chemin client A, refaire la cohérence volumes / circuit / coupe / trajectoires, puis vérifier séparément les adaptations de boîtiers. Aucune de ces modifications client n’est incluse dans ce lot.</p>
<p><a href="controls.csv">560 bornes, CSV</a> · <a href="scores.csv">Scores</a> · <a href="dead-zones.csv">Zone centrale</a> · <a href="results.json">Résultats complets et empreintes</a> · <a href="verification.json">Vérifications logicielles</a></p></section></main></html>'''
decision='''<section><h2>Retour de Claude après transmission des résultats</h2><p>Claude a examiné la synthèse chiffrée dans la conversation « Modèle de détection Sensor Studio » et accepte A pour l’intégration pédagogique, tout en conservant le statut <strong>critère primaire complet non satisfait</strong>. Il n’a pas reçu le nouveau ZIP dans cet échange. Nous retenons A comme réponse cible, sans ajustement A_w supplémentaire, avec une recette d’intégration encore à réaliser.</p><p>Rectification adressée à Claude : parmi les 13 D3 hors lignes suspectes, trois écarts dépassent encore 1 mm (N45 B-to : −1,971 ; D-to : −1,246 ; E-to : −1,353), mais restent dans les 15 %. Le biais axial restant n’est donc pas entièrement expliqué par les deux suspectes. A et B ont le même nombre de contrôles conformes ; cela ne démontre pas leur équivalence physique.</p><p>Une seule mesure sur un MK04 de classe B ne permettrait pas de conclure « 14 mm = modèle juste, 17 mm = brochure juste » : il faut distinguer le repère Form de la face du boîtier et la dispersion de seuil dans la classe. A prévoit déjà une plage D3 B N45 de 13,867 à 17,629 mm dans son repère documentaire. Une mesure future doit préciser son repère et les caractéristiques de l’échantillon.</p><p>Les réserves détaillées restent dans ce dossier technique. Elles ne réintroduisent pas le panneau « Sources et limites » supprimé à la demande de Thomas. Aucune nouvelle donnée Standex n’est supposée disponible. L’intégration, la cohérence du circuit et des volumes, et la recette des boîtiers restent distinctes de ce lot de calcul.</p></section>'''
page=page.replace('</main></html>',decision+'</main></html>')
(out/'index.html').write_text(page,encoding='utf8')
print(out/'index.html')
