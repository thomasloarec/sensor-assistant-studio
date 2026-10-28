import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { describe, expect, test } from 'bun:test';
import React from 'react';
if (typeof document === 'undefined') GlobalRegistrator.register({ url: 'http://localhost/' });
import { render, fireEvent } from '@testing-library/react';
import { volumeKey, cutKey } from '../src/components/standex/workshop/pedagogical-controls';
import { smoothSurface } from '../src/components/standex/workshop/pedagogical-layer';
import { ClientPedagogicalControls } from '../src/components/standex/workshop/client-pedagogical-controls';
import { catalogueFrame, catalogueVolume } from '../src/lib/standex/catalogue-pedagogical';
import { DEFAULT_EXPERIMENT } from '../src/lib/detection-lab/workshop-experiment';
import { DEFAULT_WORKSHOP, type WorkshopConfig } from '../src/lib/standex/magnetic-workshop';
import type { VolumeField } from '../src/lib/standex/catalogue-pedagogical';

const config: WorkshopConfig = { ...DEFAULT_WORKSHOP, sensorId: 'MK04', magnetModel: 'M04', sensitivity: 'C' };

describe('lot UX 28/10 — lobes en mouvement', () => {
  test('la clé du volume 3D ignore la translation : même orientation, deux instants', () => {
    const a = catalogueFrame(config, 0.1), b = catalogueFrame(config, 0.6);
    expect(a.pose.center).not.toEqual(b.pose.center);
    expect(volumeKey(DEFAULT_EXPERIMENT, a, null, config)).toBe(volumeKey(DEFAULT_EXPERIMENT, b, null, config));
  });
  test('la clé du volume change avec l’orientation complète du corps (quart de tour)', () => {
    const turned: WorkshopConfig = { ...config, magnetAngle: config.magnetAngle + 90 };
    const a = catalogueFrame(config, 0.5), b = catalogueFrame(turned, 0.5);
    expect(volumeKey(DEFAULT_EXPERIMENT, a, null, config)).not.toBe(volumeKey(DEFAULT_EXPERIMENT, b, null, turned));
  });
  test('la clé de coupe suit le plan choisi', () => {
    const a = catalogueFrame(config, 0.2), b = catalogueFrame(config, 0.8);
    expect(cutKey(DEFAULT_EXPERIMENT, a, null, config)).not.toBe(cutKey(DEFAULT_EXPERIMENT, b, null, config));
  });
  test('le volume catalogue expose le champ échantillonné complet pour le rendu lisse', () => {
    const f = catalogueFrame(config, 0.5);
    const v = catalogueVolume(config, f.pose.axis, 0, [], 24, f.pose.frame);
    expect(v.field.values.length).toBe(v.field.xs.length * v.field.ys.length * v.field.zs.length);
    expect(v.field.values.some((x) => x !== null && x > 0)).toBe(true);
  });
});

describe('lot UX 28/10 — rendu lisse', () => {
  const grid = (values: (number | null)[], blocked?: boolean[]): VolumeField => ({ xs: [0, 1, 2, 3, 4], ys: [0, 1, 2], zs: [0, 1, 2], values, blocked: blocked ?? values.map(() => false) });
  test('deux lobes séparés par une zone nulle ne sont jamais pontés', () => {
    // Deux régions > seuil séparées par un plan de zéros : aucune arête ne peut les relier.
    const values: (number | null)[] = [];
    for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) values.push(i === 1 || i === 3 ? 10 : 0);
    const g = smoothSurface(grid(values), 5);
    const pos = g.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
    const idx = g.getIndex()!;
    for (let t = 0; t < idx.count; t += 3) {
      for (const [a, b] of [[idx.getX(t), idx.getX(t + 1)], [idx.getX(t + 1), idx.getX(t + 2)], [idx.getX(t + 2), idx.getX(t)]]) {
        const dx = pos.getX(a) - pos.getX(b), dy = pos.getY(a) - pos.getY(b), dz = pos.getZ(a) - pos.getZ(b);
        expect(Math.hypot(dx, dy, dz)).toBeLessThan(1.6);
      }
    }
  });
  test('les positions masquées mécaniquement restent hors de la surface', () => {
    const values: (number | null)[] = [];
    for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) values.push(10);
    const blocked = values.map((_, n) => n % 15 < 5);
    const g = smoothSurface(grid(values, blocked), 5);
    const pos = g.getAttribute('position');
    for (let n = 0; n < pos.count; n++) expect(pos.getX(n)).toBeGreaterThan(0.9);
  });
  test('un champ entièrement nul ne produit aucune surface', () => {
    const g = smoothSurface(grid(Array(45).fill(0)), 5);
    expect(g.getAttribute('position').count).toBe(0);
  });
});

describe('lot UX 28/10 — colonne de découverte', () => {
  const renderControls = (cfg: WorkshopConfig = config) => {
    const patches: Partial<WorkshopConfig>[] = [];
    const r = render(<ClientPedagogicalControls config={cfg} update={(p) => patches.push(p)} onCatalog={() => {}} onExplore={() => {}} onCable={() => {}} approachControls={<div data-testid="approach-picker" />} />);
    return { r, patches };
  };
  test('trois choix visibles, aucun curseur numérique rejeté', () => {
    const { r } = renderControls();
    expect(r.getByTestId('approach-picker')).toBeTruthy();
    expect(r.getByText('Mouvement')).toBeTruthy();
    expect(r.getByTestId('quarter-turn')).toBeTruthy();
    for (const gone of ['Écart au départ', 'Écart au plus près', 'Décalage latéral', 'Orientation propre du reed', 'Inclinaison hors du plan', 'Demi-course latérale'])
      expect(r.queryByLabelText(gone)).toBeNull();
    expect(r.getByText('Caractéristiques du couple')).toBeTruthy();
    expect(r.getByText('Sources et limites')).toBeTruthy();
  });
  test('le quart de tour tourne de 90° relatif à la pose courante', () => {
    const { r, patches } = renderControls({ ...config, magnetAngle: 30 });
    fireEvent.click(r.getByTestId('quarter-turn'));
    expect(patches).toEqual([{ magnetAngle: 120 }]);
  });
  test('le choix du mouvement ne réécrit aucune dimension existante', () => {
    const { r, patches } = renderControls();
    fireEvent.click(r.getByText('Passage latéral'));
    expect(patches).toEqual([{ motion: 'slide' }]);
  });
});
