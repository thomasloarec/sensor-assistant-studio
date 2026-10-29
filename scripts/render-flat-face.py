from pathlib import Path
import sys,json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
out=Path(sys.argv[1] if len(sys.argv)>1 else '../detection-c1-flat-20261029').resolve()
rows=[]
for orient in ['parallel','perpendicular']:
 fig,axs=plt.subplots(3,2,figsize=(13,12))
 for row,mag in enumerate(['SMCO5-5X4','N45-4X19','M04']):
  r=json.loads((out/f'{mag}-{orient}.json').read_text());shape=(len(r['ys']),len(r['xs']));a=np.array(r['m1'],float).reshape(shape);b=np.array(r['m2'],float).reshape(shape);amp=abs((a+b)/2);blocked=np.array(r['blocked']).reshape(shape)|~np.isfinite(amp)
  for col,name in enumerate(['A','C1 %']):
   v=amp if col==0 else np.where((a*b>0)&(np.minimum(abs(a),abs(b))>.01*amp),amp,0)
   ax=axs[row,col];ax.contourf(r['xs'],r['ys'],np.where(blocked,1,np.nan),levels=[.5,1.5],colors=['#d5d9de'])
   data=np.ma.masked_where(blocked,v);ax.contourf(r['xs'],r['ys'],data,levels=[r['thresholds']['low'],r['thresholds']['high'],1e9],colors=['#e3c87c','#57b8ac'])
   ax.contour(r['xs'],r['ys'],data,levels=[r['thresholds']['low'],r['thresholds']['high']],colors=['#254061'],linewidths=.7)
   ax.plot([-7,7],[0,0],color='#254061',lw=3);ax.set(xlim=(-30,30),ylim=(0,26),aspect='equal',xlabel='x du centre (mm)',ylabel='y du centre (mm)',title=f'MK04 + {mag} · {name}');ax.grid(alpha=.15)
   if orient=='parallel':
    samples=[];mid=len(r['xs'])//2
    for j,y in enumerate(r['ys']):
     if blocked[j,mid] or v[j,mid]<r['thresholds']['low']:continue
     end=mid
     while end+1<len(r['xs']) and not blocked[j,end+1] and v[j,end+1]>=r['thresholds']['low']:end+=1
     samples.append((y,r['xs'][end]))
    if samples:
     peak=max(samples,key=lambda p:p[1]);rows.append({'magnet':mag,'model':name,'contact_center_mm':r['firstCentralClearanceMm'],'first_y_mm':samples[0][0],'first_half_width_mm':samples[0][1],'peak_y_mm':peak[0],'peak_half_width_mm':peak[1]})
 fig.suptitle('Approche par la face plate · coupe XY, z = 0 · classe C\nAimant '+('parallèle' if orient=='parallel' else 'perpendiculaire')+' · pas 0,25 mm · enveloppes complètes',fontsize=16)
 fig.legend(handles=[Patch(color='#57b8ac',label='Borne moins sensible'),Patch(color='#e3c87c',label='Dispersion de classe'),Patch(color='#d5d9de',label='Collision des enveloppes')],loc='lower center',ncol=3)
 fig.tight_layout(rect=(0,.04,1,.94));fig.savefig(out/f'face-plate-{orient}.png',dpi=140);plt.close(fig)
(out/'summary.json').write_text(json.dumps(rows,indent=2))
(out/'index.html').write_text('''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>C1 % — face plate</title><style>body{font:18px/1.6 system-ui;color:#254061;background:#f3f6f9;margin:24px auto;max-width:1100px;padding:20px}img{width:100%}section{padding:20px;background:white;margin:20px 0;border-radius:16px}</style><h1>C1 % intégré — approche par la face plate</h1><section><p>Le modèle C avec bande relative de 1 % est utilisé sans changer L, k ni les corrections documentaires. L'atelier affiche maintenant la coupe selon l'axe du reed et la normale à la face plate, au centre du capteur. Un aimant hors de ce plan est signalé, jamais projeté comme s'il se trouvait dans un lobe.</p><p>Correction de lecture : les anciennes figures étaient dans le plan XZ, avec 13,9 mm d'encombrement transverse. Ici, le plan XY traverse l'épaisseur 5,9 mm. Le premier centre accessible est à 5,45 mm pour SmCo et 5,9 mm pour M04 en parallèle. Les 14 mm cités pour M04 ne sont donc pas valables pour une approche face plate contre face plate.</p><p>Les dimensions de boîtier et les poses importées restent inchangées. M04 conserve son modèle magnétique équivalent hypothétique. La porte de signe est une hypothèse, pas une mesure de force. La marge de 1 % n'élimine pas sa discontinuité. Les contrôles de distances restent à 43/45, avec la réserve de biais D3 déjà documentée.</p></section><section><img src="face-plate-parallel.png"><img src="face-plate-perpendicular.png"></section><section><a href="summary.json">Mesures des largeurs accessibles</a> · <a href="INTEGRATION_C1.md">Compte rendu d'intégration</a></section>''',encoding='utf8')
print(json.dumps(rows,indent=2))
