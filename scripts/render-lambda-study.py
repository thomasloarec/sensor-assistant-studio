"""Scientific review figures, no modification of product UI or user images.
Run after detection-lambda-study.ts; matplotlib + scikit-image are required.
"""
import csv, json, sys, html, shutil
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
from matplotlib.lines import Line2D
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from skimage.measure import marching_cubes
from PIL import Image

out=Path(sys.argv[1] if len(sys.argv)>1 else '../detection-lambda-20261029').resolve()
figdir=out/'figures';figdir.mkdir(exist_ok=True)
data=json.loads((out/'results.json').read_text()); lam=data['lambdaGrid']
magnets=['SMCO5-5X4','N45-4X19']; names=['SmCo5 Ø5 × 4 mm','N45 Ø4 × 19 mm']
green='#57b8ac'; yellow='#e3c87c'; gray='#d5d9de'; ink='#254061'
plt.rcParams.update({'font.size':11,'axes.titlesize':12,'axes.labelsize':11,'figure.facecolor':'white','axes.spines.top':False,'axes.spines.right':False})

def load(mag,orient):
 g=json.loads((out/f'{mag}-{orient}-raw.json').read_text());shape=(len(g['zs']),len(g['xs']))
 a=np.array(g['m1'],float).reshape(shape);b=np.array(g['m2'],float).reshape(shape)
 return g,np.array(g['xs']),np.array(g['zs']),a,b
def resp(a,b,l):return np.maximum(0,abs((a+b)/2)-l*abs((a-b)/2))
def cut(ax,g,x,z,a,b,l,normalize=1):
 R=resp(a,b,l); X,Z=np.meshgrid(x/normalize,z/normalize)
 valid=np.isfinite(R);zz=np.where(valid,R,-1)
 ax.contourf(X,Z,np.where(valid,np.nan,1),levels=[.5,1.5],colors=[gray])
 ax.contourf(X,Z,np.ma.masked_invalid(R),levels=[g['thresholds']['to'],g['thresholds']['up'],1e8],colors=[yellow,green],alpha=.78)
 ax.contour(X,Z,np.ma.masked_invalid(R),levels=[g['thresholds']['to'],g['thresholds']['up']],colors=[ink,ink],linewidths=.65)
 mean=(a+b)/2
 if np.nanmin(mean)<0<np.nanmax(mean): ax.contour(X,Z,np.ma.masked_invalid(mean),levels=[0],colors=['#bb526a'],linestyles='--',linewidths=.8)
 ax.plot([-7/normalize,7/normalize],[0,0],color=ink,lw=4)
 ax.set_aspect('equal');ax.grid(alpha=.15);ax.set_title(f'λ = {l:g}')
 return R

legend=[Patch(facecolor=green,label='Au-dessus de la borne moins sensible'),Patch(facecolor=yellow,label='Entre les deux bornes de classe'),Patch(facecolor=gray,label='Position exclue / collision'),Line2D([0],[0],color='#bb526a',ls='--',label='Nodale de la moyenne signée m = 0')]
for orient in ['parallel','perpendicular']:
 fig,axs=plt.subplots(2,5,figsize=(19,7),sharex=True,sharey=True)
 for row,mag in enumerate(magnets):
  g,x,z,a,b=load(mag,orient)
  # Raw CSV preserves blade means and all five responses; excluded positions stay blank.
  with (out/f'{mag}-{orient}-raw.csv').open('w',newline='',encoding='utf8') as f:
   w=csv.writer(f);w.writerow(['x_mm','y_mm','z_mm','M1_mT','M2_mT','status']+[f'response_lambda_{l}' for l in lam])
   for j,d in enumerate(z):
    for i,p in enumerate(x):
     status=g['mask'][j*len(x)+i]
     w.writerow([p,0,d,a[j,i] if status=='valid' else '',b[j,i] if status=='valid' else '',status]+[resp(a[j,i],b[j,i],l) if status=='valid' else '' for l in lam])
  for col,l in enumerate(lam):
   ax=axs[row,col];cut(ax,g,x,z,a,b,l);ax.set_xlim(-40,40);ax.set_ylim(0,28)
   if col==0:ax.set_ylabel(names[row]+'\nz, centre aimant (mm)')
   if row==1:ax.set_xlabel('x, le long du reed (mm)')
   one,oa=plt.subplots(figsize=(10,5));cut(oa,g,x,z,a,b,l);oa.set_xlim(-40,40);oa.set_ylim(0,28);oa.set_xlabel('x (mm)');oa.set_ylabel('z (mm)');oa.set_title(f'{names[row]} · classe C · {orient} · λ={l:g}')
   one.text(.5,.02,'Coupe brute y=0 · pas 0,25 mm · coordonnées du centre · aucun warp',ha='center',fontsize=10);one.tight_layout(rect=(0,.04,1,1));one.savefig(figdir/f'{mag}-{orient}-lambda-{l}.png',dpi=140);plt.close(one)
 fig.suptitle('Coupes brutes — aimant '+('parallèle au reed' if orient=='parallel' else 'perpendiculaire au reed')+' — classe C',fontsize=19)
 fig.legend(handles=legend,loc='lower center',ncol=2,fontsize=11)
 fig.tight_layout(rect=(0,.09,1,.95));fig.savefig(figdir/f'grille-{orient}.png',dpi=140);plt.close(fig)

