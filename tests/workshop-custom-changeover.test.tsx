import {test,expect,afterEach} from 'bun:test';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {render,cleanup} from '@testing-library/react';
import {DEFAULT_WORKSHOP,applySensorSelection,parseWorkshopConfig,poseAt} from '../src/lib/standex/magnetic-workshop';
import {SENSOR_CATALOG} from '../src/lib/standex/sensor-catalog';
import {discoveryPatch} from '../src/lib/standex/discovery-preset';
import {changeoverBlades} from '../src/lib/standex/changeover-contacts';
import ContactCircuit from '../src/components/standex/workshop/contact-circuit';
import {setLocale} from '../src/lib/i18n/core';
if(typeof document==='undefined')GlobalRegistrator.register({url:'http://localhost/'});
afterEach(cleanup);

test('Custom lateral preset is accepted and sweeps through the sensor, then returns',()=>{
 const initial=applySensorSelection(DEFAULT_WORKSHOP,'CUSTOM');
 const c={...initial,...discoveryPatch(initial,{motion:'slide'})};
 expect(parseWorkshopConfig(c)).not.toBeNull();
 const positions=[0,.25,.5,.75,1].map(t=>poseAt(c,t).position);
 expect(positions.map(p=>p[0])).toEqual([-50,0,50,0,-50]);
 expect(new Set(positions.map(p=>p[2])).size).toBe(1);
 expect(positions.every(p=>p[1]===0)).toBe(true);
});

test('every catalogue sensor gets a valid lateral preset in both arrangements',()=>{
 for(const sensor of SENSOR_CATALOG)for(const geometry of ['D1','D3'] as const){
  const initial=applySensorSelection(DEFAULT_WORKSHOP,sensor.id);
  const c={...initial,...discoveryPatch(initial,{motion:'slide',geometry})};
  expect(parseWorkshopConfig(c),`${sensor.id} ${geometry}`).not.toBeNull();
 }
});

test('Form C transfers one energized branch A to B, matching the visible blades',()=>{
 setLocale('fr');
 const r=render(<ContactCircuit formC contact="open"/>);
 expect(r.getByRole('img').getAttribute('aria-label')).toBe('Circuit A actif');
 expect(r.container.querySelectorAll('[data-active="true"]')).toHaveLength(1);
 expect(r.container.querySelector('[data-active="true"]')?.getAttribute('data-branch')).toBe('A');
 const rest=changeoverBlades(10,1,'open');expect(rest[2][1]).toEqual(rest[0][1]);
 r.rerender(<ContactCircuit formC contact="closed"/>);
 expect(r.getByRole('img').getAttribute('aria-label')).toBe('Circuit B actif');
 expect(r.container.querySelectorAll('[data-active="true"]')).toHaveLength(1);
 expect(r.container.querySelector('[data-active="true"]')?.getAttribute('data-branch')).toBe('B');
 const active=changeoverBlades(10,1,'closed');expect(active[2][1]).toEqual(active[1][1]);
 expect(r.queryByText('Contact fermé')).toBeNull();
});

test('invalid or unknown Form C states energize neither branch; Form A remains binary',()=>{
 setLocale('fr');const r=render(<ContactCircuit formC contact="closed" unavailable/>);
 expect(r.container.querySelectorAll('[data-active="true"]')).toHaveLength(0);
 expect(r.getByRole('img').getAttribute('aria-label')).toBe('Simulation indisponible à cette position');
 r.rerender(<ContactCircuit formC contact="unknown"/>);
 expect(r.container.querySelectorAll('[data-active="true"]')).toHaveLength(0);
 expect(r.getByRole('img').getAttribute('aria-label')).toBe('État indéterminé');
 r.rerender(<ContactCircuit contact="closed"/>);
 expect(r.getByText('Contact fermé')).toBeTruthy();
 expect(r.container.querySelector('[data-branch]')).toBeNull();
});
