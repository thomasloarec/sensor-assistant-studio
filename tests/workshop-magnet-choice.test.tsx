import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { expect, test } from 'bun:test';
import React, { useState } from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { MagnetPicker } from '../src/components/standex/workshop/magnet-picker';
import { workshopMagnetChoices } from '../src/lib/standex/workshop-magnet-choice';
import { DEFAULT_WORKSHOP, applySensorSelection, parseWorkshopConfig } from '../src/lib/standex/magnetic-workshop';
import { defaultMagnetFor, magnetOptionsFor } from '../src/lib/standex/default-pairs';
import { catalogueModel, cataloguePlacement } from '../src/lib/standex/catalogue-pedagogical';
import { createDossier } from '../src/lib/leadmagnet/dossier';
import { recordClientTrace, currentClientTrace } from '../src/lib/standex/client-pedagogical';
import { buildDossierExport, parseDossierExport } from '../src/lib/leadmagnet/dossier-io';
import { projectChecklist } from '../src/lib/leadmagnet/project-checklist';
import { submissionDto, technicalSummary } from '../src/lib/leadmagnet/submission';
import { INITIAL_NDA } from '../src/lib/leadmagnet/nda';
import { setLocale, LANGUAGES, t } from '../src/lib/i18n/core';
import { DEMO_ASSEMBLIES } from '../src/lib/standex/machine-demos';

if (typeof document === 'undefined') GlobalRegistrator.register({ url: 'http://localhost/' });

test('a tubular sensor can select the actual screw-mounted M04 without changing initial suggestions', () => {
  setLocale('fr');
  const before = magnetOptionsFor('MK07');
  let selected = defaultMagnetFor('MK07');
  function Harness() {
    const [value, setValue] = useState(selected);
    return <MagnetPicker sensorId="MK07" value={value} onChange={id => { selected = id; setValue(id); }} />;
  }
  const view = render(<Harness />);
  try {
    fireEvent.change(view.getByRole('combobox', { name: 'Forme et fixation' }), { target: { value: 'screw' } });
    expect(selected).toBe('M04');
    expect(view.getByRole('img', { name: 'Aperçu de l’aimant M04' })).toBeTruthy();
    expect(view.getByText(/AlNiCo : bonne stabilité/)).toBeTruthy();
    expect(workshopMagnetChoices('MK07').find(m => m.id === selected)?.model.holes?.length).toBeGreaterThan(0);
    expect(magnetOptionsFor('MK07')).toEqual(before);
    expect(magnetOptionsFor('MK07')).not.toContain('M04');
    expect(applySensorSelection(DEFAULT_WORKSHOP, 'MK07').magnetModel).toBe(defaultMagnetFor('MK07'));
  } finally { view.unmount(); }
});

test('same-size power choice changes the real reference/material; unknown strength stays unranked', () => {
  setLocale('fr');
  let selected = 'ALNICO500-4X19';
  function Harness() {
    const [value, setValue] = useState(selected);
    return <MagnetPicker sensorId="MK07" value={value} onChange={id => { selected = id; setValue(id); }} />;
  }
  const view = render(<Harness />);
  try {
    expect(view.getByRole('option', { name: 'Moins puissant' })).toBeTruthy();
    expect(view.getByRole('option', { name: 'Plus puissant' })).toBeTruthy();
    fireEvent.change(view.getByRole('combobox', { name: 'Puissance magnétique' }), { target: { value: '30.8' } });
    expect(selected).toBe('N45-4X19');
    expect(view.getByText(/Néodyme : forte puissance/)).toBeTruthy();
    expect(view.getByRole('combobox', { name: 'Dimensions de l’aimant' }).getAttribute('value')).not.toBe('');
    fireEvent.change(view.getByRole('combobox', { name: 'Puissance magnétique' }), { target: { value: 'null' } });
    expect(workshopMagnetChoices().find(m => m.id === selected)?.moment).toBeNull();
    expect(view.getByText('Valeur non publiée')).toBeTruthy();
  } finally { view.unmount(); }
});

