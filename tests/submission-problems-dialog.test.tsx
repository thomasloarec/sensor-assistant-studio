import { afterEach, expect, test } from 'bun:test';
import React from 'react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
if (typeof document === 'undefined') GlobalRegistrator.register({ url: 'http://localhost/' });
const { render, cleanup } = await import('@testing-library/react');
const { SubmissionProblemsDialog } = await import('../src/components/leadmagnet/submission-problems-dialog');
import { INITIAL_NDA, enableNda } from '../src/lib/leadmagnet/nda';
import { setLocale } from '../src/lib/i18n/core';
afterEach(() => { cleanup(); setLocale('fr'); });

test('a completed NDA form still requires verified proof, without falsely listing missing fields', () => {
  setLocale('en');
  const nda = enableNda(INITIAL_NDA);
  nda.fields = Object.fromEntries(Object.keys(nda.fields).map(key => [key, key === 'standexDate' ? '' : 'Provided'])) as typeof nda.fields;
  const view = render(<SubmissionProblemsDialog nda={nda} problems={["NDA requis : aucun transfert confidentiel n'est possible sans preuve vérifiée d'un NDA en vigueur."]} onClose={() => {}} onOpenNda={() => {}} />);
  expect(view.getByRole('dialog').textContent).toContain('Your project has not been sent');
  expect(view.getByRole('dialog').textContent).not.toContain('NDA information to complete');
  expect(view.getByRole('dialog').textContent).toMatch(/verified|evidence|proof/i);
  expect(view.getByRole('button', { name: /NDA/ })).toBeTruthy();
});

test('turning NDA off removes NDA details while preserving mandatory-field problems', () => {
  setLocale('en');
  const view = render(<SubmissionProblemsDialog nda={INITIAL_NDA} problems={['Choisissez une industrie.']} onClose={() => {}} onOpenNda={() => {}} />);
  expect(view.getByRole('dialog').textContent).toMatch(/industry/i);
  expect(view.getByRole('dialog').textContent).not.toContain('NDA');
});
