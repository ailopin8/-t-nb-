import './g4.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const N = 10;
const CELLS = N ** 3;
const MAX_NODES = 6;
type Algorithm = 'empty' | 'diffusion' | 'oscillator' | 'growth' | 'automaton';
type Mode = 'excite' | 'inhibit';
interface Sandbox {
  id: number;
  algorithm: Algorithm;
  x: number;
  y: number;
  state: Float32Array;
  influence: number;
}
interface Relation {
  id: number;
  from: number;
  to: number;
  mode: Mode;
  strength: number;
  enabled: boolean;
}
const meta: Record<Algorithm, { label: string; description: string; color: string }> = {
  empty: { label: 'No algorithm', description: 'Empty environment · no pattern exists', color: '#526176' },
  diffusion: { label: 'Diffusion', description: 'Energy spreads through neighbouring positions', color: '#38cfff' },
  oscillator: { label: 'Oscillator', description: 'A 3D travelling wave and rhythmic excitation', color: '#d2a0fc' },
  growth: { label: 'Growth', description: 'A self-reinforcing local growth process', color: '#58dfab' },
  automaton: { label: 'Cellular activation', description: 'Neighbourhood thresholds create clusters', color: '#f2bc74' }
};
let nodes: Sandbox[] = [];
let edges: Relation[] = [];
let nextNodeId = 1;
let nextEdgeId = 1;
let pendingSource: number | null = null;
let activeId: number | null = null;
let tick = 0;
let running = false;
let lastStep = 0;
const clockHz = 7;
const zero = new Float32Array(CELLS);
const at = (x: number, y: number, z: number) => x + N * (y + N * z);
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const noise = (x: number, y: number, z: number, seed: number) => {
  const p = Math.sin((x + 1) * 127.1 + (y + 1) * 311.7 + (z + 1) * 74.7 + seed * 13.79) * 43758.5453;
  return p - Math.floor(p);
};
function seed(algorithm: Algorithm, id: number): Float32Array {
  const data = new Float32Array(CELLS);
  if (algorithm === 'empty') return data;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = (x - 4.5) ** 2 + (y - 4.5) ** 2 + (z - 4.5) ** 2;
    const random = noise(x, y, z, id);
    const i = at(x, y, z);
    if (algorithm === 'diffusion') data[i] = clamp(0.92 * Math.exp(-r / 9) + random * 0.055);
    if (algorithm === 'oscillator') data[i] = clamp(0.22 + 0.26 * Math.sin(x * 0.7 + y * 0.4) * Math.cos(z * 0.75));
    if (algorithm === 'growth') data[i] = clamp(0.93 * Math.exp(-r / 7) + random * 0.07);
    if (algorithm === 'automaton') data[i] = clamp(0.65 * Math.exp(-r / 13) + random * 0.18);
  }
  return data;
}
function neighbours(f: Float32Array, x: number, y: number, z: number): number {
  let total = 0;
  let count = 0;
  for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
    const xx=x+dx, yy=y+dy, zz=z+dz;
    if (xx>=0 && yy>=0 && zz>=0 && xx<N && yy<N && zz<N) {
      total += f[at(xx,yy,zz)];
      count++;
    }
  }
  return total / count;
}
function mean(f: Float32Array): number {
  let sum = 0;
  for (let i=0; i<CELLS; i++) sum += f[i];
  return sum / CELLS;
}
function evolve(node: Sandbox, input: Float32Array, currentTick: number): Float32Array {
  if (node.algorithm === 'empty') return node.state.slice();
  const next = new Float32Array(CELLS);
  const f = node.state;
  for (let z=0; z<N; z++) for (let y=0; y<N; y++) for (let x=0; x<N; x++) {
    const i = at(x,y,z);
    const p = f[i];
    const u = input[i];
    const nb = neighbours(f,x,y,z);
    const phase = currentTick * 0.11;
    if (node.algorithm === 'diffusion') {
      const sourceD = (x - (4.5 + 2.3 * Math.sin(phase))) ** 2 + (y - (4.5 + 2.2 * Math.cos(phase * 0.83))) ** 2 + (z - 4.5) ** 2;
      const source = 0.09 * Math.exp(-sourceD / 3.5);
      next[i] = clamp(p + 0.31 * (nb - p) + source - 0.018 * p + 0.24 * u);
    } else if (node.algorithm === 'oscillator') {
      const wave = 0.5 + 0.37 * Math.sin(x * 0.55 + z * 0.82 - phase * 2.2) * Math.cos(y * 0.45 + phase);
      next[i] = clamp(0.73 * p + 0.27 * wave + 0.21 * u);
    } else if (node.algorithm === 'growth') {
      next[i] = clamp(p + 0.18 * (nb - p) + 0.055 * p * (1 - p) - 0.006 + 0.27 * u);
    } else {
      const texture = 0.058 * Math.sin(x * 1.41 + z * 0.76) * Math.cos(y * 0.87);
      next[i] = clamp(0.77 * p + 0.23 * logistic(9 * (0.5 * p + 0.5 * nb + texture - 0.36 + 0.8 * u)));
    }
  }
  return next;
}
function step(): void {
  if (!nodes.length) return;
  const results = nodes.map(n => {
    if (n.algorithm === 'empty') return { id: n.id, next: n.state.slice(), effect: 0 };
    const input = new Float32Array(CELLS);
    for (const edge of edges) {
      if (!edge.enabled || edge.to !== n.id) continue;
      const from = nodes.find(other => other.id === edge.from);
      if (!from || from.algorithm === 'empty') continue;
      const s = edge.strength * (edge.mode === 'excite' ? 1 : -1);
      for (let i=0; i<CELLS; i++) input[i] += from.state[i] * s;
    }
    const actual = evolve(n, input, tick);
    const independent = evolve(n, zero, tick);
    let squared = 0;
    for (let i=0; i<CELLS; i++) squared += (actual[i] - independent[i]) ** 2;
    return { id: n.id, next: actual, effect: Math.sqrt(squared / CELLS) };
  });
  for (const result of results) {
    const n = nodes.find(n => n.id === result.id);
    if (!n) continue;
    n.state = result.next;
    n.influence = result.effect;
  }
  tick++;
  refreshDynamic();
}
function resetSimulation(): void {
  running = false;
  tick = 0;
  for (const n of nodes) { n.state = seed(n.algorithm,n.id); n.influence = 0; }
  const run = document.querySelector<HTMLElement>('#run-btn');
  if (run) run.textContent = '▶ Run';
  refreshDynamic();
  notice('Simulation reset. Algorithm outputs returned to their initial patterns.');
}
function addSandbox(algo: Algorithm = 'empty'): Sandbox | null {
  if (nodes.length >= MAX_NODES) { notice('G4 prototype supports up to six sandbox environments.'); return null; }
  const id = nextNodeId++;
  const count = nodes.length;
  const node: Sandbox = { id, algorithm: algo, x: 58 + (count%3)*295, y: 65 + Math.floor(count/3)*249, state: seed(algo,id), influence: 0 };
  nodes.push(node);
  activeId = id;
  redraw();
  notice(algo === 'empty' ? 'Environment ' + id + ' created empty. Select an algorithm inside its node.' : 'Environment ' + id + ' contains a running ' + meta[algo].label + ' algorithm.');
  return node;
}
function deleteSandbox(id: number): void {
  nodes = nodes.filter(n => n.id !== id);
  edges = edges.filter(e => e.from !== id && e.to !== id);
  if (pendingSource === id) pendingSource = null;
  if (activeId === id) activeId = nodes[0]?.id ?? null;
  redraw();
  notice('Environment removed, including all its pattern connections.');
}
function connect(to: number): void {
  if (pendingSource === null) { notice('Choose a pattern output first.'); return; }
  const from = pendingSource;
  const source = nodes.find(n => n.id === from);
  const dest = nodes.find(n => n.id === to);
  if (!source || !dest) return;
  if (from === to) { notice('A sandbox cannot connect to itself in this prototype.'); return; }
  if (source.algorithm === 'empty' || dest.algorithm === 'empty') {
    notice('Assign algorithms to both environments before connecting their patterns.');
    return;
  }
  if (edges.some(e => e.from === from && e.to === to)) { notice('Those patterns already have a connection.'); return; }
  edges.push({ id: nextEdgeId++, from, to, strength: 0.65, mode: 'excite', enabled: true });
  pendingSource = null;
  redraw();
  notice('Pattern output from A' + from + ' now modifies the existing algorithm in B' + to + '.');
}
function loadExample(): void {
  nodes = []; edges = []; tick = 0; running = false;
  nextNodeId = 1; nextEdgeId = 1; pendingSource = null;
  const a = addSandbox('diffusion');
  const b = addSandbox('automaton');
  if (!a || !b) return;
  edges.push({ id: nextEdgeId++, from: a.id, to: b.id, strength: 0.65, mode: 'excite', enabled: true });
  redraw();
  notice('Example loaded. A diffusion pattern feeds the existing cellular activation algorithm.');
}
function exportGraph(): void {
  const data = {
    format: 'atunbi.node-network.v2',
    conceptualModel: 'An empty spatial environment hosts an algorithm that generates a pattern. Pattern ports connect via typed relationships.',
    spatialDomain: [N,N,N],
    tick,
    clockHz,
    sandboxes: nodes.map(n => ({ id:n.id, algorithm:n.algorithm, position:{x:n.x,y:n.y}, state:Array.from(n.state), lastTickInfluenceRMS:n.influence, output:{type:'spatial_scalar_field',shape:[N,N,N]} })),
    relationships: edges.map(e => ({ ...e, sourcePort:'pattern_field', targetPort:'algorithm_excitation', mapping:'identity_xyz' }))
  };
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='atunbi-g4-network.json';
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  notice('Network JSON exported with ' + nodes.length + ' environments and ' + edges.length + ' relationships.');
}
function importGraph(file: File): void {
  file.text().then(text => {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) throw new Error('Invalid JSON object.');
    const record = raw as { format?:string; sandboxes?:unknown; relationships?:unknown; tick?:number };
    if (record.format !== 'atunbi.node-network.v2' || !Array.isArray(record.sandboxes) || !Array.isArray(record.relationships)) throw new Error('Not an ÀTÚNBÍ v2 network.');
    if (record.sandboxes.length > MAX_NODES || record.relationships.length > 48) throw new Error('Network exceeds sandbox/edge limits.');
    const parsed: Sandbox[] = record.sandboxes.map((value:unknown) => {
      const n = value as {id:number;algorithm:Algorithm;position?:{x:number;y:number};state?:unknown};
      if (!Number.isSafeInteger(n.id) || n.id<1 || !(n.algorithm in meta)) throw new Error('Invalid sandbox identifier or algorithm.');
      if (!Array.isArray(n.state) || n.state.length !== CELLS || !n.state.every(v=>typeof v === 'number' && Number.isFinite(v) && v>=0 && v<=1)) throw new Error('Invalid pattern field.');
      return {id:n.id,algorithm:n.algorithm,x:Math.max(0,Math.min(1000,Number(n.position?.x)||58)),y:Math.max(0,Math.min(650,Number(n.position?.y)||65)),state:Float32Array.from(n.state),influence:0};
    });
    if (new Set(parsed.map(n=>n.id)).size !== parsed.length) throw new Error('Duplicate sandbox identifiers.');
    const parsedEdges: Relation[] = record.relationships.map((value:unknown) => {
      const e = value as Relation;
      if (!Number.isSafeInteger(e.id) || !parsed.some(n=>n.id===e.from) || !parsed.some(n=>n.id===e.to) || !['excite','inhibit'].includes(e.mode) || !Number.isFinite(e.strength) || e.strength<0 || e.strength>1) throw new Error('Invalid relationship.');
      return {id:e.id,from:e.from,to:e.to,mode:e.mode,strength:e.strength,enabled:!!e.enabled};
    });
    if (parsedEdges.some(e=>e.from===e.to) || new Set(parsedEdges.map(e=>e.from+':'+e.to)).size!==parsedEdges.length) throw new Error('Duplicate or self-referential relation.');
    nodes=parsed; edges=parsedEdges; tick=Number.isSafeInteger(record.tick)&&record.tick!>=0?record.tick!:0;
    nextNodeId=Math.max(0,...nodes.map(n=>n.id))+1;
    nextEdgeId=Math.max(0,...edges.map(e=>e.id))+1;
    activeId=nodes[0]?.id??null; pendingSource=null; running=false;
    redraw(); notice('Network imported. Spatial patterns and topology restored.');
  }).catch(err=>notice('Import failed: '+(err instanceof Error?err.message:'Unreadable network')));
}
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root missing');
root.innerHTML = [
  '<div class="studio">',
  ' <header class="mast"><div class="identity"><span class="mark">◎</span><div><span class="micro">ALGORITHMIC SYSTEMS LABORATORY</span><h1>ÀTÚNBÍ <span> / node editor</span></h1></div></div><span class="version">G4 · WORKING PROTOTYPE</span></header>',
  ' <section class="intro4"><div><h2>An empty space. An algorithm. A pattern. A connection.</h2><p>The 10 × 10 × 10 environment begins empty. Only an algorithm you choose can generate a pattern inside it. Connect that pattern to change another environment’s existing algorithm.</p></div><div class="stats"><strong id="node-count">0</strong><span>ENVIRONMENTS</span><strong id="edge-count">0</strong><span>RELATIONSHIPS</span></div></section>',
  ' <div class="toolbar"><div class="tools-left"><button type="button" id="add-btn" class="accent">＋ Add empty sandbox</button><button type="button" id="example-btn">Load example</button><button type="button" id="clear-btn">Clear workspace</button></div><div class="tools-right"><button type="button" id="export-btn">↓ Export JSON</button><button type="button" id="import-btn">↑ Import JSON</button><input type="file" id="import-file" accept=".json,application/json" hidden /></div></div>',
  ' <div class="columns">',
  '  <section class="panel4 graph-section"><div class="section-head"><div><span class="micro">01 / PATTERN NETWORK</span><h3>Node graph</h3></div><span class="hint">DRAG NODES BY THEIR HEADERS</span></div>',
  '   <div class="graph-scroller"><div id="graph-board"><svg id="wires" viewBox="0 0 1100 600" aria-label="Pattern relationships"></svg><div id="node-layer"></div><div id="empty-graph"><div class="void-symbol">◇</div><h3>No algorithms exist yet.</h3><p>Start by adding an empty spatial environment. Then select the algorithm that will generate its first pattern.</p><button id="empty-add" type="button">＋ Add first empty sandbox</button></div></div></div>',
  '   <div class="graph-foot"><span><i class="key-dot output"></i> Pattern output</span><span><i class="key-dot input"></i> Algorithm input</span><span><i class="key-line"></i> Executable relationship</span></div>',
  '  </section>',
  '  <section class="panel4 spatial-section"><div class="section-head"><div><span class="micro">02 / SPATIAL ENVIRONMENTS</span><h3>Algorithm-generated patterns</h3></div><span class="hint">10 × 10 × 10 PER ENVIRONMENT</span></div>',
  '   <div class="volume"><canvas id="scene"></canvas><div class="volume-top"><span id="view-label">EMPTY WORKSPACE</span><span id="tick-label">TICK 0000</span></div><div class="volume-bottom">DRAG TO ORBIT · SCROLL TO ZOOM</div></div>',
  '   <div class="transport"><div><button id="run-btn" class="accent">▶ Run</button><button id="step-btn">Step +1</button><button id="reset-btn">↻ Reset</button></div><div id="vr-slot"></div></div>',
  '   <p class="caption4">Boundaries indicate empty coordinate domains. Coloured geometry appears only when an assigned algorithm generates a spatial pattern. WebXR is view-only in this prototype.</p>',
  '  </section>',
  ' </div>',
  ' <section class="lower"><div class="panel4 connections"><div class="section-head"><div><span class="micro">03 / RELATIONSHIP OPERATORS</span><h3>Connections</h3></div><span class="hint">EACH EDGE IS A TRANSFORMATION</span></div><div id="edge-list" class="edge-list"></div></div>',
  ' <div class="panel4 metrics"><div class="section-head"><div><span class="micro">04 / LIVE INSPECTION</span><h3>Observe the experiment</h3></div></div><div id="metrics-list"></div></div></section>',
  ' <section class="method4"><span class="micro">G4 / ACCEPTANCE GATE</span><p>Create an empty environment → assign an algorithm → add another environment and algorithm → connect a pattern output to its input → step the simulation → verify nonzero <strong>local coupling impact</strong> → disconnect the relationship → verify impact returns to zero. The receiving algorithm must remain intact throughout.</p></section>',
  ' <footer>ÀTÚNBÍ · the environment is empty until an algorithm generates a pattern <span>GitHub: ailopin8/-t-nb-</span></footer>',
  ' <div id="toast" role="status" aria-live="polite"></div>',
  '</div>'
].join('');

