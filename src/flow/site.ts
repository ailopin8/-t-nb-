import {FlowRuntime} from './runtime';
import type {Payload} from './runtime';
export const siteFlow=new FlowRuntime();
export const latestSignals=new Map<string,Payload>();
const handlers=new Map<string,()=>void>();
const inputs=new Map<string,(payload:Payload)=>void>();
const moduleFor=(target:string)=>target.startsWith('g7-')?'g7':target.startsWith('g8-')?'g8':target.startsWith('g9-')?'g9':target.startsWith('g10-')?'composition':target.startsWith('flow-')?'workflow':'g6';
siteFlow.register({id:'controllers',label:'Controller menu',inputs:{},outputs:{g6:'command',g7:'command',g8:'command',g9:'command',composition:'command',workflow:'command'}});
for(const id of ['g6','g7','g8','g9','composition','workflow']) {
  siteFlow.register({id,label:id==='composition'?'G10 composition':id.toUpperCase(),inputs:{command:'command',...(id==='g9'?{source:'source' as const,binary:'binary' as const}:{}),...(id==='composition'?{binary:'binary' as const}:{})},outputs:{state:'snapshot',binary:'binary',evidence:'evidence',annotation:'annotation'},receive:(port,payload)=>{
    if(port!=='command'){latestSignals.set(id+':'+port,payload);inputs.get(id+':'+port)?.(payload);return;}
    const target=String(payload.target),handler=handlers.get(target);
    if(moduleFor(target)!==id)throw Error('This module cannot process '+target+'.');
    if(handler)handler();else {
      const button=document.getElementById(target) as HTMLButtonElement|null;
      if(!button||button.disabled)throw Error('Control is not ready: '+target);
      button.click();
    }
  }});
  siteFlow.connect({id:'controls-'+id,from:'controllers',output:id,to:id,input:'command',enabled:true,delayed:false});
}
siteFlow.register({id:'sources',label:'Source editors',inputs:{},outputs:{source:'source'}});
siteFlow.connect({id:'source-g9',from:'sources',output:'source',to:'g9',input:'source',enabled:true,delayed:false});
for(const id of ['metrics','notebook','exports','references']) {
  siteFlow.register({id,label:id[0].toUpperCase()+id.slice(1),inputs:{data:id==='notebook'?'annotation':id==='exports'?'evidence':'snapshot'},outputs:{},receive:(_port,payload)=>{latestSignals.set(id,payload);inputs.get(id+':data')?.(payload);if(id==='exports'&&payload.download===true){const blob=new Blob([JSON.stringify(payload.data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=String(payload.filename);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}});
}
for(const id of ['g6','g7','g8','g9','composition','workflow']) {
  siteFlow.connect({id:id+'-metrics',from:id,output:'state',to:'metrics',input:'data',enabled:true,delayed:false});
  siteFlow.connect({id:id+'-exports',from:id,output:'evidence',to:'exports',input:'data',enabled:true,delayed:false});
}
for(const id of ['g8','g9'])siteFlow.connect({id:id+'-notebook',from:id,output:'annotation',to:'notebook',input:'data',enabled:true,delayed:false});
export function registerView(id:string,render:()=>void) {
  const view=id+'-view';
  siteFlow.register({id:view,label:id.toUpperCase()+' view',inputs:{state:'snapshot'},outputs:{},receive:(_port,payload)=>{if(payload.module!==id)throw Error('View requires a snapshot from '+id+'.');render();}});
  siteFlow.connect({id:id+'-view',from:id,output:'state',to:view,input:'state',enabled:true,delayed:false});
}
export function requestControl(target:string) {
  const module=moduleFor(target);
  if(!siteFlow.emit('controllers',module,{target}))throw Error('The controller → '+module+' edge is disconnected. Reconnect it in Modular workflow.');
}
export function bindControl(target:string,handler:()=>void) {handlers.set(target,handler);}
export function publishState(id:string,payload:Payload) {siteFlow.emit(id,'state',{...payload,module:id});}
export function sourceForDiscovery() {
  const source=(document.getElementById('g8-source') as HTMLTextAreaElement).value;
  const edge=[...siteFlow.edges.values()].find(edge=>edge.from==='sources'&&edge.output==='source'&&edge.to==='g9'&&edge.input==='source'&&edge.enabled&&!edge.delayed);
  if(!edge)throw Error('Source editor → G9 needs an enabled immediate edge. Reconnect source-g9 in Modular workflow.');
  siteFlow.emit('sources','source',{source});
  return source;
}

export function bindInput(id:string,port:string,handler:(payload:Payload)=>void) {inputs.set(id+':'+port,handler);}
export function sendEvidence(id:string,filename:string,data:unknown) {
  const recipients=siteFlow.emit(id,'evidence',{filename,data,download:true});
  if(!recipients) {
    const status=document.getElementById(id==='g6'?'toast':id==='g7'?'g7-diagnostics':id==='g8'?'g8-diagnostic':id==='g9'?'g9-status':id==='workflow'?'flow-status':'g10-status');
    if(status)status.textContent='Export disconnected. Reconnect '+id+'-exports in Modular workflow.';
  }
  return recipients>0;
}
siteFlow.connect({id:'g8-composition',from:'g8',output:'binary',to:'composition',input:'binary',enabled:true,delayed:false});
siteFlow.connect({id:'composition-g9',from:'composition',output:'binary',to:'g9',input:'binary',enabled:true,delayed:false});