# Digitize the USER's qualitative red outline; neither fitted nor used by engine.
target=Path('C:/Users/THOMAS~1/AppData/Local/Temp/codex-clipboard-fdce5f83-afd8-4936-ad48-c85cd11697c0.png')
target_points=[]
if target.exists():
 im=np.array(Image.open(target).convert('RGB'));red=(im[:,:,0]>180)&(im[:,:,1]<85)&(im[:,:,2]<85)
 yy,xx=np.where(red);cy=(yy.min()+yy.max())/2;cx=(xx.min()+xx.max())/2;H=(yy.max()-yy.min())/2
 # Upper half, excluding last cap pixels; left and right contours retain actual outline.
 for y in range(int(yy.min()),int(cy)+1):
  hits=np.where(red[y])[0]
  if len(hits)>1:target_points.append([(hits.min()-cx)/H,(hits.max()-cx)/H,(cy-y)/H])
 shutil.copy2(target,out/'cible-utilisateur.png')
 json.dump({'normalization':'centre of red bounding box, both axes divided by half total red height; qualitative drawing, not a physical datum','points':target_points},(out/'target-outline.json').open('w'))
fig,axs=plt.subplots(2,5,figsize=(17,9),sharex=True,sharey=True)
for row,mag in enumerate(magnets):
 g,x,z,a,b=load(mag,'parallel');H=next(r['d1_centre_mm'] for r in data['peaks'] if r['magnet']==mag and r['lambda']==1 and r['bound']=='to')
 for col,l in enumerate(lam):
  ax=axs[row,col];cut(ax,g,x,z,a,b,l,H)
  if target_points:
   tp=np.array(target_points);ax.plot(tp[:,0],tp[:,2],color='red',lw=1.6);ax.plot(tp[:,1],tp[:,2],color='red',lw=1.6)
  ax.set_xlim(-1.05,1.05);ax.set_ylim(0,1.1)
  if col==0:ax.set_ylabel(names[row]+'\nz / portée centrale jaune')
  if row==1:ax.set_xlabel('x / portée centrale jaune')
fig.suptitle('Comparaison qualitative au contour rouge — aucune adaptation des coefficients à cette cible',fontsize=16)
fig.text(.5,.035,'Normalisation de silhouette uniquement : le dessin inclut MK04, les calculs portent sur Form 66 et deux aimants nus.\nLes origines physiques ne sont pas identifiées par le dessin ; cette superposition ne valide aucune distance.',ha='center',fontsize=11)
fig.tight_layout(rect=(0,.1,1,.94));fig.savefig(figdir/'comparaison-contour.png',dpi=150);plt.close(fig)

