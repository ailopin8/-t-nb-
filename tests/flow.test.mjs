import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/flow/runtime.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {FlowRuntime}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function fixture() {const flow=new FlowRuntime();const seen=[];flow.register({id:'a',label:'A',inputs:{data:'snapshot'},outputs:{data:'snapshot'}});flow.register({id:'b',label:'B',inputs:{data:'snapshot'},outputs:{data:'snapshot'},receive:(_port,p)=>seen.push(p)});return {flow,seen};}
const edge={id:'ab',from:'a',output:'data',to:'b',input:'data',enabled:true,delayed:false};
test('typed deliveries, copying, disconnection and trace',()=>{const {flow,seen}=fixture();flow.connect(edge);const data={value:3};flow.emit('a','data',data);data.value=7;assert.equal(seen[0].value,3);assert.equal(flow.trace[0].status,'delivered');flow.enable('ab',false);assert.equal(flow.emit('a','data',{value:9}),0);assert.equal(seen.length,1);});
test('cycles require delayed edges and explicit ticks',()=>{const {flow,seen}=fixture();flow.connect(edge);assert.throws(()=>flow.connect({...edge,id:'ba',from:'b',to:'a'}),/delayed/);flow.connect({...edge,id:'ba',from:'b',to:'a',delayed:true});flow.emit('b','data',{value:1});assert.equal(flow.trace.length,0);flow.advance();assert.equal(flow.trace.length,1);assert.equal(seen.length,0);});
test('invalid signals, incompatible ports and atomic imports are rejected',()=>{const {flow}=fixture();flow.register({id:'bits',label:'Bits',inputs:{data:'binary'},outputs:{data:'binary'}});assert.throws(()=>flow.connect({...edge,to:'bits'}),/compatible/);assert.throws(()=>flow.emit('bits','data',{bits:'10'}),/1000/);assert.throws(()=>flow.emit('a','data',{n:NaN}),/finite/);flow.connect(edge);const before=flow.snapshot();assert.throws(()=>flow.restore({format:'atunbi.workflow.v1',edges:[edge,{...edge,id:'missing',to:'unknown'}]}));assert.deepEqual(flow.snapshot(),before);});
test('receiver failures are traced and later commands recover',()=>{const {flow}=fixture();flow.nodes.get('b').receive=()=>{throw Error('bad processor');};flow.connect(edge);assert.throws(()=>flow.emit('a','data',{}),/bad processor/);assert.equal(flow.trace.at(-1).status,'failed');flow.nodes.get('b').receive=()=>{};flow.emit('a','data',{});assert.equal(flow.trace.at(-1).status,'delivered');});
