"""Scientific review of raw A/B/C cuts; no silhouette fitting or product editing."""
from pathlib import Path
import sys,json,html,shutil
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
out=Path(sys.argv[1] if len(sys.argv)>1 else '../detection-c-20261029').resolve()
r=json.loads((out/'results.json').read_text()); (out/'figures').mkdir(exist_ok=True)
green='#57b8ac';yellow='#e3c87c';gray='#d5d9de';ink='#254061'
plt.rcParams.update({'font.size':10,'figure.facecolor':'white','axes.spines.top':False,'axes.spines.right':False})
stats=[]
def field(g,variant):
 shape=(len(g['zs']),len(g['xs']));a=np.array(g['m1'],float).reshape(shape);b=np.array(g['m2'],float).reshape(shape)
 amp=abs((a+b)/2)
 if variant=='A':return amp
 if variant=='B':return np.where(np.isfinite(a),np.where(a*b>0,np.minimum(abs(a),abs(b)),0),np.nan)
 eps=.01 if variant=='C1%' else 0
 return np.where(np.isfinite(a),np.where((a*b>0)&(np.minimum(abs(a),abs(b))>eps*amp),amp,0),np.nan)
def draw(ax,g,variant,housed=False):
 x=np.array(g['xs']);z=np.array(g['zs']);v=field(g,variant);collision=~np.isfinite(v)
 if housed:collision|=np.array(g['housing']).reshape(v.shape)
 v=np.ma.masked_where(collision,v)
 ax.contourf(x,z,np.where(collision,1,np.nan),levels=[.5,1.5],colors=[gray])
 ax.contourf(x,z,v,levels=[g['thresholds']['to'],g['thresholds']['up'],1e9],colors=[yellow,green])
 ax.contour(x,z,v,levels=[g['thresholds']['to'],g['thresholds']['up']],colors=[ink],linewidths=.7)
 ax.plot([-7,7],[0,0],color=ink,lw=3);ax.set(xlim=(-32,32),ylim=(0,32 if housed else 25),aspect='equal',title=variant);ax.grid(alpha=.15)
 ax.set_xlabel('x du centre de l’aimant (mm)');ax.set_ylabel('z du centre de l’aimant (mm)')
for orient in ['parallel','perpendicular']:
 fig,axes=plt.subplots(2,3,figsize=(16,8))
 for row,mag in enumerate(['SMCO5-5X4','N45-4X19']):
  g=json.loads((out/f'{mag}-{orient}-raw.json').read_text())
  for col,variant in enumerate(['A','B','C']):
   draw(axes[row,col],g,variant);axes[row,col].set_title(f'{mag} · {variant}')
 fig.suptitle('Reed nu · classe C · aimant '+('parallèle' if orient=='parallel' else 'perpendiculaire')+' · coupe brute 0,25 mm',fontsize=16)
 fig.legend(handles=[Patch(color=green,label='Borne moins sensible'),Patch(color=yellow,label='Dispersion de classe'),Patch(color=gray,label='Collision avec le verre')],loc='lower center',ncol=3)
 fig.tight_layout(rect=(0,.06,1,.95));fig.savefig(out/'figures'/f'pilotes-{orient}.png',dpi=140);plt.close(fig)
 # Actual catalogue exclusions, including M04 equivalent cylinder hypothesis.
 fig,axes=plt.subplots(3,2,figsize=(12,13))
 for row,mag in enumerate(['SMCO5-5X4','N45-4X19','M04']):
  g=json.loads((out/f'{mag}-{orient}-raw.json').read_text())
  for col,variant in enumerate(['A','C']):
   draw(axes[row,col],g,variant,True);axes[row,col].set_title(f'MK04 + {mag} · {variant}')
   if orient=='parallel':
    v=field(g,variant);mask=np.array(g['housing']).reshape(v.shape);x=np.array(g['xs']);z=np.array(g['zs']);mid=len(x)//2
    widths=[]
    for i,depth in enumerate(z):
     if mask[i,mid] or not np.isfinite(v[i,mid]) or v[i,mid]<g['thresholds']['to']:continue
     stop=mid
     while stop<len(x)-1 and np.isfinite(v[i,stop+1]) and not mask[i,stop+1] and v[i,stop+1]>=g['thresholds']['to']:stop+=1
     widths.append((float(depth),float(x[stop])))
    if widths:
     peak=max(widths,key=lambda w:w[1]);stats.append(dict(magnet=mag,variant=variant,first_accessible_z=widths[0][0],first_half_width=widths[0][1],peak_z=peak[0],peak_half_width=peak[1],grid_mm=.25))
 fig.suptitle('Encombrement MK04 réel du catalogue · '+('parallèle' if orient=='parallel' else 'perpendiculaire')+'\nGris : corps entiers en collision ; M04 : insert magnétique équivalent hypothétique',fontsize=15)
 fig.tight_layout(rect=(0,.02,1,.95));fig.savefig(out/'figures'/f'boitiers-{orient}.png',dpi=140);plt.close(fig)
