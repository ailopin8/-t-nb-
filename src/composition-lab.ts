import {CompositionEngine,defaultConfig,compareComposition,validateConfig} from './algorithms/composition';
import type {AlgorithmLinks} from './algorithms/composition';
import {bindInput,publishState,registerView,requestControl,sendEvidence,siteFlow} from './flow/site';
import {describe} from './discovery.js';
import './composition.css';

const section=document.createElement('section');section.id='g10-lab';section.className='panel4 g8 composition-lab';
section.innerHTML=`<div class="section-head"><div><span class="micro">12 / G10 · COMPOSABLE ALGORITHMIC SYSTEMS</span><h2>Simple equations. Connected systems.</h2></div></div>
<div class="g8-main"><p>A binary 10 × 10 × 10 matrix is the plant. A sensor counts ON bits; PID controls a bounded bit actuator. Optional oscillator, logistic-map, diffusion and XOR nodes influence the same plant through explicit links. Numeric registers belong to the controller, never to a cell.</p>
<form id="g10-form" class="g8-pane" novalidate><div class="g8-controls">
<label>Preset <select id="g10-preset"><option value="pid">PID regulation</option><option value="waves">Oscillator + PID</option><option value="coupled">Coupled patterns</option><option value="open">Open loop</option></select></label>
<label>Target ON bits <input id="g10-target" type="number" min="0" max="1000" step="1" value="500" required></label>
<label>Kp <input id="g10-kp" type="number" min="0" max="10" step=".01" value=".7" required></label>
<label>Ki <input id="g10-ki" type="number" min="0" max="2" step=".01" value=".08" required></label>
<label>Kd <input id="g10-kd" type="number" min="0" max="5" step=".01" value=".12" required></label>
<label>Seed <input id="g10-seed" type="number" min="0" max="4294967295" step="1" value="42" required></label>
<button type="submit" id="g10-apply">Apply and reset</button></div><p>One simulation tick = 1 model time unit. Output is limited to ±0.128 density per tick (at most 128 bit changes). Derivative is filtered on measurement; conditional integration prevents windup. Registers use quantized signed Q16.16 values.</p></form>
<div class="g8-pane"><h3>Algorithm nodes and edges</h3><div id="g10-links" class="algorithm-links"></div><p>Every enabled link affects the next tick. All state reads occur before the actuator commits its new 1,000-bit matrix.</p></div>
<div class="g8-controls"><button id="g10-step">Step system +1</button><button id="g10-run">Run system</button><button id="g10-reset">Reset system</button><button id="g10-compare">Compare PID / open loop</button><button id="g10-replay" disabled>Verify system replay</button><button id="g10-import">Import G8 matrix</button><button id="g10-export" disabled>Export system evidence</button><label>Depth Z <input id="g10-depth" type="range" min="0" max="9" value="4"><output id="g10-z">4</output></label></div>
<p id="g10-status" role="status" aria-live="polite">Ready. Choose a preset, then step or compare.</p>
<div class="g8-columns"><div class="g8-pane"><h3>Binary plant · 1,000 cells</h3><canvas id="g10-canvas" role="img" aria-label="G10 binary plant" aria-describedby="g10-readout"></canvas><div id="g10-slice" class="g8-slice" role="img"></div><p id="g10-readout"></p></div>
<div class="g8-pane"><h3>Controller and observed structure</h3><pre id="g10-registers"></pre><p id="g10-descriptors"></p><pre id="g10-comparison">No paired experiment yet.</pre><canvas id="g10-plot" role="img" aria-label="Controlled and open-loop population trajectories" aria-describedby="g10-comparison"></canvas></div></div>
<details><summary>Equations and implementation references</summary><p><strong>PID:</strong> u = Kp·e + Ki·I − Kd·filtered(dy/dt), e = target − measured density. <strong>Oscillator:</strong> θ(t+1) = θ(t) + 0.17; its sine modulates target by ±100 bits. <strong>Logistic:</strong> x(t+1) = r·x(t)·(1−x(t)), r = 3.7; it modulates target by ±60 bits. <strong>Diffusion:</strong> threshold 0.55·b + 0.45·mean(six face neighbors). <strong>XOR:</strong> elementary rule 90 along x. The thresholded diffusion rule is this app’s binary adaptation, not a continuous diffusion solver.</p><p><a href="https://www.cds.caltech.edu/~murray/books/AM05/pdf/am08-pid_19Jul11.pdf">Åström and Murray: PID implementation</a> · <a href="https://www.scholarpedia.org/article/Coupled_maps">Kaneko and Yanagita: coupled maps</a></p></details></div>`;
document.querySelector('.g9')!.insertAdjacentElement('afterend',section);
const get=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const links:{key:keyof AlgorithmLinks;label:string}[]=[
  {key:'feedback',label:'Matrix → sensor → PID measurement'}, {key:'pid',label:'PID output → bit actuator → matrix'},
  {key:'oscillator',label:'Oscillator → target modulation'}, {key:'logistic',label:'Logistic map → target modulation'},
  {key:'diffusion',label:'Neighbor diffusion → matrix'}, {key:'xor',label:'XOR rule 90 → matrix'}
];
let config=structuredClone(defaultConfig),engine=new CompositionEngine(config),timer:number|null=null;
let comparison:ReturnType<typeof compareComposition>|null=null;
for(const link of links) {
  const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id='g10-link-'+link.key;input.checked=config.links[link.key];
  label.append(input,document.createTextNode(link.label));get('g10-links').append(label);
  input.addEventListener('change',()=>{engine.config.links[link.key]=input.checked;config=structuredClone(engine.config);invalidate();get('g10-status').textContent=link.label+(input.checked?' connected.':' disconnected.');});
}
function stop(){if(timer!==null)clearInterval(timer);timer=null;get('g10-run').textContent='Run system';}
function syncLinks(){for(const link of links)get<HTMLInputElement>('g10-link-'+link.key).checked=config.links[link.key];}
function invalidate(){const plot=get<HTMLCanvasElement>('g10-plot');plot.getContext('2d')?.clearRect(0,0,plot.width,plot.height);comparison=null;get<HTMLButtonElement>('g10-replay').disabled=true;get<HTMLButtonElement>('g10-export').disabled=true;get('g10-comparison').textContent='No paired experiment for these settings yet.';}
function refresh(){publishState('composition',engine.snapshot());siteFlow.emit('composition','binary',{bits:engine.snapshot().bits,tick:engine.tick});}
function render() {
  const state=engine.snapshot(),descriptor=describe(engine.bits),z=Number(get<HTMLInputElement>('g10-depth').value);get('g10-z').textContent=String(z);
  get('g10-readout').textContent=`Tick ${state.tick} · ${state.population}/1000 ON · target ${state.target} · output ${state.control.toFixed(5)}${state.saturated?' · SATURATED':''}`;
  get('g10-registers').textContent='Signed Q16.16 · 32 bits per register\n'+Object.entries(state.registers).map(([key,value])=>key.padEnd(12)+value).join('\n');
  get('g10-descriptors').textContent=`Components ${descriptor.components} · largest ${descriptor.largest} · unlike neighbor edges ${descriptor.transitions}.`;
  const slice=get('g10-slice');slice.replaceChildren();slice.setAttribute('aria-label',`Depth ${z}: ${state.bits.slice(z*100,z*100+100).split('1').length-1} of 100 cells ON.`);
  for(let i=z*100;i<(z+1)*100;i++){const cell=document.createElement('span');cell.className=engine.bits[i]?'g8-bit on':'g8-bit';cell.textContent=String(engine.bits[i]);cell.setAttribute('aria-hidden','true');slice.append(cell);}
  const canvas=get<HTMLCanvasElement>('g10-canvas'),ctx=canvas.getContext('2d')!;canvas.width=600;canvas.height=300;ctx.fillStyle='#081321';ctx.fillRect(0,0,600,300);
  for(let i=0;i<1000;i++)if(engine.bits[i]){const x=i%10,y=Math.floor(i/10)%10,depth=Math.floor(i/100);ctx.fillStyle=depth%2?'#b9a8ff':'#72e5ed';ctx.fillRect(300+(x-depth)*18,150+(x+depth-9)*5+(4.5-y)*16,5,5);}
}
registerView('composition',render);
bindInput('composition','binary',payload=>{stop();engine=new CompositionEngine(config,Uint8Array.from(String(payload.bits),Number));invalidate();refresh();get('g10-status').textContent='Imported 1000 bits from G8 through the workflow edge.';});
function step(){engine.step();refresh();}
get('g10-step').addEventListener('click',()=>{stop();step();});
get('g10-run').addEventListener('click',()=>{if(timer!==null){stop();return;}get('g10-run').textContent='Pause system';timer=window.setInterval(step,180);});
get('g10-reset').addEventListener('click',()=>{stop();engine=new CompositionEngine(config,engine.initial);invalidate();refresh();get('g10-status').textContent='System reset to the same seed bits.';});
get('g10-form').addEventListener('submit',event=>{
  event.preventDefault();stop();
  try {
    for(const id of ['target','kp','ki','kd','seed']){const input=get<HTMLInputElement>('g10-'+id);input.removeAttribute('aria-invalid');if(!input.value.trim()||!input.checkValidity()){input.setAttribute('aria-invalid','true');input.focus();throw Error('Enter a valid '+id+' within the displayed bounds.');}}
    const next={...config,target:Number(get<HTMLInputElement>('g10-target').value),kp:Number(get<HTMLInputElement>('g10-kp').value),ki:Number(get<HTMLInputElement>('g10-ki').value),kd:Number(get<HTMLInputElement>('g10-kd').value),seed:Number(get<HTMLInputElement>('g10-seed').value)};
    validateConfig(next);config=next;engine=new CompositionEngine(config);invalidate();refresh();get('g10-status').textContent='Applied parameters. Binary plant reset reproducibly.';
  }catch(error){get('g10-status').textContent='Rejected: '+(error as Error).message;}
});
get('g10-preset').addEventListener('change',()=>{
  stop();const preset=get<HTMLSelectElement>('g10-preset').value;config=structuredClone(defaultConfig);
  if(preset==='waves')config.links.oscillator=true;
  if(preset==='coupled')Object.assign(config.links,{oscillator:true,logistic:true,diffusion:true,xor:true});
  if(preset==='open')config.links.pid=false;
  for(const id of ['target','kp','ki','kd','seed'] as const)get<HTMLInputElement>('g10-'+id).value=String(config[id]);
  engine=new CompositionEngine(config);syncLinks();invalidate();refresh();get('g10-status').textContent='Preset loaded. Links describe the executable composition.';
});
get('g10-compare').addEventListener('click',()=>{
  stop();comparison=compareComposition(engine.config,engine.initial,64);siteFlow.emit('composition','evidence',{data:comparison,download:false});
  get('g10-comparison').textContent=`64 matched ticks from identical bits and drivers.\nMean absolute population error: PID ${comparison.meanAbsoluteError.controlled.toFixed(2)} bits; open loop ${comparison.meanAbsoluteError.baseline.toFixed(2)} bits.\nFinal Hamming distance ${comparison.finalHamming}/1000. Improvement is measured for these settings, not guaranteed for every composition.`;
  const canvas=get<HTMLCanvasElement>('g10-plot'),ctx=canvas.getContext('2d')!;canvas.width=600;canvas.height=240;ctx.fillStyle='#081321';ctx.fillRect(0,0,600,240);
  for(const [arm,color] of [['controlled','#80e9e9'],['baseline','#f2c278']] as const){ctx.strokeStyle=color;ctx.beginPath();comparison.trajectory.forEach((row,i)=>{const x=10+i*580/63,y=230-row[arm].population*.22;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();}
  get<HTMLButtonElement>('g10-replay').disabled=false;get<HTMLButtonElement>('g10-export').disabled=false;get('g10-status').textContent='Paired experiment complete. Cyan = PID, gold = open loop.';
});
get('g10-replay').addEventListener('click',()=>{if(!comparison)return;const replay=compareComposition(comparison.config,Uint8Array.from(comparison.initial,Number),comparison.ticks);get('g10-status').textContent=JSON.stringify(replay)===JSON.stringify(comparison)?'System replay PASS · all binary states and numeric registers match.':'System replay FAILED';});
get('g10-import').addEventListener('click',()=>{try{requestControl('g8-publish');}catch(error){get('g10-status').textContent=String((error as Error).message);}});
get('g10-export').addEventListener('click',()=>{if(comparison)sendEvidence('composition','atunbi-composition-evidence.json',comparison);});
get('g10-depth').addEventListener('input',render);
document.addEventListener('atunbi:pause-all',stop);
refresh();