test('opening and changing language preserves an exact variant, including undocumented N42 strength', () => {
  let calls = 0;
  const props = { sensorId: 'MK07', value: 'M36-N42', onChange: () => { calls++; } };
  const view = render(<MagnetPicker {...props} />);
  try {
    for (const locale of LANGUAGES) {
      setLocale(locale.id); view.rerender(<MagnetPicker {...props} />);
      expect(view.getByRole('combobox', { name: t('Puissance magnétique') }).textContent).toContain(t('Puissance non documentée'));
      expect(view.getByText('M36-N42')).toBeTruthy();
    }
    expect(calls).toBe(0);
  } finally { view.unmount(); setLocale('fr'); }
});

for (const magnetModel of ['M04', 'NDFEB-10X5X1.9']) test(`${magnetModel} survives tubular montage, result, dossier reload, Standex summary and submission`, () => {
  const machine = structuredClone(DEMO_ASSEMBLIES['builtin:wall-v1']!);
  const config = { ...applySensorSelection(DEFAULT_WORKSHOP, 'MK07'), magnetModel, guideReference: null, machine };
  const parsed = parseWorkshopConfig(JSON.parse(JSON.stringify(config)))!;
  expect(parsed.magnetModel).toBe(magnetModel);
  expect(parsed.machine).toEqual(config.machine);
  const model = catalogueModel(parsed);
  expect(model.magnetId).toBe(magnetModel);
  expect(model.field.kind).toBe(magnetModel === 'M04' ? 'cylinder' : 'block');
  // The real client evaluator accepts the mixed shape without borrowing a published pair distance.
  expect(['favorable', 'variable', 'unfavorable']).toContain(cataloguePlacement(parsed, { center: [0, 20, 0], axis: [1, 0, 0] }).state);
  const dossier = recordClientTrace(createDossier(), parsed);
  const resumed = parseDossierExport(JSON.parse(JSON.stringify(buildDossierExport(dossier))));
  expect(resumed.ok).toBe(true);
  if (!resumed.ok) throw Error('Dossier reload failed');
  expect(resumed.dossier.workshop?.magnetModel).toBe(magnetModel);
  expect(currentClientTrace(resumed.dossier)?.magnetId).toBe(magnetModel);
  expect(JSON.stringify(projectChecklist(resumed.dossier))).toContain(`MK07 + ${magnetModel}`);
  expect(technicalSummary(resumed.dossier)).toContain(magnetModel);
  const sent = submissionDto({ dossier: resumed.dossier, nda: INITIAL_NDA, consents: [], reviewAcknowledged: false, additionalConstraints: '' });
  expect(sent.workshop?.magnetModel).toBe(magnetModel);
  expect(sent.guidedMounting?.couple.magnetId).toBe(magnetModel);
});

test('the mounted workshop sends the newly selected M04 in its validated result, preserving wall motion', async () => {
  setLocale('fr');
  const { default: Workshop } = await import('../src/components/standex/workshop/workshop');
  const initial = { ...applySensorSelection(DEFAULT_WORKSHOP, 'MK07'), machine: structuredClone(DEMO_ASSEMBLIES['builtin:wall-v1']!) };
  let draft = initial;
  const results: string[] = [];
  const view = render(<Workshop clientPedagogical embedded initialConfig={initial} storageMode="memory" onClose={() => {}} onSave={async () => {}}
    onDraftChange={c => { draft = c as typeof initial; }} onClientPedagogicalResult={r => results.push(r.magnetId)} />);
  try {
    await act(async () => fireEvent.change(view.getByRole('combobox', { name: 'Forme et fixation' }), { target: { value: 'screw' } }));
    expect(draft.magnetModel).toBe('M04');
    expect(draft.sensorId).toBe('MK07');
    expect(draft.machine).toEqual(initial.machine);
    await act(async () => fireEvent.click(view.getByRole('button', { name: 'Valider ce choix et voir le résultat' })));
    expect(results).toEqual(['M04']);
  } finally { view.unmount(); }
});
