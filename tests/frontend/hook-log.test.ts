import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { expect, it } from 'vitest';
it('preserves a new API first hit during a saturated batch while limiting repeats', () => {
  const batches: {events: {api:string}[]; dropped:number}[] = [];
  const context = createContext({ rpc: {exports:{}}, setInterval:()=>0, send:(value:any)=>batches.push(value) });
  runInContext(readFileSync('backend/hooks/runtime.js','utf8'),context);
  runInContext("for(let i=0;i<500;i++) record('GetLocaleInfoW',1,2); record('RegQueryValueExW',45,122); flush();",context);
  expect(batches.flatMap(b=>b.events).some(e=>e.api==='RegQueryValueExW')).toBe(true);
  expect(batches.every(b=>b.events.length<=100)).toBe(true);
  expect(batches.reduce((n,b)=>n+b.dropped,0)).toBe(399);
});
