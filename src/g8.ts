import {siteFlow, registerView, publishState, sendEvidence, bindControl} from './flow/site';
import './g8.css';

export { compile, VM }; type MatrixID = 'A' | 'B';
type Instruction = { word: number; line: number };
type SourceUnit = { id: number; name: MatrixID; code: Instruction[] };
type Program = { source: string; units: SourceUnit[] };
type State = { id: number; name: MatrixID; bits: Uint8Array; rule: number; destination: number; limit: number; receive: { from: number; gate: number }[]; flips: number; packets: number };
type Packet = { tick: number; word: number };
const addr = (x:number,y:number,z:number) => x + 10*y + 100*z;
const binary = (n:number,len:number) => (n>>>0).toString(2).padStart(len,'0');
const examples:Record<string,string> = {
  feedback: ['MATRIX A RULE 01011010','MATRIX B RULE 00011110','A BIT (4,4,4) = 1','B BIT (5,5,5) = 1','A RECEIVE FROM B USING XOR','B RECEIVE FROM A USING XOR','A SEND TO B LIMIT 32','B SEND TO A LIMIT 32'].join('\n'),
  oneway: ['MATRIX A RULE 01011010','MATRIX B RULE 00000000','A BIT (4,4,4) = 1','A BIT (5,4,4) = 1','B RECEIVE FROM A USING OR','A SEND TO B LIMIT 48'].join('\n'),
  isolated: ['MATRIX A RULE 00011110','MATRIX B RULE 01101110','A BIT (4,4,4) = 1','B BIT (4,4,4) = 1'].join('\n')
};
function enc(op:number,address=0,arg=0,flags=0):number {
  if (![op,address,arg,flags].every(Number.isInteger) || op<0||op>15||address<0||address>=1000||arg<0||arg>255||flags<0||flags>3) throw Error('Invalid 24-bit instruction');
  return ((op<<20)|(address<<10)|(arg<<2)|flags)>>>0;
}
function dec(w:number){return {op:(w>>>20)&15,address:(w>>>10)&1023,arg:(w>>>2)&255,flags:w&3};}
function pack(src:number,dst:number,address:number,kind:number,data:number):number {
  if(![src,dst,address,kind,data].every(Number.isInteger)||src<0||src>15||dst<0||dst>15||kind<0||kind>15||address<0||address>=1000||data<0||data>1)throw Error('Packet bounds');
  return ((src<<28)|(dst<<24)|(address<<14)|(kind<<10)|(data<<2))>>>0;
}
function unpack(w:number){return {src:(w>>>28)&15,dst:(w>>>24)&15,address:(w>>>14)&1023,kind:(w>>>10)&15,data:(w>>>2)&255,flags:w&3};}
function compile(text:string):Program {
  const lines=text.split(/\r?\n/).map((text,i)=>({line:i+1,text:text.trim().toUpperCase()})).filter(r=>r.text&&!r.text.startsWith('#'));
  const units:SourceUnit[]=[];const errors:string[]=[];
  for(const row of lines){
    if(!row.text.startsWith('MATRIX '))continue;
    const match=row.text.match(/^MATRIX ([AB]) RULE ([01]{8})$/);
    if(!match){errors.push('Line '+row.line+': expected MATRIX A RULE 01011010');continue;}
    if(units.some(u=>u.name===match[1])){errors.push('Line '+row.line+': duplicate definition');continue;}
    units.push({id:match[1]==='A'?1:2,name:match[1] as MatrixID,code:[{word:enc(2,0,parseInt(match[2],2)),line:row.line}]});
  }
  if(!units.length)errors.push('Declare a matrix and its 8-bit rule.');
  for(const row of lines){
    if(row.text.startsWith('MATRIX '))continue;
    const m=row.text.match(/^([AB]) (.*)$/);
    if(!m){errors.push('Line '+row.line+': expected A or B');continue;}
    const unit=units.find(u=>u.name===m[1]);
    if(!unit){errors.push('Line '+row.line+': undeclared matrix');continue;}
    let g:RegExpMatchArray|null;const stmt=m[2];
    const add=(op:number,a=0,arg=0,flag=0)=>unit.code.push({word:enc(op,a,arg,flag),line:row.line});
    if((g=stmt.match(/^BIT \((\d+),(\d+),(\d+)\) = ([01])$/))){
      const [x,y,z]=[Number(g[1]),Number(g[2]),Number(g[3])];
      if(x>9||y>9||z>9)errors.push('Line '+row.line+': coordinate must be 0..9');
      else add(1,addr(x,y,z),Number(g[4]));
    }else if((g=stmt.match(/^SEND TO ([AB]) LIMIT (\d+)$/))){
      const other=units.find(u=>u.name===g![1]),limit=Number(g[2]);
      if(!other||other.id===unit.id)errors.push('Line '+row.line+': invalid destination');
      else if(limit<1||limit>255)errors.push('Line '+row.line+': limit must be 1..255');
      else{add(3,0,other.id);add(4,0,limit);}
    }else if((g=stmt.match(/^RECEIVE FROM ([AB]) USING (XOR|OR|AND)$/))){
      const other=units.find(u=>u.name===g![1]);
      if(!other||other.id===unit.id)errors.push('Line '+row.line+': invalid source');
      else add(5,0,other.id,['XOR','OR','AND'].indexOf(g[2]));
    }else if((g=stmt.match(/^NOT AT \((\d+),(\d+),(\d+)\)$/))){
      const [x,y,z]=[Number(g[1]),Number(g[2]),Number(g[3])];
      if(x>9||y>9||z>9)errors.push('Line '+row.line+': coordinate must be 0..9');
      else add(6,addr(x,y,z));
    }else errors.push('Line '+row.line+': unsupported statement');
    if(unit.code.length>64)errors.push('Line '+row.line+': 64-instruction limit');
  }
  if(errors.length)throw Error(errors.join('\n'));
  return {source:text,units};
}
class VM{
  states:State[];tick=0;queue:number[]=[];trace:Packet[]=[];sent=0;
  constructor(public program:Program,receiveEnabled=true){
    this.states=program.units.map(u=>{
      const s:State={id:u.id,name:u.name,bits:new Uint8Array(1000),rule:0,destination:0,limit:16,receive:[],flips:0,packets:0};
      for(const w of u.code){const d=dec(w.word);
        if(d.op===1)s.bits[d.address]=d.arg&1;
        if(d.op===2)s.rule=d.arg;
        if(d.op===3)s.destination=d.arg;
        if(d.op===4)s.limit=d.arg;
        if(d.op===5&&receiveEnabled)s.receive.push({from:d.arg,gate:d.flags});
      }
      return s;
    });
  }
  step(){
    this.tick++;const delivered=this.queue;this.queue=[];
    const outputs=this.states.map(s=>{
      const next=new Uint8Array(1000);
      for(let z=0;z<10;z++)for(let y=0;y<10;y++)for(let x=0;x<10;x++){
        const old=s.bits;
        const triple=(old[addr((x+9)%10,y,z)]<<2)|(old[addr(x,y,z)]<<1)|old[addr((x+1)%10,y,z)];
        next[addr(x,y,z)]=(s.rule>>>triple)&1;
      }
      for(const word of delivered){const p=unpack(word);
        if(p.dst!==s.id||p.kind!==1||p.data>1||p.address>=1000)continue;
        const rx=s.receive.find(r=>r.from===p.src);
        if(!rx)continue;
        const bit=next[p.address];
        next[p.address]=rx.gate===0 ? bit^p.data : rx.gate===1 ? bit|p.data : bit&p.data;
        s.packets++;
      }
      const program=this.program.units.find(u=>u.id===s.id)!;
      for(const w of program.code){const d=dec(w.word);if(d.op===6)next[d.address]^=1;}
      return {state:s,next};
    });
    for(const {state,next} of outputs){
      let emitted=0;state.flips=0;
      for(let i=0;i<1000;i++){
        if(next[i]===state.bits[i])continue;
        state.flips++;
        if(state.destination&&emitted<state.limit){
          const word=pack(state.id,state.destination,i,1,next[i]);
          this.queue.push(word);this.trace.push({tick:this.tick,word});this.sent++;emitted++;
        }
      }
    }
    for(const {state,next} of outputs)state.bits=next;
    if(this.trace.length>500)this.trace.splice(0,this.trace.length-500);
  }
  run(count:number){for(let i=0;i<count;i++)this.step();}
}
function experiment(program:Program){
  const a=new VM(program,true),b=new VM(program,false);a.run(24);b.run(24);
  return a.states.map(s=>{const t=b.states.find(v=>v.id===s.id)!;let delta=0;
    for(let i=0;i<1000;i++)delta+=s.bits[i]^t.bits[i];
    return {matrix:s.name,differentBits:delta,hamming:delta/1000};
  });
}
function check(){
  for(const n of [0,1,421,999])if(dec(enc(1,n,1)).address!==n||unpack(pack(1,2,n,1,1)).address!==n)throw Error('Binary roundtrip');
  const p=compile(examples.feedback),v=new VM(p);v.run(5);
  if(!v.sent||v.states.some(s=>s.bits.some(bit=>bit!==0&&bit!==1)))throw Error('State bit invariant');
  try{compile('MATRIX A RULE 01011010\nA BIT (10,0,0) = 1');}
  catch{return 'PASS · binary encoding, bounds, packet exchange, 0/1-only state';}
  throw Error('Invalid address accepted');
}
const section=document.createElement('section');
section.className='panel4 g8';
section.innerHTML=[
  '<div class="section-head"><div><span class="micro">09 / G8 · BINARY-ONLY KERNEL</span><h3>Bits first. Meaning later.</h3></div><span class="hint">1,000 ONE-BIT POSITIONS PER MATRIX</span></div>',
  '<div class="g8-main"><p>Each cell stores one bit. Only defined instruction words can modify those bits. A human interpretation is metadata outside the execution engine.</p>',
  '<div class="g8-columns"><div class="g8-pane"><div class="g8-head"><strong>01 / COMPILER INPUT</strong><select id="g8-preset"><option value="feedback">Reciprocal XOR</option><option value="oneway">One-way propagation</option><option value="isolated">Isolated patterns</option></select></div><textarea id="g8-source" aria-label="Binary compiler source" spellcheck="false"></textarea>',
  '<div class="g8-controls"><button id="g8-compile">Compile into bits</button><button id="g8-grammar">Grammar</button></div><pre id="g8-help" hidden>MATRIX A RULE 01011010\nA BIT (4,4,4) = 1\nA SEND TO B LIMIT 32\nB RECEIVE FROM A USING XOR\nA NOT AT (0,0,0)</pre><p id="g8-diagnostic" role="status"></p></div>',
  '<div class="g8-pane"><div class="g8-head"><strong>02 / MACHINE CODE · 24 BITS PER WORD</strong><span id="g8-words">EMPTY</span></div><div id="g8-assembly" class="g8-assembly">Compile to see binary instructions.</div></div></div>',
  '<div class="g8-controls"><button id="g8-step" disabled>Step +1</button><button id="g8-run" disabled>▶ Run</button><button id="g8-reset" disabled>↻ Reset</button><button id="g8-compare" disabled>Test causality</button><button id="g8-export" disabled>↓ Export binary JSON</button><span id="g8-tick">TICK 0000</span><label>Depth Z <input type="range" id="g8-depth" min="0" max="9" value="4"><output id="g8-z">4</output></label></div>',
  '<div class="g8-columns"><div class="g8-pane"><div class="g8-head"><strong>MATRIX A</strong><span id="g8-count-a">EMPTY</span></div><canvas id="g8-canvas-a" aria-label="Matrix A spatial binary visualization"></canvas><div class="g8-slice" id="g8-slice-a"></div><p id="g8-rule-a">No program</p></div>',
  '<div class="g8-pane"><div class="g8-head"><strong>MATRIX B</strong><span id="g8-count-b">EMPTY</span></div><canvas id="g8-canvas-b" aria-label="Matrix B spatial binary visualization"></canvas><div class="g8-slice" id="g8-slice-b"></div><p id="g8-rule-b">No program</p></div></div>',
  '<div class="g8-columns"><div class="g8-pane"><div class="g8-head"><strong>03 / INTER-MATRIX MESSAGE BUS</strong><span id="g8-packets">0 PACKETS</span></div><div id="g8-packet">0000 0000 0000000000 0000 00000000 00</div><p>SOURCE [4] · DEST [4] · ADDRESS [10] · TYPE [4] · BIT DATA [8] · FLAGS [2]</p><pre id="g8-log">No messages yet.</pre></div>',
  '<div class="g8-pane"><div class="g8-head"><strong>04 / OBSERVER-ASSIGNED MEANING</strong></div><p>Label a pattern you observe. The label never enters the VM.</p><input id="g8-name" aria-label="Pattern interpretation" placeholder="e.g. propagating bit wave"><button id="g8-save" disabled>Assign meaning</button><pre id="g8-labels">No interpretations assigned.</pre><p id="g8-causality">Compare 24 matched ticks with and without coupling.</p></div></div>',
  '<p class="g8-boundary">The matrix does not know what a 1 represents. Its Boolean operations have defined executable semantics; domain meaning is externally inferred from patterns and tests.</p><small id="g8-tests"></small></div>'
].join('\n');
const anchor=document.querySelector('.g7');
if(anchor)anchor.insertAdjacentElement('afterend',section);
else document.querySelector('#app')?.appendChild(section);
const dom=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
dom<HTMLTextAreaElement>('g8-source').value=examples.feedback;
let program:Program|null=null,vm:VM|null=null;
let timer:number|null=null,observation:ReturnType<typeof experiment>|null=null;
const labels:{tick:number;fingerprint:string;meaning:string}[]=[];
function stop(){if(timer!==null)window.clearInterval(timer);timer=null;dom('g8-run').textContent='▶ Run';}
function draw(canvas:HTMLCanvasElement,state:State|undefined,color:string){
  const w=Math.max(canvas.clientWidth,220),h=Math.max(canvas.clientHeight,200),r=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(w*r);canvas.height=Math.round(h*r);const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.scale(r,r);ctx.clearRect(0,0,w,h);
  const proj=(x:number,y:number,z:number):[number,number]=>[w*.5+(x-z)*w*.033,h*.52+(x+z-9)*h*.019+(4.5-y)*h*.042];
  const points=[[0,0,0],[9,0,0],[9,9,0],[0,9,0],[0,0,9],[9,0,9],[9,9,9],[0,9,9]];
  const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  ctx.strokeStyle='#2b4662';
  for(const [a,c] of edges){const p=proj(...points[a] as [number,number,number]),q=proj(...points[c] as [number,number,number]);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();}
  if(!state)return;
  for(let i=0;i<1000;i++)if(state.bits[i]){const x=i%10,y=Math.floor(i/10)%10,z=Math.floor(i/100),p=proj(x,y,z);ctx.fillStyle=color;ctx.globalAlpha=.45+z/18;ctx.fillRect(p[0]-2,p[1]-2,4,4);}
  ctx.globalAlpha=1;
}
function render_g8(){
  dom('g8-tick').textContent='TICK '+String(vm?.tick||0).padStart(4,'0');
  dom('g8-packets').textContent=(vm?.sent||0)+' PACKETS';
  const z=Number(dom<HTMLInputElement>('g8-depth').value);dom('g8-z').textContent=String(z);
  for(const name of ['a','b']){
    const state=vm?.states.find(s=>s.name.toLowerCase()===name);
    const active=state?.bits.reduce((sum,v)=>sum+v,0)||0;
    dom('g8-count-'+name).textContent=state?active+' / 1000 bits ON · Δ'+state.flips:'EMPTY';
    dom('g8-rule-'+name).textContent=state?'Rule '+binary(state.rule,8)+' · packets received '+state.packets:'No program';
    draw(dom<HTMLCanvasElement>('g8-canvas-'+name),state,name==='a'?'#e6bd79':'#72d9ee');
    const target=dom('g8-slice-'+name);target.replaceChildren();
    target.setAttribute('role','img');
    let slicePopulation=0; for(let i=z*100;i<(z+1)*100;i++)slicePopulation+=state?.bits[i]||0;
    target.setAttribute('aria-label','Matrix '+name.toUpperCase()+' depth '+z+': '+slicePopulation+' of 100 bits ON. Full matrix: '+active+' of 1000 bits ON.');
    dom('g8-canvas-'+name).setAttribute('role','img');
    dom('g8-canvas-'+name).setAttribute('aria-describedby','g8-count-'+name+' g8-rule-'+name);
    for(let y=9;y>=0;y--)for(let x=0;x<10;x++){const digit=state?.bits[addr(x,y,z)]||0;
      const cell=document.createElement('span');cell.className=digit?'g8-bit on':'g8-bit';cell.textContent=String(digit);cell.setAttribute('aria-hidden','true');cell.title='('+x+','+y+','+z+')';target.appendChild(cell);}
  }
  const recent=vm?.trace||[],last=recent[recent.length-1];
  if(last){const p=unpack(last.word);
    dom('g8-packet').textContent=[binary(p.src,4),binary(p.dst,4),binary(p.address,10),binary(p.kind,4),binary(p.data,8),binary(p.flags,2)].join(' ');
    dom('g8-log').textContent=recent.slice(-4).reverse().map(v=>{const d=unpack(v.word);return 't'+v.tick+' '+d.src+' → '+d.dst+' @'+binary(d.address,10)+' = '+d.data;}).join('\n');
  }else{dom('g8-packet').textContent='0000 0000 0000000000 0000 00000000 00';dom('g8-log').textContent='No messages yet.';}
}
function load(){
  stop();
  try{
    const next=compile(dom<HTMLTextAreaElement>('g8-source').value);
    program=next;vm=new VM(next);observation=null;labels.length=0;
    dom('g8-diagnostic').textContent='✓ Compiled. Runtime cells hold only 0 or 1.';dom('g8-diagnostic').className='good';
    const assembly=dom('g8-assembly');assembly.replaceChildren();let count=0;
    for(const unit of next.units){
      const h=document.createElement('h4');h.textContent='MATRIX '+unit.name;assembly.appendChild(h);
      for(const ins of unit.code){const row=document.createElement('div'),text=document.createElement('code'),label=document.createElement('small');
        row.className='g8-instruction';text.textContent=binary(ins.word,24);label.textContent='OP '+dec(ins.word).op+' · line '+ins.line;
        row.append(text,label);assembly.appendChild(row);count++;}
    }
    dom('g8-words').textContent=count+' WORDS';
    dom('g8-labels').textContent='No interpretations assigned.';
    dom('g8-causality').textContent='Compare 24 matched ticks with and without coupling.';
    for(const id of ['g8-step','g8-run','g8-reset','g8-compare','g8-export','g8-save'])dom<HTMLButtonElement>(id).disabled=false;
  }catch(error){
    program=null;vm=null;
    dom('g8-diagnostic').textContent=String(error instanceof Error?error.message:error);dom('g8-diagnostic').className='error';
    dom('g8-assembly').textContent='No valid machine code loaded.';dom('g8-words').textContent='REJECTED';
    for(const id of ['g8-step','g8-run','g8-reset','g8-compare','g8-export','g8-save'])dom<HTMLButtonElement>(id).disabled=true;
  }
  refresh();
}
function fingerprint(state:Uint8Array){let hash=2166136261>>>0;for(const bit of state)hash=Math.imul(hash^bit,16777619)>>>0;return binary(hash,32);}
function save(data:unknown){sendEvidence('g8','atunbi-g8-binary.json',data);}
dom('g8-compile').addEventListener('click',load);
dom('g8-grammar').addEventListener('click',()=>{const element=dom('g8-help');element.hidden=!element.hidden;});
dom<HTMLSelectElement>('g8-preset').addEventListener('change',e=>dom<HTMLTextAreaElement>('g8-source').value=examples[(e.target as HTMLSelectElement).value]);
dom('g8-step').addEventListener('click',()=>{stop();vm?.step();refresh();});
dom('g8-run').addEventListener('click',()=>{if(timer!==null){stop();return;}if(!vm)return;dom('g8-run').textContent='Ⅱ Pause';timer=window.setInterval(()=>{vm?.step();refresh();},140);});
dom('g8-reset').addEventListener('click',()=>{stop();if(program)vm=new VM(program);observation=null;labels.length=0;dom('g8-labels').textContent='No interpretations assigned.';refresh();});
dom('g8-compare').addEventListener('click',()=>{if(!program)return;observation=experiment(program);
  dom('g8-causality').textContent='24 matched ticks. '+observation.map(r=>'Matrix '+r.matrix+': '+r.differentBits+'/1000 bits differ (Hamming '+r.hamming.toFixed(3)+')').join('; ')+'. This is measured coupling sensitivity, not intrinsic meaning.';});
