import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
async function moduleFrom(source) {
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
let g7Source=fs.readFileSync(new URL('../src/g7.ts',import.meta.url),'utf8');
g7Source=g7Source.slice(g7Source.indexOf('type '),g7Source.indexOf('function el<'))+'\nexport {parseSource,BinaryMachine,PRESETS,paired,encode,decode,pack,unpack};';
const g7=await moduleFrom(g7Source);
let g8Source=fs.readFileSync(new URL('../src/g8.ts',import.meta.url),'utf8');
g8Source=g8Source.slice(g8Source.indexOf('type MatrixID'),g8Source.indexOf('const section=document.createElement'))+'\nexport {compile,VM,examples,experiment,enc,dec,pack,unpack};';
const g8=await moduleFrom(g8Source);
const {analyze}=await import('../src/discovery.js');
const {runAblationExperiment}=await moduleFrom(fs.readFileSync(new URL('../src/emergence.ts',import.meta.url),'utf8'));
test('G7 grammar, 24-bit instructions, packet round trips and paired controls',()=>{
  for(const source of Object.values(g7.PRESETS)) {
    const program=g7.parseSource(source);assert.deepEqual(g7.paired(program),g7.paired(program));
  }
  for(const address of [0,1,421,999])assert.equal(g7.decode(g7.encode(1,address,255)).address,address);
  assert.throws(()=>g7.parseSource('SYSTEM A AT (10,0,0) ENERGY 10 BIAS 0 PURPOSE "invalid"'));
});
test('G8 presets deterministically exchange binary packets with delayed delivery',()=>{
  for(const source of Object.values(g8.examples)) {
    const p=g8.compile(source),a=new g8.VM(p),b=new g8.VM(p);a.run(24);b.run(24);
    assert.deepEqual(a.states,b.states);assert.deepEqual(a.queue,b.queue);
    for(const state of a.states)assert.ok(state.bits.every(bit=>bit===0||bit===1));
  }
  const vm=new g8.VM(g8.compile(g8.examples.feedback));vm.step();assert.ok(vm.queue.length);assert.equal(vm.states[0].packets,0);vm.step();assert.ok(vm.states.some(s=>s.packets>0));
  for(const address of [0,421,999]){assert.equal(g8.dec(g8.enc(1,address,1)).address,address);assert.equal(g8.unpack(g8.pack(1,2,address,1,1)).address,address);}
  assert.throws(()=>g8.pack(16,2,0,1,1));assert.throws(()=>g8.pack(1,2,.5,1,1));
  assert.throws(()=>g8.compile('MATRIX A RULE 01011010\nMATRIX A RULE 00000000'));
  assert.throws(()=>g8.compile('MATRIX A RULE 01011010\nA SEND TO B LIMIT 0'));
});
test('G9 all interventions and durations replay exactly; no-op and uncoupling controls',()=>{
  const p=g8.compile(g8.examples.feedback);
  for(const mode of ['none','flip','uncouple'])for(const ticks of [1,8,24,128]) {
    const config={mode,ticks,address:999,tick:ticks-1};const result=analyze(g8.VM,p,config);
    assert.deepEqual(result,analyze(g8.VM,p,config));
    if(mode==='none')assert.ok(result.differences.every(d=>d.matrices.every(m=>m.differentBits===0)));
    if(mode==='uncouple'&&ticks>=8)assert.ok(result.differences.some(d=>d.matrices.some(m=>m.differentBits>0)));
  }
});
test('G6 matched ablations are reproducible, non-mutating and reject invalid horizons',()=>{
  const field=()=>new Float32Array(1000).fill(.2);
  const edge={id:1,from:1,to:2,strength:.5,mode:'excite',enabled:true};
  const network={worlds:[{id:1,outputLayerId:1,layers:[{id:1,algorithm:'test',state:field()},{id:2,algorithm:'test',state:field()}],innerLinks:[edge]}],externalLinks:[]};
  const before=structuredClone(network);const evolve=(layer,input)=>Float32Array.from(layer.state,(v,i)=>Math.max(0,Math.min(1,v*.95+input[i]*.1)));
  for(const ablation of ['all','internal','external']) {
    const result=runAblationExperiment(network,evolve,10,ablation);assert.deepEqual(result,runAblationExperiment(network,evolve,10,ablation));
    if(ablation==='external')assert.equal(result.finalDivergence,0);else assert.ok(result.finalDivergence>0);
  }
  assert.deepEqual(network,before);assert.throws(()=>runAblationExperiment(network,evolve,0,'all'));
});