# Real 3D level surfaces on the raw field grid restricted to |y|<=2 mm.
for mi,mag in enumerate(magnets):
 g=json.loads((out/f'{mag}-slab-raw.json').read_text());x=np.array(g['xs']);y=np.array(g['ys']);z=np.array(g['zs']);sh=(len(z),len(y),len(x));a=np.array(g['m1'],float).reshape(sh);b=np.array(g['m2'],float).reshape(sh)
 fig=plt.figure(figsize=(14,6))
 for col,l in enumerate([.5,1]):
  ax=fig.add_subplot(1,2,col+1,projection='3d');R=resp(a,b,l);valid=np.isfinite(R)
  for threshold,color,alpha in [(g['thresholds']['to'],yellow,.23),(g['thresholds']['up'],green,.55)]:
   verts,faces,_,_=marching_cubes(np.nan_to_num(R,nan=0),threshold,spacing=(z[1]-z[0],y[1]-y[0],x[1]-x[0]),mask=valid)
   pts=np.column_stack((verts[:,2]+x[0],verts[:,1]+y[0],verts[:,0]+z[0]));mesh=Poly3DCollection(pts[faces],alpha=alpha,facecolor=color,edgecolor='none');ax.add_collection3d(mesh)
  ax.plot([-7,7],[0,0],[0,0],color=ink,lw=4);ax.set_xlim(-24,24);ax.set_ylim(-6,6);ax.set_zlim(0,26);ax.set_box_aspect((48,12,26));ax.view_init(elev=25,azim=-65)
  ax.set_xlabel('x (mm)');ax.set_ylabel('y (mm)');ax.set_zlabel('z (mm)');ax.set_title(f'λ = {l:g} · tranche |y| ≤ 2 mm')
 fig.suptitle(names[mi]+' · classe C · iso-surfaces brutes en vue oblique',fontsize=16);fig.text(.5,.025,'Grille 3D : 0,75 mm en x/z, 0,5 mm en y. Aucune extrusion, aucune révolution, aucune déformation.',ha='center');fig.subplots_adjust(bottom=.1,top=.88,wspace=.1);fig.savefig(figdir/f'{mag}-oblique.png',dpi=150);plt.close(fig)

def f(v):return '—' if v is None else f'{v:.3f}'
rows=''.join('<tr>'+''.join(f'<td>{v}</td>' for v in [r['lambda'],f"{r['corrected']['grouped']['passed']}/45",f(r['corrected']['grouped']['medianAbsMm']),*[f(b['meanMm']) for b in r['corrected']['grouped']['biases']],'Oui' if r['corrected']['grouped']['pass'] else 'Non'])+'</tr>' for r in data['results'])
widthrows=''
for mag in magnets:
 for l in lam:
  w=next(r for r in data['widths'] if r['magnet']==mag and r['lambda']==l and r['bound']=='to' and r['fraction']==.5)
  ref=next(r for r in data['widths'] if r['magnet']==mag and r['lambda']==1 and r['bound']=='to' and r['fraction']==.5)
  d=next(r for r in data['dead'] if r['magnet']==mag and r['lambda']==l)
  widthrows+=f"<tr><td>{mag}</td><td>{l}</td><td>{f(w['centre_depth_mm'])}</td><td>{f(w['half_width_mm'])}</td><td>{f(w['half_width_mm']-ref['half_width_mm'])}</td><td>{f(d['zero_half_width_mm'])}</td></tr>"