dom('g8-save').addEventListener('click',()=>{const text=dom<HTMLInputElement>('g8-name').value.trim();if(!vm||!text)return;
  siteFlow.emit('g8','annotation',{text,tick:vm.tick});
  labels.push({tick:vm.tick,meaning:text.slice(0,120),fingerprint:fingerprint(vm.states[0].bits)});
  dom('g8-labels').textContent=labels.map(x=>'t'+x.tick+' · '+x.meaning+' · '+x.fingerprint).join('\n');dom<HTMLInputElement>('g8-name').value='';});
dom('g8-export').addEventListener('click',()=>{if(!vm||!program)return;
  save({format:'atunbi.g8.binary-kernel.v1',shape:[10,10,10],bitsPerCell:1,
    source:program.source,instructions:program.units.map(x=>({matrix:x.name,words:x.code.map(w=>({line:w.line,bits:binary(w.word,24),decoded:dec(w.word)}))})),
    tick:vm.tick,state:vm.states.map(s=>({matrix:s.name,bits:Array.from(s.bits).join(''),rule:binary(s.rule,8),flips:s.flips})),
    packets:vm.trace.map(p=>({tick:p.tick,bits:binary(p.word,32),fields:unpack(p.word)})),
    experiment:observation,humanInterpretations:labels});
});
dom<HTMLInputElement>('g8-depth').addEventListener('input',refresh);
window.addEventListener('resize',refresh);
try{dom('g8-tests').textContent=check();}catch(error){dom('g8-tests').textContent='SELF TEST FAILED: '+String(error);}
registerView('g8',render_g8);
function refresh() {publishState('g8',{tick:vm?.tick||0,population:vm?.states[0]?.bits.reduce((n,b)=>n+b,0)||0});}
refresh();
(window as unknown as {__ATUNBI_G8:unknown}).__ATUNBI_G8={compile,VM,enc,dec,pack,unpack,experiment,getState:()=>({tick:vm?.tick||0,states:vm?.states.map(x=>Array.from(new Set(x.bits)))})};

document.addEventListener('atunbi:pause-all',stop);

bindControl('g8-publish',()=>{if(!vm)throw Error('Compile G8 before transferring a matrix.');if(!siteFlow.emit('g8','binary',{bits:Array.from(vm.states[0].bits).join(''),tick:vm.tick}))throw Error('G8 → composition is disconnected.');});