function notice(message: string): void {
  const el = document.querySelector<HTMLElement>('#toast');
  if (el) el.textContent = message;
}
function algoOptions(current: Algorithm): string {
  return (Object.keys(meta) as Algorithm[]).map(k => '<option value="' + k + '"' + (k===current?' selected':'') + '>' + meta[k].label + '</option>').join('');
}
function nodeMarkup(n: Sandbox): string {
  const color = meta[n.algorithm].color;
  const assigned = n.algorithm !== 'empty';
  return '<article class="g-node'+(activeId===n.id?' picked':'')+'" style="left:'+n.x+'px;top:'+n.y+'px;--node-color:'+color+'" data-node="'+n.id+'">'
    +'<div class="g-node-head" data-drag="'+n.id+'"><span class="environment-label">ENV '+n.id+' · 10³ EMPTY SPACE</span><button class="remove-node" type="button" data-action="delete" data-id="'+n.id+'" aria-label="Remove environment '+n.id+'">×</button></div>'
    +'<div class="g-node-body"><div class="node-core"><span class="node-glyph">'+(assigned?'✳':'◇')+'</span><div><strong>'+(assigned?meta[n.algorithm].label:'Empty environment')+'</strong><small>'+ (assigned?'ALGORITHM GENERATING PATTERN':'NO ALGORITHM · NO CONTENT') +'</small></div></div>'
    +'<label class="choose">Algorithm<select data-algo="'+n.id+'" aria-label="Algorithm for environment '+n.id+'">'+algoOptions(n.algorithm)+'</select></label>'
    +'<p class="algo-note">'+meta[n.algorithm].description+'</p>'
    +'<div class="node-ports"><button type="button" data-action="target" data-id="'+n.id+'" class="port-button" aria-label="Connect pattern to environment '+n.id+'"><i class="port in"></i>Input</button>'
    +'<button type="button" data-action="source" data-id="'+n.id+'" class="port-button'+(pendingSource===n.id?' armed':'')+'" aria-label="Connect from pattern of environment '+n.id+'">Pattern<i class="port out"></i></button></div>'
    +'<div class="node-measure"><span>MEAN PATTERN</span><strong id="node-mean-'+n.id+'">'+mean(n.state).toFixed(3)+'</strong><span>INPUT IMPACT</span><strong id="node-impact-'+n.id+'">'+n.influence.toFixed(4)+'</strong></div>'
    +'</div></article>';
}
function drawEdges(): void {
  const svg = document.querySelector<SVGSVGElement>('#wires');
  if (!svg) return;
  svg.innerHTML = edges.map(e => {
    const a = nodes.find(n=>n.id===e.from), b=nodes.find(n=>n.id===e.to);
    if (!a || !b) return '';
    const x1=a.x+248, y1=a.y+181, x2=b.x+3, y2=b.y+181;
    const bend=Math.max(55,Math.abs(x2-x1)*0.5);
    const path = 'M '+x1+' '+y1+' C '+(x1+bend)+' '+y1+', '+(x2-bend)+' '+y2+', '+x2+' '+y2;
    return '<path d="'+path+'" stroke="'+(e.mode==='excite'?'#e6b668':'#d77cba')+'" stroke-width="2.5" stroke-opacity="'+(e.enabled?'.95':'.25')+'" stroke-dasharray="'+(e.enabled?'6 6':'3 8')+'" fill="none"/>';
  }).join('');
}
function graphRender(): void {
  const layer=document.querySelector<HTMLElement>('#node-layer');
  const empty=document.querySelector<HTMLElement>('#empty-graph');
  if (layer) layer.innerHTML=nodes.map(nodeMarkup).join('');
  if (empty) empty.style.display=nodes.length?'none':'flex';
  drawEdges();
}
function edgeRender(): void {
  const root=document.querySelector<HTMLElement>('#edge-list');
  if (!root) return;
  root.innerHTML=edges.length?edges.map(e => {
    return '<div class="edge-card" data-edge="'+e.id+'"><div class="edge-title"><span class="edge-index">E'+e.id+'</span><strong>ENV '+e.from+' PATTERN → ENV '+e.to+' ALGORITHM</strong><button type="button" data-edge-action="delete" data-id="'+e.id+'">Remove</button></div>'
    +'<div class="edge-settings"><label>Relationship <select data-edge-mode="'+e.id+'"><option value="excite"'+(e.mode==='excite'?' selected':'')+'>Excite (+)</option><option value="inhibit"'+(e.mode==='inhibit'?' selected':'')+'>Inhibit (−)</option></select></label>'
    +'<label>Strength <input data-edge-strength="'+e.id+'" type="range" min="0" max="1" step=".05" value="'+e.strength+'" /></label><output id="edge-strength-'+e.id+'">'+e.strength.toFixed(2)+'</output>'
    +'<label class="enable-edge"><input type="checkbox" data-edge-enabled="'+e.id+'" '+(e.enabled?'checked':'')+' /> Active</label></div></div>';
  }).join(''):'<div class="placeholder">No relationships yet. On a node, select <strong>Pattern</strong>, then select <strong>Input</strong> on another node. Both must contain algorithms.</div>';
}
function refreshDynamic(): void {
  const tickLabel=document.querySelector<HTMLElement>('#tick-label');
  if (tickLabel) tickLabel.textContent='TICK '+String(tick).padStart(4,'0');
  const nc=document.querySelector<HTMLElement>('#node-count');if (nc) nc.textContent=String(nodes.length);
  const ec=document.querySelector<HTMLElement>('#edge-count');if (ec) ec.textContent=String(edges.length);
  const status=document.querySelector<HTMLElement>('#view-label');
  if (status) status.textContent=nodes.length===0?'EMPTY WORKSPACE':nodes.filter(n=>n.algorithm!=='empty').length+' ACTIVE ALGORITHMS / '+nodes.length+' ENVIRONMENTS';
  for (const n of nodes) {
    const avg=document.querySelector<HTMLElement>('#node-mean-'+n.id);
    const effect=document.querySelector<HTMLElement>('#node-impact-'+n.id);
    if (avg) avg.textContent=mean(n.state).toFixed(3);
    if (effect) effect.textContent=n.influence.toFixed(4);
  }
  const metrics=document.querySelector<HTMLElement>('#metrics-list');
  if (metrics) metrics.innerHTML=nodes.length?nodes.map(n=>'<div class="metric-line"><span class="metric-dot" style="background:'+meta[n.algorithm].color+'"></span><span>Env '+n.id+' · '+meta[n.algorithm].label+'</span><span>mean '+mean(n.state).toFixed(3)+'</span><strong>impact '+n.influence.toFixed(4)+'</strong></div>').join(''):'<p class="placeholder">No algorithms or patterns to inspect. Create an environment first.</p>';
  paintVolume();
}
function redraw(): void {
  graphRender();
  edgeRender();
  rebuildVolume();
  refreshDynamic();
}
const canvas=document.querySelector<HTMLCanvasElement>('#scene')!;
const scene=new THREE.Scene();
scene.background=new THREE.Color('#070f20');
const camera=new THREE.PerspectiveCamera(55,1,.03,100);
camera.position.set(3.9,3.0,5.8);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
renderer.xr.enabled=true;
const controls=new OrbitControls(camera,canvas);
controls.target.set(0,0,0);
controls.enableDamping=true;controls.update();
scene.add(new THREE.AmbientLight(0xffffff,1));
const volumeGroup=new THREE.Group();scene.add(volumeGroup);
const geometry=new THREE.BoxGeometry(.09,.09,.09);
const matrixDummy=new THREE.Object3D();
const colorCache=new THREE.Color();
const instances=new Map<number,THREE.InstancedMesh>();
function rebuildVolume(): void {
  for (const old of [...volumeGroup.children]) {
    volumeGroup.remove(old);
    if (old instanceof THREE.InstancedMesh) (old.material as THREE.Material).dispose();
    if (old instanceof THREE.LineSegments) {
      old.geometry.dispose();
      (old.material as THREE.Material).dispose();
    }
  }
  instances.clear();
  nodes.forEach((n,i) => {
    const groupX=(i%3-1)*1.52;
    const groupY=(Math.floor(i/3)===0?.82:-.82);
    const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.19,1.19,1.19)),new THREE.LineBasicMaterial({color: new THREE.Color(meta[n.algorithm].color),transparent:true,opacity:n.algorithm==='empty'?.28:.50}));
    outline.position.set(groupX,groupY,0);
    volumeGroup.add(outline);
    if (n.algorithm==='empty') return;
    const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:0xffffff}),CELLS);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    volumeGroup.add(mesh);instances.set(n.id,mesh);
  });
}
function paintVolume(): void {
  let index=0;
  for (const n of nodes) {
    const mesh=instances.get(n.id);
    const groupX=(index%3-1)*1.52;
    const groupY=(Math.floor(index/3)===0?.82:-.82);
    index++;
    if (!mesh) continue;
    const mainColor=new THREE.Color(meta[n.algorithm].color);
    for (let z=0;z<N;z++) for (let y=0;y<N;y++) for (let x=0;x<N;x++) {
      const i=at(x,y,z), value=n.state[i];
      matrixDummy.position.set(groupX+(x-4.5)*.117,groupY+(y-4.5)*.117,(z-4.5)*.117);
      const s=value>.16?.25+value*.97:0.000001;
      matrixDummy.scale.setScalar(s);
      matrixDummy.updateMatrix();
      mesh.setMatrixAt(i,matrixDummy.matrix);
      colorCache.copy(mainColor).multiplyScalar(.38+.62*value);
      mesh.setColorAt(i,colorCache);
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }
}
function resize(): void {
  const parent=canvas.parentElement;
  if(!parent)return;
  const width=Math.max(1,parent.clientWidth),height=Math.max(1,parent.clientHeight);
  renderer.setSize(width,height,false);
  camera.aspect=width/height;camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);
new ResizeObserver(resize).observe(canvas.parentElement!);
const vrSlot=document.querySelector('#vr-slot');
if(vrSlot){const button=VRButton.createButton(renderer);button.id='enter-vr';vrSlot.appendChild(button);}
const board=document.querySelector<HTMLElement>('#graph-board')!;
const layer=document.querySelector<HTMLElement>('#node-layer')!;
const edgeList=document.querySelector<HTMLElement>('#edge-list')!;
board.addEventListener('click', event => {
  const el=(event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  const id=Number(el.dataset.id);
  if(el.dataset.action==='delete'){deleteSandbox(id);return;}
  if(el.dataset.action==='source'){
    const n=nodes.find(n=>n.id===id);
    if(!n||n.algorithm==='empty'){notice('Assign an algorithm before exposing its pattern output.');return;}
    pendingSource=id;activeId=id;graphRender();
    notice('Source selected: environment '+id+'. Select Input on the receiving algorithm.');
    return;
  }
  if(el.dataset.action==='target'){activeId=id;connect(id);}
});
board.addEventListener('change', event => {
  const t=event.target as HTMLSelectElement;
  if(!t.matches('[data-algo]'))return;
  const n=nodes.find(n=>n.id===Number(t.dataset.algo));
  if(!n)return;
  const a=t.value as Algorithm;
  if(!(a in meta))return;
  n.algorithm=a;n.state=seed(a,n.id);n.influence=0;
  edges=edges.filter(e=> (e.from!==n.id&&e.to!==n.id) || (nodes.find(s=>s.id===e.from)?.algorithm!=='empty'&&nodes.find(s=>s.id===e.to)?.algorithm!=='empty'));
  redraw();notice(a==='empty'?'Environment '+n.id+' is empty again. Its pattern has disappeared.':'Algorithm '+meta[a].label+' assigned to environment '+n.id+'.');
});
interface Drag { id:number; sx:number;sy:number;x:number;y:number }
let drag: Drag|null=null;
board.addEventListener('pointerdown',event=>{
  const target=(event.target as HTMLElement).closest<HTMLElement>('[data-drag]');
  if(!target || (event.target as HTMLElement).closest('button'))return;
  const id=Number(target.dataset.drag),n=nodes.find(n=>n.id===id);
  if(!n)return;
  drag={id,sx:event.clientX,sy:event.clientY,x:n.x,y:n.y};
  target.setPointerCapture(event.pointerId);
  activeId=id;
});
board.addEventListener('pointermove',event=>{
  if(!drag)return;
  const n=nodes.find(n=>n.id===drag!.id);
  if(!n)return;
  n.x=Math.max(10,Math.min(836,drag.x+event.clientX-drag.sx));
  n.y=Math.max(10,Math.min(375,drag.y+event.clientY-drag.sy));
  const el=layer.querySelector<HTMLElement>('[data-node="'+n.id+'"]');
  if(el){el.style.left=n.x+'px';el.style.top=n.y+'px';}
  drawEdges();
});
const release=()=>{if(drag){drag=null;graphRender();}};
board.addEventListener('pointerup',release);
board.addEventListener('pointercancel',release);
edgeList.addEventListener('click', event=>{
  const btn=(event.target as HTMLElement).closest<HTMLElement>('[data-edge-action]');
  if(!btn)return;
  const id=Number(btn.dataset.id);
  if(btn.dataset.edgeAction==='delete'){edges=edges.filter(e=>e.id!==id);redraw();notice('Relationship removed. Receiving algorithm remains intact.');}
});
edgeList.addEventListener('input', event=>{
  const t=event.target as HTMLInputElement;
  const id=Number(t.dataset.edgeStrength);
  if(!Number.isSafeInteger(id)||!t.matches('[data-edge-strength]'))return;
  const e=edges.find(e=>e.id===id);if(!e)return;
  e.strength=Number(t.value);
  const label=document.querySelector<HTMLOutputElement>('#edge-strength-'+id);if(label)label.textContent=e.strength.toFixed(2);
});
edgeList.addEventListener('change',event=>{
  const t=event.target as HTMLInputElement|HTMLSelectElement;
  const mode=t.getAttribute('data-edge-mode'), enabled=t.getAttribute('data-edge-enabled');
  const e=edges.find(e=>e.id===Number(mode??enabled));
  if(!e)return;
  if(mode!==null)e.mode=t.value as Mode;
  if(enabled!==null)e.enabled=(t as HTMLInputElement).checked;
  drawEdges();
  notice('Relationship settings updated.');
});
document.querySelector('#add-btn')?.addEventListener('click',()=>addSandbox());
document.querySelector('#empty-add')?.addEventListener('click',()=>addSandbox());
document.querySelector('#example-btn')?.addEventListener('click',()=>loadExample());
document.querySelector('#clear-btn')?.addEventListener('click',()=>{
  if(!nodes.length){notice('The workspace is already empty.');return;}
  if(!window.confirm('Clear every sandbox and relationship? This cannot be undone unless you exported the network.'))return;
  nodes=[];edges=[];running=false;tick=0;pendingSource=null;activeId=null;redraw();notice('Workspace cleared. No algorithms or patterns exist.');
});
document.querySelector('#run-btn')?.addEventListener('click',()=>{
  if(!nodes.some(n=>n.algorithm!=='empty')){notice('Assign an algorithm before running the simulation.');return;}
  running=!running;lastStep=performance.now();
  const el=document.querySelector<HTMLElement>('#run-btn');if(el)el.textContent=running?'Ⅱ Pause':'▶ Run';
});
document.querySelector('#step-btn')?.addEventListener('click',()=>{
  running=false;const el=document.querySelector<HTMLElement>('#run-btn');if(el)el.textContent='▶ Run';
  if(!nodes.some(n=>n.algorithm!=='empty')){notice('There is no algorithm to step.');return;}
  step();
});
document.querySelector('#reset-btn')?.addEventListener('click',resetSimulation);
document.querySelector('#export-btn')?.addEventListener('click',exportGraph);
document.querySelector('#import-btn')?.addEventListener('click',()=>document.querySelector<HTMLInputElement>('#import-file')?.click());
document.querySelector<HTMLInputElement>('#import-file')?.addEventListener('change',event=>{
  const el=event.target as HTMLInputElement;
  if(el.files?.[0])importGraph(el.files[0]);
  el.value='';
});
redraw();resize();
notice('Workspace ready. Start with an empty environment; nothing runs until an algorithm is assigned.');
renderer.setAnimationLoop((now:number)=>{
  if(running && now-lastStep>=1000/clockHz){
    const count=Math.min(3,Math.floor((now-lastStep)*clockHz/1000));
    for(let i=0;i<count;i++)step();
    lastStep=now;
  }
  controls.update();
  renderer.render(scene,camera);
});
