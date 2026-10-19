import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/controller-menu.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {ControllerMenu}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function fixture(context='desktop') {
  let calls=0,guard=null;
  const actions=Array.from({length:8},(_,i)=>({id:'action'+i,label:'Action '+i,run:()=>{calls++;return 'done';}}));
  actions[0].confirm='Confirm reset?';actions[1].desktopOnly=true;actions[2].available=()=>guard;actions[3].run=()=>{throw Error('Simulated failure');};
  return {menu:new ControllerMenu([{id:'first',label:'First',description:'Description',actions}],context),calls:()=>calls,guard:value=>{guard=value;}};
}
test('categories, pagination, bounded selection and back',()=>{
  const {menu}=fixture();menu.activate('first');assert.equal(menu.title,'First');assert.equal(menu.entries.length,6);assert.equal(menu.pageCount,2);
  menu.turnPage(1);assert.equal(menu.entries[0].id,'action6');menu.move(-1);assert.equal(menu.selected,1);menu.turnPage(1);assert.equal(menu.page,0);menu.back();assert.equal(menu.category,null);
});
test('confirmation cancellation and changed-state guard',()=>{
  const f=fixture();f.menu.activate('first');f.menu.activate('action0');assert.ok(f.menu.pending);assert.equal(f.calls(),0);f.menu.activate('cancel');assert.equal(f.calls(),0);
  f.menu.activate('action0');f.menu.activate('confirm');assert.equal(f.calls(),1);
  f.menu.activate('action2');assert.equal(f.calls(),2);f.guard('Not ready');f.menu.activate('action2');assert.equal(f.calls(),2);assert.equal(f.menu.message,'Not ready');
});
test('XR desktop-only guards and visible action failures',()=>{
  const f=fixture('xr');f.menu.activate('first');f.menu.activate('action1');assert.equal(f.calls(),0);assert.match(f.menu.message,/page/);
  f.menu.activate('action3');assert.match(f.menu.message,/Simulated failure/);f.menu.activate('unknown');assert.equal(f.calls(),0);
});
