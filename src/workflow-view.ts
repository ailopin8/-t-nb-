import {siteFlow,sendEvidence} from './flow/site';
const section=document.createElement('section');section.id='modular-workflow';section.className='panel4 flow-lab';section.tabIndex=-1;
section.innerHTML=`<span class="micro">13 / MODULAR WEBSITE WORKFLOW</span><h2>Every module has ports. Every edge carries data.</h2><p>The controller menu sends commands to lab modules. Models publish snapshots to views and metrics. Source editors feed discovery; composition can receive G8 bits and send its bits to G9. Evidence and annotations have separate sinks. Disabling an edge stops subsequent delivery while retaining the consumer’s last state.</p>
<div class="flow-scroll" aria-hidden="true"><svg id="flow-map" viewBox="0 0 1060 620"></svg></div>
<div id="flow-nodes" class="flow-nodes"></div>
<form id="flow-connect" novalidate><label>Output <select id="flow-from" required></select></label><label>Input <select id="flow-to" required></select></label><label><input id="flow-delay" type="checkbox"> Deliver on next workflow tick</label><button type="submit">Connect modules</button></form>
<div class="g8-controls"><button id="flow-tick">Advance workflow tick</button><button id="flow-reset">Restore default wiring</button><button id="flow-save">Save wiring in browser</button><button id="flow-load">Load saved wiring</button><button id="flow-export">Export wiring JSON</button><label>Import wiring <input id="flow-file" type="file" accept=".json,application/json"></label></div>
<p id="flow-status" role="status" aria-live="polite">Ready. Delayed edges deliver only when you advance the workflow tick.</p>
<div class="flow-scroll" tabindex="0" role="region" aria-label="Workflow edges, scroll horizontally if needed"><table><caption>Executable website connections</caption><thead><tr><th scope="col">Enabled</th><th scope="col">Output → input</th><th scope="col">Scheduling</th><th scope="col">Deliveries</th><th scope="col">Remove</th></tr></thead><tbody id="flow-edges"></tbody></table></div>
<details><summary>Delivery trace and module contracts</summary><pre id="flow-trace"></pre><p>Signals are copied at boundaries, checked against port types and bounded to prevent unbounded propagation. Synchronous cycles are rejected. Delayed feedback is stepped explicitly. Numeric annotations never enter a binary instruction stream.</p></details>`;
document.querySelector('#g10-lab')!.insertAdjacentElement('afterend',section);
const get=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const defaults=siteFlow.snapshot();let topology='';
const status=(message:string)=>{get('flow-status').textContent=message;};
function render() {
  const current=JSON.stringify({nodes:[...siteFlow.nodes.keys()],edges:siteFlow.snapshot().edges});
  if(current!==topology) {
    const focused=document.activeElement instanceof HTMLInputElement?document.activeElement.dataset.edge:null;
    topology=current;get('flow-nodes').replaceChildren();get('flow-edges').replaceChildren();
    const oldFrom=get<HTMLSelectElement>('flow-from').value,oldTo=get<HTMLSelectElement>('flow-to').value;
    get('flow-from').replaceChildren();get('flow-to').replaceChildren();
    for(const node of siteFlow.nodes.values()) {
      const card=document.createElement('article'),title=document.createElement('h3'),ports=document.createElement('p');title.textContent=node.label;
      ports.textContent='IN: '+(Object.entries(node.inputs).map(([key,type])=>key+' ['+type+']').join(', ')||'none')+'\nOUT: '+(Object.entries(node.outputs).map(([key,type])=>key+' ['+type+']').join(', ')||'none');card.append(title,ports);get('flow-nodes').append(card);
      for(const [port,type] of Object.entries(node.outputs)){const option=document.createElement('option');option.value=node.id+'.'+port;option.textContent=node.label+' / '+port+' ['+type+']';get('flow-from').append(option);}
      for(const [port,type] of Object.entries(node.inputs)){const option=document.createElement('option');option.value=node.id+'.'+port;option.textContent=node.label+' / '+port+' ['+type+']';get('flow-to').append(option);}
    }
    if([...get<HTMLSelectElement>('flow-from').options].some(o=>o.value===oldFrom))get<HTMLSelectElement>('flow-from').value=oldFrom;
    if([...get<HTMLSelectElement>('flow-to').options].some(o=>o.value===oldTo))get<HTMLSelectElement>('flow-to').value=oldTo;
    const svg=get('flow-map');svg.replaceChildren();
    const ns='http://www.w3.org/2000/svg',positions=new Map<string,{x:number;y:number}>();
    const groups=[['controllers','sources','reference-source','identity'],['g6','g7','g8','g9','composition','workflow'],['g6-view','g7-view','g8-view','g9-view','composition-view','references','shell'],['metrics','exports','notebook']];
    groups.forEach((ids,column)=>ids.forEach((id,row)=>positions.set(id,{x:15+column*265,y:20+row*82})));
    for(const edge of siteFlow.edges.values()) {
      const from=positions.get(edge.from),to=positions.get(edge.to);if(!from||!to)continue;
      const path=document.createElementNS(ns,'path');path.setAttribute('d',`M${from.x+205},${from.y+23} C${from.x+240},${from.y+23} ${to.x-35},${to.y+23} ${to.x},${to.y+23}`);path.setAttribute('fill','none');path.setAttribute('stroke',edge.enabled?'#70c9dc':'#536879');path.setAttribute('stroke-width',edge.enabled?'2':'1');if(!edge.enabled||edge.delayed)path.setAttribute('stroke-dasharray','5 4');const title=document.createElementNS(ns,'title');title.textContent=edge.id;path.append(title);svg.append(path);
    }
    for(const node of siteFlow.nodes.values()) {
      const point=positions.get(node.id);if(!point)continue;const rect=document.createElementNS(ns,'rect');rect.setAttribute('x',String(point.x));rect.setAttribute('y',String(point.y));rect.setAttribute('width','205');rect.setAttribute('height','46');rect.setAttribute('rx','8');rect.setAttribute('fill','#102b40');rect.setAttribute('stroke','#8bcddd');const label=document.createElementNS(ns,'text');label.setAttribute('x',String(point.x+10));label.setAttribute('y',String(point.y+28));label.setAttribute('fill','#e5f5ff');label.setAttribute('font-size','14');label.textContent=node.label;svg.append(rect,label);
    }
    for(const edge of siteFlow.edges.values()) {
      const row=document.createElement('tr');row.dataset.edge=edge.id;
      const enabled=document.createElement('td'),input=document.createElement('input');input.type='checkbox';input.checked=edge.enabled;input.dataset.edge=edge.id;input.setAttribute('aria-label','Enable '+edge.id);enabled.append(input);
      const route=document.createElement('td');route.textContent=edge.from+'.'+edge.output+' → '+edge.to+'.'+edge.input;
      const schedule=document.createElement('td');schedule.textContent=edge.delayed?'Next workflow tick':'Immediate';
      const count=document.createElement('td');count.dataset.count=edge.id;
      const removeCell=document.createElement('td'),button=document.createElement('button');button.type='button';button.dataset.remove=edge.id;button.textContent='Remove';button.setAttribute('aria-label','Remove '+edge.id);removeCell.append(button);
      row.append(enabled,route,schedule,count,removeCell);get('flow-edges').append(row);
    }
    if(focused)[...get('flow-edges').querySelectorAll<HTMLInputElement>('input')].find(input=>input.dataset.edge===focused)?.focus({preventScroll:true});
  }
  for(const count of get('flow-edges').querySelectorAll<HTMLElement>('[data-count]'))count.textContent=String(siteFlow.counts.get(count.dataset.count!)||0);
  get('flow-trace').textContent=siteFlow.trace.slice(-12).reverse().map(event=>`#${event.sequence} t${event.tick} ${event.from} → ${event.to}.${event.port} · ${event.status} · ${event.summary}`).join('\n')||'No deliveries yet.';
}
function safely(action:()=>string) {try{status(action());render();}catch(error){status('Rejected: '+(error as Error).message);}}
section.addEventListener('change',event=>{const input=event.target as HTMLInputElement;if(input.dataset.edge)safely(()=>{siteFlow.enable(input.dataset.edge!,input.checked);return input.dataset.edge+(input.checked?' connected.':' disconnected.');});});
section.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-remove]');if(button)safely(()=>{siteFlow.remove(button.dataset.remove!);return 'Connection removed.';});});
get('flow-connect').addEventListener('submit',event=>{event.preventDefault();safely(()=>{const [from,output]=get<HTMLSelectElement>('flow-from').value.split('.'),[to,input]=get<HTMLSelectElement>('flow-to').value.split('.');siteFlow.connect({id:'edge-'+Date.now()+'-'+siteFlow.edges.size,from,output,to,input,enabled:true,delayed:get<HTMLInputElement>('flow-delay').checked});return 'Compatible modules connected.';});});
get('flow-tick').addEventListener('click',()=>safely(()=>{siteFlow.advance();return 'Workflow tick '+siteFlow.tick+'.';}));
get('flow-reset').addEventListener('click',()=>safely(()=>{siteFlow.restore(defaults);return 'Default connections restored.';}));
get('flow-save').addEventListener('click',()=>safely(()=>{localStorage.setItem('atunbi.workflow',JSON.stringify(siteFlow.snapshot()));return 'Wiring saved in this browser.';}));
get('flow-load').addEventListener('click',()=>safely(()=>{siteFlow.restore(JSON.parse(localStorage.getItem('atunbi.workflow')||'null'));return 'Saved wiring loaded.';}));
get('flow-export').addEventListener('click',()=>sendEvidence('workflow','atunbi-workflow.json',siteFlow.snapshot()));
get<HTMLInputElement>('flow-file').addEventListener('change',async event=>{const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>100000){status('Rejected: workflow file must be smaller than 100 KB.');return;}try{const data=JSON.parse(await file.text());safely(()=>{siteFlow.restore(data);return 'Workflow imported.';});}catch(error){status('Rejected: '+(error as Error).message);}});
render();window.setInterval(render,500);