page=f'''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sensor Studio — grille λ — 29 octobre 2026</title>
<style>body{{max-width:1180px;margin:40px auto;padding:0 24px;font:18px/1.55 system-ui;color:#263e52;background:#f8fafb}}h1,h2{{line-height:1.2}}section{{background:white;border-radius:18px;padding:28px;margin:24px 0;box-shadow:0 3px 18px #233b5010}}img{{max-width:100%;height:auto}}table{{border-collapse:collapse;width:100%;font-size:15px}}td,th{{padding:10px;text-align:right;border-bottom:1px solid #ddd}}th:first-child,td:first-child{{text-align:left}}.notice{{background:#fff4d9;padding:20px;border-radius:14px}}a{{color:#0766a0}}code{{font-size:15px}}small{{font-size:14px}}</style>
<h1>D1 : la grille λ ne résout pas encore le compromis</h1><p>Étude du 29 octobre 2026 · Form 66 · classe C pour les coupes · SmCo5 Ø5×4 et N45 Ø4×19 · <strong>aucune modification de l’atelier ni publication</strong>.</p>
<p class="notice">Parmi les cinq valeurs demandées, seul λ = 1 conserve le critère de la passe 3. Les valeurs plus faibles élargissent le lobe central, mais allongent excessivement D3 et D5. La proposition n’est donc pas prête à remplacer le modèle client. Les silhouettes ne reproduisent pas non plus uniformément le contour rouge sur les deux aimants.</p>
<section><h2>1. Comparaison à paramètres fixes</h2><p>Réponse = max(0, |(M1+M2)/2| − λ |(M1−M2)/2|). M1/M2 sont les moyennes de Bx en mT retournées par le noyau existant ; leur combinaison reste une hypothèse de réponse, pas une mesure de force magnétomotrice.</p>
<p>L = {data['parameters']['effectiveLengthMm']:.8f} mm ; k = {data['parameters']['kMtPerAt']:.10f} mT/AT ; repère axial = {data['parameters']['documentaryDatumMm']:.8f} mm ; retrait D4 de tableau = {data['parameters']['documentaryD4DeltaMm']:.8f} mm. Aucun de ces paramètres n’a été réajusté.</p>
<table><tr><th>λ</th><th>Contrôles réussis</th><th>Médiane |écart| mm</th><th>Biais D3 mm</th><th>Biais D4 mm</th><th>Biais D5 mm</th><th>Critère complet</th></tr>{rows}</table>
<p>Critère : |écart| ≤ max(1 mm ; 15 % du publié), ≥90 % des 45 contrôles B–E et biais moyens/médians de chaque approche ≤1 mm. Deux anomalies D1→D3 sont conservées ; les deux anciennes ancres restent exclues. Les scores CE/BD séparés, valeurs brutes sans retrait D4 et classes A/F/G sont dans results.json et controls.csv.</p>
<p>Les 45 contrôles sont rétrospectifs. Les utiliser pour choisir λ les transforme en données d’ajustement ; ce ne serait pas une validation indépendante.</p></section>
<section><h2>2. Coupes brutes demandées</h2><p>Pas 0,25 mm, plan y=0, coordonnées réelles du centre d’aimant, moteur sans le warp pédagogique. Vert : seuil AT=20 ; jaune : AT=15 à 20. Ces deux contours ne sont pas l’hystérésis pull-in/drop-out des illustrations Standex. Gris : position indisponible, jamais assimilée à une réponse nulle.</p>
<a href="figures/grille-parallel.png"><img src="figures/grille-parallel.png"></a><a href="figures/grille-perpendicular.png"><img src="figures/grille-perpendicular.png"></a></section>
<section><h2>3. Confrontation au contour demandé</h2><img src="figures/comparaison-contour.png"><p>Le contour rouge est extrait de l’image fournie par Thomas. Les deux axes du dessin sont divisés par sa demi-hauteur ; le calcul est divisé par la portée centrale jaune mesurée depuis l’origine du reed. Ce rapprochement est qualitatif : le dessin montre MK04/M04 et ne fournit pas de datum métrologique. Les deux aimants pilotes sont distincts de M04. Aucun coefficient n’est ajusté à ce contour.</p>
<p>Il faut distinguer « lobe plus large » et « largeur croissante à mesure qu’on s’éloigne ». Le premier peut être obtenu en diminuant λ, sans assurer le second ni la silhouette attendue. À 0,25 de la portée, certains points sont même exclus mécaniquement : ils restent indisponibles dans le tableau.</p>
<p>Sur SmCo, λ=0,5 produit une poche centrale très resserrée au pied (demi-largeur jaune ≈1 mm au premier niveau accessible), pas la silhouette généreuse demandée. Les sommets deviennent pointus pour λ&gt;0 : près de x=0, m est pair et d impair ; le terme −λ|d| introduit généralement une pente en |x|. L’arrondi au sommet n’est donc pas garanti par la formule proposée, même si la largeur décroît dans les derniers 10 %.</p></section>
<section><h2>4. Traversée latérale et zone morte</h2><p>Traversée du lobe central jaune à la moitié de sa portée (coordonnée du centre). Entrée à −w, sortie à +w ; le gain indiqué est par côté relativement à λ=1. Il s’agit de millimètres le long du trajet, pas de secondes sans vitesse spécifiée.</p>
<table><tr><th>Aimant</th><th>λ</th><th>Profondeur mm</th><th>Demi-largeur w mm</th><th>Gain par côté mm</th><th>Demi-zone nulle ⟂ mm</th></tr>{widthrows}</table>
<p>La zone nulle perpendiculaire est évaluée à une profondeur commune à tous les λ, définie pour chaque aimant par h + 0,8 × D4 brut(λ=1, C-up). Elle est distincte de la zone sous le seuil d’activation. λ=0 n’a qu’une ligne centrale nulle ; λ≥0,25 dépasse 1 mm de demi-largeur à ces deux profondeurs. Cela ne garantit pas 1 mm à toute profondeur.</p></section>
<section><h2>5. Nodale : résultat et limite du nouvel invariant</h2><p>La nodale signée m=0 ne dépend pas de λ : la réponse est nulle dessus pour toute la famille. Pour λ&gt;0, elle est entourée d’une bande nulle ; comparer sa limite intérieure avec la ligne m=0 serait comparer deux objets différents.</p>
<p>La limite z→0 demandée traverse des positions exclues par le corps de l’aimant. On ne peut pas la valider en supprimant les collisions. À la première profondeur centrale accessible, la racine signée est x≈8,03 mm (SmCo, z=3,625 mm) et x≈11,07 mm (N45, z=3,125 mm), et non uniformément 7 mm. Le noyau utilise aussi une demi-longueur effective de 7,817 mm, distincte du demi-verre de 7 mm.</p>
<p>La racine m=0 accessible est conservée numériquement (réponse résiduelle maximale ≈1,1×10⁻¹¹ mT). L’exigence « raccord au verre à 7 mm » reste non établie dans ce modèle à aimant de taille finie. Les régions non accessibles sont explicitement marquées dans nodal-roots.csv.</p></section>
<section><h2>6. Vues obliques : véritables iso-surfaces dans une tranche</h2><img src="figures/SMCO5-5X4-oblique.png"><img src="figures/N45-4X19-oblique.png"><p>Comparaison λ=0,5 / λ=1, limitée à |y|≤2 mm. Cette grille plus grossière sert à la lecture 3D, pas à mesurer les frontières ; les coupes et les recherches de racines portent les mesures.</p></section>
<section><h2>7. Contrôles supplémentaires et D2</h2><ul><li>D1 : écart maximal entre λ = 0 mm avec la recherche de racine existante ; invariance de réponse testée à 10⁻⁹ mT.</li><li>λ=1 reproduit la passe 3 à moins de 0,00005 mm (arrondi des tables).</li><li>{data['cutChecks']['validSamples']} poses valides dans les quatre grilles : aucune violation d’inclusion vert/jaune, aucune violation de monotonie en λ ; écart de reproduction B ≤7,2×10⁻¹⁵ mT.</li><li>Collision inchangée et symétrie par rotation autour du reed testées. Les tests ne certifient pas une physique réelle.</li></ul>
<p>Le « 6,5 / 8,0 mm » demandé pour D2 est enregistré dans le site pour MK04-B/M04 comme <strong>pull-in / drop-out</strong>, et non comme deux bornes de classe sur les deux aimants pilotes. Le registre est inclus dans results.json. En l’absence d’un modèle de réouverture et de la même géométrie/datum, le considérer comme une bande de validation pour cette étude serait incorrect. Ce contrôle reste à traiter séparément.</p></section>
<section><h2>8. Question de retour à Claude</h2><p>La famille proposée est correctement reproduite, mais aucun λ de la grille ne satisfait simultanément l’intention de forme et les contrôles. Faut-il accepter une autre hypothèse de réponse avec une justification indépendante, ou reconnaître que les seules distances documentaires ne déterminent pas la silhouette ? Une grille plus fine autour de λ=1 pourrait raffiner la limite de conformité, mais ne suffirait pas à prouver la forme voulue. Merci de revoir les coupes et la définition de l’invariant nodal avant de recommander une intégration.</p>
<p><a href="results.json">Résultats complets JSON</a> · <a href="controls.csv">560 bornes / contrôles CSV</a> · <a href="widths.csv">Largeurs</a> · <a href="dead-zones.csv">Zones mortes</a> · <a href="nodal-roots.csv">Nodales</a> · <a href="scores.csv">Scores</a>. Les 20 coupes individuelles, quatre grilles brutes JSON/CSV et deux grilles 3D sont incluses dans le dossier.</p></section></html>'''
(out/'index.html').write_text(page,encoding='utf8')
print('Figures and report:',out)
