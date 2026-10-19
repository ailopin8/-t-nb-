import {siteFlow,latestSignals,sourceForDiscovery,registerView,publishState,sendEvidence} from './flow/site';
import {compile, VM} from './g8';
import {analyze} from './discovery.js';
import type {ExperimentConfig} from './discovery.js';
import './g9.css';

const section=document.createElement('section');
section.className='panel4 g8 g9';
section.id='g9';
section.innerHTML=`
<div class="section-head"><div><span class="micro">10 / G9 · SEMANTIC DISCOVERY LAB</span><h3>Observe. Intervene. Form a hypothesis.</h3></div></div>
<div class="g8-main">
<p>Measurements describe binary behavior. Observer language never enters the kernel. Each experiment starts from the G8 source, not its running state.</p>
<div class="g8-pane">
<form id="g9-experiment-form" class="g8-controls" novalidate aria-describedby="g9-setup-help">
<label>Ticks <input id="g9-ticks" name="ticks" required type="number" step="1" min="1" max="128" value="24" aria-describedby="g9-ticks-error"></label><span id="g9-ticks-error" class="field-error"></span>
<label>Intervention <select id="g9-mode"><option value="flip">Flip one bit in first matrix</option><option value="uncouple">Disable all receiving from tick 0</option><option value="none">No intervention / reproducibility control</option></select></label>
<label>Address <input id="g9-address" name="address" required step="1" aria-describedby="g9-address-error" type="number" min="0" max="999" value="444"></label><span id="g9-address-error" class="field-error"></span>
<label>At tick <input id="g9-at" name="intervention-tick" required step="1" aria-describedby="g9-at-error" type="number" min="0" value="0"></label><span id="g9-at-error" class="field-error"></span>
<label><input id="g9-workflow-seed" type="checkbox"> Use matrix from workflow</label><button id="g9-run" type="submit">Run discovery experiment</button><button id="g9-replay" type="button" disabled>Verify replay</button><button id="g9-export" type="button" disabled>Export G9 evidence</button>
</form>
<p id="g9-setup-help">Matched initial bits, rules, scheduling and duration. Flip changes one bit before the selected tick is observed; uncoupling removes receiving from the start (tick field ignored). Address = x + 10y + 100z.</p>
<p id="g9-status" role="status">Ready to analyze the G8 compiler source.</p></div>
<div id="g9-results" hidden aria-label="Completed experiment evidence"><p id="g9-result-summary" class="g9-results-summary"></p>
<div class="g8-columns"><div class="g8-pane"><h4>Measured descriptors</h4><div class="g9-scroll" tabindex="0" role="region" aria-label="Binary descriptors, scroll horizontally if needed"><table><caption>Final-step binary descriptors by experimental arm</caption><thead><tr><th scope="col">Run / matrix</th><th scope="col">On</th><th scope="col">Edges</th><th scope="col">Components</th><th scope="col">Largest</th><th scope="col">Δ bits</th><th scope="col">Stability</th></tr></thead><tbody id="g9-metrics"></tbody></table></div><p>Edges: unlike face-neighbor pairs; components: connected ON cells. Six-neighbor periodic 3D topology. Stability = 1 − changed bits / 1000 over the final step.</p></div>
<div class="g8-pane"><h4>Experimental evidence</h4><pre id="g9-effect"></pre><p id="g9-period"></p><p>A full-VM repeat includes all matrices and pending messages. Period is an exact final-state cycle length within this observation window; no repeat does not prove aperiodicity.</p></div></div>
<div class="g8-pane"><h4>Exact-state pattern registry</h4><p>Identity uses all 1,000 bits, without hash collisions. Recurrence is exact position-specific equality, not similarity or inferred meaning. Cross-run counts refer to the two paired arms, not independent replications.</p><label>Pattern <select id="g9-pattern"></select></label><pre id="g9-pattern-info" aria-live="polite" aria-atomic="true"></pre></div>
<div class="g8-pane"><h4>Observer notebook · hypotheses only</h4><label>Hypothesis <input id="g9-note" maxlength="240" aria-describedby="g9-note-error" placeholder="A falsifiable interpretation…"></label><label>Status <select id="g9-hypothesis"><option>Untested</option><option>Consistent with this experiment</option><option>Contradicted by this experiment</option><option>Inconclusive</option></select></label><button id="g9-save">Save hypothesis</button><span id="g9-note-error" class="field-error"></span><p>Bound to selected pattern and experiment. Status is observer-assigned, never automatically proven. Notebook persists in this browser; export preserves full evidence.</p><pre id="g9-notes"></pre></div>
</div></div>`;
document.querySelector('.g8')?.insertAdjacentElement('afterend',section);
const el=(id:string)=>document.getElementById(id)!;
const input=(id:string)=>(el(id) as HTMLInputElement).value;
let result:any=null;
let notes:any[]=[];
try {const stored=JSON.parse(localStorage.getItem('atunbi.g9.notes')||'[]');if(Array.isArray(stored))notes=stored.filter(n=>typeof n.text==='string'&&typeof n.status==='string').slice(-100);}catch { /* corrupt storage remains isolated from execution */ }
function renderNotes(){el('g9-notes').textContent=notes.map(n=>`${n.pattern} · ${n.status}: ${n.text}`).join('\n')||'No hypotheses saved.';}
function pattern(){if(!result)return;const p=result.patterns[Number(input('g9-pattern'))];el('g9-pattern-info').textContent=`${p.id} · ${p.classification}\n${p.occurrences.length} observations · ${p.crossRunCount}/2 arms · ON ${p.population} · components ${p.components}\n`+p.occurrences.slice(0,30).map((o:any)=>`${o.run}/${o.matrix}@${o.tick}`).join(', ');}
function render(){
  el('g9-results').hidden=false;
  el('g9-result-summary').textContent=`Completed experiment: ${result.config.ticks} ticks; intervention ${result.config.mode}; ${result.patterns.length} exact patterns. Results below belong to these settings and the source captured when Run was selected.`;
  el('g9-metrics').replaceChildren();
  for(const r of result.rows){const tr=document.createElement('tr');for(const value of [r.run+'/'+r.matrix,r.population,r.transitions,r.components,r.largest,r.changedBits,r.stability.toFixed(3)]){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}el('g9-metrics').append(tr);}
  el('g9-effect').textContent='Final Hamming distance\n'+result.differences.at(-1).matrices.map((m:any)=>`${m.matrix}: ${m.differentBits}/1000 bits`).join('\n')+'\nMaximum over window: '+Math.max(...result.differences.flatMap((d:any)=>d.matrices.map((m:any)=>m.differentBits)))+'/1000';
  el('g9-period').textContent=Object.entries(result.periodicity).map(([run,p])=>`${run}: ${p===null?'no full-VM cycle detected':'period '+p}`).join(' · ');
  const select=el('g9-pattern') as HTMLSelectElement;select.replaceChildren();result.patterns.forEach((p:any,i:number)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`${p.id} · ${p.classification} · ${p.occurrences.length} observations`;select.append(o);});pattern();renderNotes();
}
function clearErrors() {
  for (const id of ['g9-ticks', 'g9-address', 'g9-at', 'g9-note']) {
    el(id).removeAttribute('aria-invalid');
    el(id + '-error').textContent = '';
  }
}
function validateField(id: string, min: number, max: number, message: string) {
  const raw = input(id).trim();
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < min || value > max) {
    el(id).setAttribute('aria-invalid', 'true');
    el(id + '-error').textContent = message;
    return false;
  }
  return true;
}
function updateInterventionFields() {
  const flip = input('g9-mode') === 'flip';
  for (const id of ['g9-address', 'g9-at']) (el(id) as HTMLInputElement).disabled = !flip;
  clearErrors();
}
el('g9-mode').addEventListener('change', updateInterventionFields);
updateInterventionFields();
el('g9-experiment-form').addEventListener('submit', event => {
  event.preventDefault();
  clearErrors();
  const mode = input('g9-mode');
  const validTicks = validateField('g9-ticks', 1, 128, 'Enter a whole number of ticks from 1 to 128.');
  const validAddress = mode !== 'flip' || validateField('g9-address', 0, 999, 'Enter a whole-number address from 0 to 999.');
  const validAt = mode !== 'flip' || validateField('g9-at', 0, Math.max(0, Number(input('g9-ticks')) - 1), 'Enter a whole-number intervention tick from 0 to one less than the experiment ticks.');
  if (!validTicks || !validAddress || !validAt) {
    el('g9-status').textContent = 'Experiment rejected. Correct the highlighted field to run again. Previous completed evidence, if any, is unchanged.';
    section.querySelector<HTMLElement>('[aria-invalid=true]')?.focus();
    return;
  }
  try {
  if (mode !== 'none' && mode !== 'flip' && mode !== 'uncouple') throw Error('Choose a supported intervention.');
  const config:ExperimentConfig={ticks:Number(input('g9-ticks')),address:mode==='flip'?Number(input('g9-address')):0,tick:mode==='flip'?Number(input('g9-at')):0,mode};
  const source=sourceForDiscovery();
  const initialBits=(el('g9-workflow-seed') as HTMLInputElement).checked?String(latestSignals.get('g9:binary')?.bits||''):undefined;
  if(initialBits!==undefined&&!/^[01]{1000}$/.test(initialBits))throw Error('Step G10 or import a matrix through composition-g9 first.');
  const next=analyze(VM,compile(source),config,initialBits);el('g8-source').removeAttribute('aria-invalid');result=next;publishState('g9',{ticks:result.config.ticks,patterns:result.patterns.length});
  for(const id of ['g9-replay','g9-export'])(el(id) as HTMLButtonElement).disabled=false;
  el('g9-status').textContent=`Experiment complete · ${result.patterns.length} exact patterns · ${config.ticks} matched ticks. Evidence is descriptive, not proof of meaning.`;
}catch(e){el('g9-status').textContent='Source rejected: '+(e as Error).message+' Correct the G8 source and run again.'; el('g8-source').setAttribute('aria-invalid','true'); el('g8-source').focus();}});
el('g9-replay').addEventListener('click',()=>{if(!result)return;const again=analyze(VM,compile(result.source),result.config,result.initialBits||undefined);el('g9-status').textContent=JSON.stringify(again)===JSON.stringify(result)?'Replay PASS · all states, descriptors and pattern occurrences match exactly.':'Replay FAILED';});
el('g9-pattern').addEventListener('change',pattern);
el('g9-note').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); el('g9-save').click(); } });
el('g9-save').addEventListener('click',()=>{if(!result)return;const text=input('g9-note').trim();if(!text){el('g9-note-error').textContent='Enter a hypothesis before saving.';el('g9-note').setAttribute('aria-invalid','true');el('g9-note').focus();el('g9-status').textContent='Hypothesis not saved. Enter a hypothesis first.';return;}el('g9-note-error').textContent='';el('g9-note').removeAttribute('aria-invalid');
  const p=result.patterns[Number(input('g9-pattern'))];siteFlow.emit('g9','annotation',{text,status:input('g9-hypothesis')});notes.push({text:text.slice(0,240),status:input('g9-hypothesis'),pattern:p.id,bits:p.bits,source:result.source,config:result.config});notes=notes.slice(-100);
  try{localStorage.setItem('atunbi.g9.notes',JSON.stringify(notes));el('g9-status').textContent='Hypothesis saved as observer metadata.';}catch{el('g9-status').textContent='Browser storage unavailable; export to preserve this hypothesis.';}renderNotes();});
el('g9-export').addEventListener('click',()=>{if(result)sendEvidence('g9','atunbi-g9-evidence.json',{...result,observerHypotheses:notes});});
registerView('g9',render);
renderNotes();
