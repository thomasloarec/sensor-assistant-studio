import {expect,test} from 'bun:test';
import {spawnSync} from 'node:child_process';
test('the actual tracker honors consent, exclusions and submission ordering',()=>{
  const run=spawnSync(process.execPath,['tests/fixtures/usage-client-check.ts'],{encoding:'utf8',timeout:10000});
  expect({status:run.status,error:run.stderr}).toEqual({status:0,error:''});
},15000);