# Quantify epsilon across the complete planes, not just the distance maxima.
eps=[]
for mag in ['SMCO5-5X4','N45-4X19','M04']:
 for orient in ['parallel','perpendicular']:
  g=json.loads((out/f'{mag}-{orient}-raw.json').read_text());c=field(g,'C');ce=field(g,'C1%')
  eps.append(dict(magnet=mag,orientation=orient,changed_low_threshold_cells=int(np.sum((c>=g['thresholds']['to'])!=(ce>=g['thresholds']['to']))),grid_mm=.25))
(out/'geometry-summary.json').write_text(json.dumps({'housing':stats,'epsilon':eps},indent=2))
def table(headers,rows):return '<div class="scroll"><table><tr>'+''.join('<th>'+html.escape(h)+'</th>' for h in headers)+'</tr>'+''.join('<tr>'+''.join('<td>'+html.escape(str(v))+'</td>' for v in row)+'</tr>' for row in rows)+'</table></div>'
def n(v):return '—' if v is None else f'{v:.3f}'
scoreRows=[]
for name,datum,s in [('A',r['referenceA']['anchor']['datumMm'],r['referenceA']['scores']['grouped'])]+[(v['name'],v['datum'],v['scores']['grouped']) for v in r['results']]:
 scoreRows.append([name,n(datum),str(s['passed'])+'/'+str(s['total']),n(s['medianAbsMm']),n(next(b['meanMm'] for b in s['biases'] if b['approach']=='D3')),'Non'])
widthRows=[[w['magnet'],w['variant'],w['label'],n(w['z_mm']),n(w['half_width_mm']),'Collision' if w['MK04_center_blocked'] else 'Accessible'] for w in r['widths'] if w['bound']=='to' and w['variant']!='C1%']
housingRows=[[s['magnet'],s['variant'],n(s['first_accessible_z']),n(s['first_half_width']),n(s['peak_z']),n(s['peak_half_width'])] for s in stats]
page='''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sensor Studio — candidat C</title><style>
body{font:18px/1.6 system-ui;color:#254061;background:#f3f6f9;margin:0}main{max-width:1180px;margin:auto;padding:28px}section{background:white;padding:26px;margin:22px 0;border-radius:16px}h1{font-size:34px;line-height:1.2}h2{font-size:25px}img{width:100%;height:auto}table{border-collapse:collapse;width:100%;font-size:15px}th,td{padding:8px;text-align:left;border-bottom:1px solid #dce5eb}.scroll{overflow:auto}a{color:#005e92}.note{background:#e3f2ec;padding:18px;border-radius:12px}</style><main>
<h1>C : amplitude de A, condition de signe de B</h1><p>29 octobre 2026 · étude isolée · atelier client et site publié inchangés.</p>
<section><h2>Résultat</h2><p class="note">C crée un pincement et conserve les distances de A : écart maximal inférieur à 0,0001 mm sur D1/D3/D4/D5. Le score reste 43/45. Le candidat satisfait donc la condition de non-régression des distances et présente la taille recherchée ; il mérite une revue visuelle avant son intégration.</p>
<p>Les dimensions annoncées par Claude ne se reproduisent pas pour le SmCo : à z = 3,6 mm, la demi-largeur centrale est 0,61 mm, pas environ 3 mm. C n’est donc pas une reproduction cotée du schéma Standex. La forme dépend fortement de l’aimant.</p>
<p>Le critère primaire complet reste non satisfait : biais D3 −1,134 mm. Les deux valeurs suspectes restent dans le score. L’accord de distances ne prouve pas la nouvelle frontière de signe.</p>'''
page+=table(['Réponse','Repère axial mm','Bornes dans tolérance','Médiane |écart| mm','Biais D3 mm','Critère complet'],scoreRows)+'</section>'
page+='<section><h2>Coupes brutes sur reed nu</h2><p>Les contours sont les deux seuils de classe, pas une hystérésis pull-in/drop-out. Le schéma Standex reste une référence qualitative.</p><img src="figures/pilotes-parallel.png"><img src="figures/pilotes-perpendicular.png"></section>'
page+='<section><h2>Ce que le boîtier rend réellement accessible</h2><p>Dans le catalogue, MK04 mesure 23 × 5,9 × 13,9 mm. La coupe y = 0 de l’atelier approche selon z : c’est la dimension 13,9 mm qui intervient, et non 5,9 mm. Avec M04 (mêmes dimensions), le premier centre accessible est à z ≈ 13,9 mm. Les hypothèses de 5–5,5 mm ne décrivent donc pas ce montage.</p>'
page+=table(['Aimant','Réponse','Premier z accessible','Demi-largeur au premier z','z des épaules','Demi-largeur maximale'],housingRows)
page+='<img src="figures/boitiers-parallel.png"><img src="figures/boitiers-perpendicular.png"></section>'
page+='<section><h2>Largeurs demandées</h2><p>Classe C, borne haute de portée (15 AT). D1 centre = distance documentaire D1 brute + rayon de l’aimant. Les fractions 0,5 et 0,75 portent sur cette hauteur du centre, comme dans la comparaison précédente. Les valeurs près du verre ne sont pas nécessairement accessibles avec MK04.</p>'+table(['Aimant','Réponse','Hauteur','z mm','Demi-largeur mm','Avec MK04'],widthRows)+'</section>'
page+='<section><h2>Zone centrale perpendiculaire et stabilité</h2>'+table(['Aimant','Réponse','z mm','Demi-bande nulle mm','Demi-bande sous seuil mm'],[[d['magnet'],d['variant'],n(d['z_mm']),n(d['exact_zero_half_width_mm']),n(d['below_class_low_half_width_mm'])] for d in r['dead']])
page+='<p>La comparaison D4/D5 à pas de recherche 0,25 mm et quadrature doublée donne un écart nul à la tolérance de recherche (0,0001 mm), sur les 8 bornes classe C contrôlées. B ≤ C ≤ A est respecté sur toutes les cellules valides.</p><p>C est discontinu : si une moyenne de lame passe de zéro à une très petite valeur de même signe que l’autre, la réponse saute vers une valeur finie. La variante à 1 % ne change pas les maxima de portée ici, mais change '+str(sum(e['changed_low_threshold_cells'] for e in eps))+' cellules d’activation des six coupes. Elle reste un paramètre de modèle et n’est pas retenue automatiquement.</p></section>'
page+='''<section><h2>Décision et limites</h2><p>Proposition : retenir C sans marge de 1 % pour la prochaine revue ciblée. Avant remplacement de A, valider le rendu MK04/M04 et les limites de la porte de signe. La future intégration devra faire partager exactement C par point, volume, coupe, chronologie et circuit, sans changement des repères physiques, sans réintroduire une déformation graphique.</p><p>Les moyennes de champ libre M1/M2 ne sont pas une mesure de l’aimantation réelle des lames. La règle de signe est une hypothèse simplifiée : ni le schéma constructeur ni les distances disponibles ne démontrent qu’elle prédit exactement la force de fermeture. Aucun nouveau paramètre produit, aucune garantie millimétrique.</p><p>Références : <a href="https://standexdetect.com/resources/reed-technology-academy/magnet-interaction/">Standex — Magnet Interaction</a> ; <a href="https://standexdetect.com/resources/reed-technology-academy/reed-switch-characteristics/reed-switch-operational-characteristics/">caractéristiques opérationnelles</a>. La pièce jointe Markdown reçue ne contenait pas encore C : la proposition testée est celle du message transmis.</p></section>
<section><h2>Reproduction et données</h2><p><a href="results.json">Résultats et paramètres</a> · <a href="controls.csv">Tableau publié / estimé / écart / anomalie</a> · <a href="widths.csv">Largeurs</a> · <a href="dead-zones.csv">Bandes centrales</a> · <a href="convergence.csv">Convergence</a> · <a href="geometry-summary.json">Encombrements et effet du 1 %</a></p><p>Scripts du dépôt : scripts/detection-c-study.ts puis scripts/render-c-study.py. Données brutes y = 0, pas de 0,25 mm, deux aimants pilotes et M04. L, k, correction D4 inchangés ; une seule borne C/SmCo/D3-up pour ré-ancrer le repère de chaque réponse. Étude rétrospective, pas un nouvel échantillon de validation.</p></section></main></html>'''
(out/'index.html').write_text(page,encoding='utf8')
print(json.dumps({'housing':stats,'epsilon':eps},indent=2))
