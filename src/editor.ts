import {registerView, publishState, sendEvidence} from './flow/site';
import './g4.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { installSpatialControls } from './spatial-controls';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { runAblationExperiment } from './emergence';
import type { ExperimentResult, Ablation } from './emergence';

const N = 10;
const CELLS = N ** 3;
const MAX_NODES = 6;
const MAX_LAYERS = 4;
type Algorithm = 'empty' | 'diffusion' | 'oscillator' | 'growth' | 'automaton';
type Mode = 'excite' | 'inhibit';
type ActiveAlgorithm = Exclude<Algorithm, 'empty'>;
interface Layer {
  id: number;
  algorithm: ActiveAlgorithm;
  state: Float32Array;
  influence: number;
}
interface InnerLink {
  id: number;
  from: number;
  to: number;
  strength: number;
  mode: Mode;
  enabled: boolean;
}
interface Sandbox {
  id: number;
  algorithm: Algorithm;
  x: number;
  y: number;
  state: Float32Array;
  influence: number;
  layers: Layer[];
  innerLinks: InnerLink[];
  outputLayerId: number | null;
}
interface Relation {
  id: number;
  from: number;
  to: number;
  targetLayerId: number;
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
function evolve(node: Layer, input: Float32Array, currentTick: number): Float32Array {
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
function syncSandbox(n: Sandbox): void {
  const chosen = n.layers.find(layer => layer.id === n.outputLayerId) || n.layers[0];
  n.outputLayerId = chosen?.id ?? null;
  n.algorithm = chosen?.algorithm ?? 'empty';
  n.state = chosen?.state ?? zero;
  n.influence = chosen?.influence ?? 0;
}
function addLayer(n: Sandbox, algorithm: ActiveAlgorithm): Layer | null {
  if (n.layers.length >= MAX_LAYERS) {
    notice('Each environment supports up to four algorithms in this prototype.');
    return null;
  }
  const id = Math.max(0, ...n.layers.map(layer => layer.id)) + 1;
  const layer: Layer = {
    id, algorithm, state: seed(algorithm, n.id * 17 + id), influence: 0
  };
  n.layers.push(layer);
  if (n.outputLayerId === null) n.outputLayerId = id;
  syncSandbox(n);
  return layer;
}
function deleteLayer(n: Sandbox, id: number): void {
  n.layers = n.layers.filter(layer => layer.id !== id);
  n.innerLinks = n.innerLinks.filter(edge => edge.from !== id && edge.to !== id);
  edges = edges.filter(edge => !(edge.to === n.id && edge.targetLayerId === id));
  syncSandbox(n);
  if (!n.layers.length) edges = edges.filter(edge => edge.from !== n.id && edge.to !== n.id);
  redraw();
  notice('Algorithm removed. Remaining patterns and algorithms are preserved.');
}
function addInternalLink(n: Sandbox, from: number, to: number): void {
  if (from === to || !n.layers.some(l => l.id === from) || !n.layers.some(l => l.id === to)) {
    notice('Choose two different existing algorithms in the same environment.');
    return;
  }
  if (n.innerLinks.some(edge => edge.from === from && edge.to === to)) {
    notice('Those algorithm patterns are already connected internally.');
    return;
  }
  n.innerLinks.push({
    id: Math.max(0, ...n.innerLinks.map(edge => edge.id)) + 1,
    from, to, strength: 0.65, mode: 'excite', enabled: true
  });
  redraw();
  notice('Internal connection added. Source pattern will influence the receiving algorithm.');
}
function step(): void {
  if (!nodes.some(n => n.layers.length)) return;
  // All inputs are calculated from the previous tick. No algorithm sees a
  // partially updated pattern from another layer or sandbox.
  const updates = nodes.map(n => ({
    id: n.id,
    layers: n.layers.map(layer => {
      const input = new Float32Array(CELLS);
      for (const edge of n.innerLinks) {
        if (!edge.enabled || edge.to !== layer.id) continue;
        const source = n.layers.find(l => l.id === edge.from);
        if (!source) continue;
        const factor = edge.strength * (edge.mode === 'excite' ? 1 : -1);
        for (let i = 0; i < CELLS; i++) input[i] += factor * source.state[i];
      }
      for (const edge of edges) {
        if (!edge.enabled || edge.to !== n.id || edge.targetLayerId !== layer.id) continue;
        const sourceSandbox = nodes.find(other => other.id === edge.from);
        if (!sourceSandbox || !sourceSandbox.layers.length) continue;
        const factor = edge.strength * (edge.mode === 'excite' ? 1 : -1);
        for (let i = 0; i < CELLS; i++) input[i] += factor * sourceSandbox.state[i];
      }
      const next = evolve(layer, input, tick);
      const uncoupled = evolve(layer, zero, tick);
      let error = 0;
      for (let i = 0; i < CELLS; i++) error += (next[i] - uncoupled[i]) ** 2;
      return { id: layer.id, state: next, influence: Math.sqrt(error / CELLS) };
    })
  }));
  for (const update of updates) {
    const n = nodes.find(node => node.id === update.id);
    if (!n) continue;
    for (const result of update.layers) {
      const layer = n.layers.find(l => l.id === result.id);
      if (!layer) continue;
      layer.state = result.state;
      layer.influence = result.influence;
    }
    syncSandbox(n);
  }
  tick++;
  refreshDynamic();
}
function resetSimulation(): void {
  running = false;
  tick = 0;
  for (const n of nodes) {
    for (const layer of n.layers) {
      layer.state = seed(layer.algorithm, n.id * 17 + layer.id);
      layer.influence = 0;
    }
    syncSandbox(n);
  }
  const run = document.querySelector<HTMLElement>('#run-btn');
  if (run) run.textContent = '▶ Run';
  refreshDynamic();
  notice('Reset complete. Each algorithm has returned to its own initial pattern.');
}
function addSandbox(algo: Algorithm = 'empty'): Sandbox | null {
  if (nodes.length >= MAX_NODES) {
    notice('The prototype supports up to six environments.');
    return null;
  }
  const id = nextNodeId++;
  const count = nodes.length;
  const n: Sandbox = {
    id, algorithm: 'empty', x: 58 + (count % 3) * 295,
    y: 65 + Math.floor(count / 3) * 260, state: zero,
    influence: 0, layers: [], innerLinks: [], outputLayerId: null
  };
  nodes.push(n);
  if (algo !== 'empty') addLayer(n, algo);
  activeId = id;
  redraw();
  notice(algo === 'empty'
    ? 'Environment ' + id + ' is empty. Assign its first algorithm.'
    : 'Environment ' + id + ': ' + meta[algo].label + ' is generating a pattern.');
  return n;
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
  edges.push({ id: nextEdgeId++, from, to, targetLayerId: dest.outputLayerId!, strength: 0.65, mode: 'excite', enabled: true });
  pendingSource = null;
  redraw();
  notice('Pattern output from A' + from + ' now modifies the existing algorithm in B' + to + '.');
}
function loadExample(): void {
  nodes = []; edges = []; tick = 0; running = false;
  nextNodeId = 1; nextEdgeId = 1; pendingSource = null;
  const a = addSandbox('diffusion');
  const b = addSandbox('oscillator');
  if (!a || !b) return;
  const growth = addLayer(a, 'growth');
  if (growth) addInternalLink(a, a.layers[0].id, growth.id);
  const automaton = addLayer(b, 'automaton');
  if (automaton) {
    addInternalLink(b, b.layers[0].id, automaton.id);
    b.outputLayerId = automaton.id;
    syncSandbox(b);
  }
  edges.push({
    id: nextEdgeId++, from: a.id, to: b.id,
    targetLayerId: automaton?.id ?? b.layers[0].id,
    strength: 0.65, mode: 'excite', enabled: true
  });
  activeId = b.id;
  redraw();
  notice('Example loaded: each environment contains two algorithms and an internal pattern link; an external link connects the two environments.');
}
function exportGraph(): void {
  const payload = {
    format: 'atunbi.node-network.v3',
    architecture: 'Empty spatial environments host independently evolving algorithms. Pattern ports and typed transformations form inner and outer graphs.',
    spatialDomain: [N, N, N], tick, clockHz,
    sandboxes: nodes.map(n => ({
      id: n.id, position: { x: n.x, y: n.y },
      outputLayerId: n.outputLayerId,
      layers: n.layers.map(l => ({
        id: l.id, algorithm: l.algorithm, state: Array.from(l.state),
        lastTickInfluenceRMS: l.influence
      })),
      innerLinks: n.innerLinks
    })),
    relationships: edges.map(e => ({
      ...e, sourcePort: 'selected_pattern_field',
      targetPort: 'specific_algorithm_input', mapping: 'identity_xyz'
    }))
  };
  if(!sendEvidence('g6','atunbi-g5-network.json',payload))return;
  notice('Exported ' + nodes.length + ' environments, ' +
    nodes.reduce((total,n) => total + n.layers.length, 0) + ' algorithms, and all relationships.');
}
function importGraph(file: File): void {
  if (file.size > 8_000_000) {
    notice('Import rejected: file is too large.');
    return;
  }
  file.text().then(content => {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid network.');
    const record = parsed as {
      format?: string; sandboxes?: unknown; relationships?: unknown; tick?: number
    };
    if (!['atunbi.node-network.v2', 'atunbi.node-network.v3'].includes(record.format ?? '') ||
        !Array.isArray(record.sandboxes) || !Array.isArray(record.relationships)) {
      throw new Error('Expected an ÀTÚNBÍ v2 or v3 network.');
    }
    if (record.sandboxes.length > MAX_NODES || record.relationships.length > 48) {
      throw new Error('Too many environments or relationships.');
    }
    const isActive = (value: unknown): value is ActiveAlgorithm =>
      typeof value === 'string' && value !== 'empty' &&
      Object.prototype.hasOwnProperty.call(meta, value);
    const validateState = (value: unknown): Float32Array => {
      if (!Array.isArray(value) || value.length !== CELLS ||
          !value.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) {
        throw new Error('A pattern must contain exactly 1,000 finite values in [0,1].');
      }
      return Float32Array.from(value);
    };
    const incoming: Sandbox[] = record.sandboxes.map((item: unknown) => {
      if (!item || typeof item !== 'object') throw new Error('Malformed environment.');
      const n = item as {
        id:number; algorithm?:Algorithm; state?:unknown;
        position?:{x:number;y:number}; outputLayerId?:number|null;
        layers?:unknown; innerLinks?:unknown
      };
      if (!Number.isSafeInteger(n.id) || n.id < 1) throw new Error('Invalid environment identifier.');
      const obj: Sandbox = {
        id:n.id, algorithm:'empty', state:zero, influence:0,
        x:Math.max(0, Math.min(836, Number(n.position?.x) || 58)),
        y:Math.max(0, Math.min(375, Number(n.position?.y) || 65)),
        layers:[], innerLinks:[], outputLayerId:null
      };
      if (record.format === 'atunbi.node-network.v2') {
        if (isActive(n.algorithm)) obj.layers.push({
          id:1, algorithm:n.algorithm, state:validateState(n.state), influence:0
        });
        else if (n.algorithm !== 'empty') throw new Error('Invalid algorithm.');
        obj.outputLayerId=obj.layers[0]?.id ?? null;
      } else {
        if (!Array.isArray(n.layers) || n.layers.length > MAX_LAYERS) {
          throw new Error('Too many algorithms or invalid algorithm layers.');
        }
        obj.layers=n.layers.map((item:unknown) => {
          if (!item || typeof item !== 'object') throw new Error('Invalid algorithm layer.');
          const layer=item as {id:number;algorithm:unknown;state:unknown};
          if (!Number.isSafeInteger(layer.id) || layer.id < 1 || !isActive(layer.algorithm)) {
            throw new Error('Invalid algorithm type or layer ID.');
          }
          return {id:layer.id,algorithm:layer.algorithm,state:validateState(layer.state),influence:0};
        });
        if (new Set(obj.layers.map(l => l.id)).size !== obj.layers.length) {
          throw new Error('Duplicate algorithm IDs.');
        }
        if (n.outputLayerId != null && !obj.layers.some(l => l.id === n.outputLayerId)) {
          throw new Error('Exported pattern output is missing.');
        }
        obj.outputLayerId=n.outputLayerId ?? obj.layers[0]?.id ?? null;
        if (!Array.isArray(n.innerLinks) || n.innerLinks.length > 16) {
          throw new Error('Invalid internal relationship list.');
        }
        obj.innerLinks=n.innerLinks.map((item:unknown) => {
          const e=item as InnerLink;
          if (!e || !Number.isSafeInteger(e.id) || e.id < 1 ||
              !obj.layers.some(l => l.id === e.from) ||
              !obj.layers.some(l => l.id === e.to) || e.from === e.to ||
              (e.mode !== 'excite' && e.mode !== 'inhibit') ||
              !Number.isFinite(e.strength) || e.strength < 0 || e.strength > 1 ||
              typeof e.enabled !== 'boolean') throw new Error('Invalid internal connection.');
          return {id:e.id,from:e.from,to:e.to,strength:e.strength,mode:e.mode,enabled:e.enabled};
        });
        if (new Set(obj.innerLinks.map(e => e.from + ':' + e.to)).size !== obj.innerLinks.length ||
            new Set(obj.innerLinks.map(e => e.id)).size !== obj.innerLinks.length) {
          throw new Error('Duplicate internal connections.');
        }
      }
      syncSandbox(obj);
      return obj;
    });
    if (new Set(incoming.map(n => n.id)).size !== incoming.length) {
      throw new Error('Duplicate environment IDs.');
    }
    const outgoing: Relation[] = record.relationships.map((item:unknown) => {
      if (!item || typeof item !== 'object') throw new Error('Invalid relationship.');
      const e=item as Relation;
      const target=incoming.find(n => n.id === e.to);
      const source=incoming.find(n => n.id === e.from);
      const layerId=record.format === 'atunbi.node-network.v2' ? target?.outputLayerId : e.targetLayerId;
      if (!Number.isSafeInteger(e.id) || e.id < 1 || !target || !source ||
          source.id === target.id || !source.layers.length ||
          !target.layers.some(l => l.id === layerId) ||
          !Number.isFinite(e.strength) || e.strength < 0 || e.strength > 1 ||
          (e.mode !== 'excite' && e.mode !== 'inhibit') ||
          typeof e.enabled !== 'boolean') throw new Error('Invalid external relationship.');
      return {id:e.id,from:e.from,to:e.to,targetLayerId:layerId!,mode:e.mode,
        strength:e.strength,enabled:e.enabled};
    });
    if (new Set(outgoing.map(e => e.from + ':' + e.to)).size !== outgoing.length ||
        new Set(outgoing.map(e => e.id)).size !== outgoing.length) {
      throw new Error('Duplicate external relationships.');
    }
    nodes=incoming; edges=outgoing;
    tick=Number.isSafeInteger(record.tick) && record.tick! >= 0 && record.tick! < 10_000_000 ? record.tick! : 0;
    nextNodeId=Math.max(0,...nodes.map(n=>n.id))+1;
    nextEdgeId=Math.max(0,...edges.map(e=>e.id))+1;
    activeId=nodes[0]?.id ?? null;
    pendingSource=null; running=false;
    redraw();
    notice('Network restored: algorithm layers, patterns, and inner/outer relationships.');
  }).catch(error => {
    notice('Import failed: ' + (error instanceof Error ? error.message : 'Unreadable network.'));
  });
}
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root missing');
root.innerHTML = [
  '<div class="studio">',
  ' <header class="mast"><div class="identity"><span class="mark">◎</span><div><span class="micro">ALGORITHMIC SYSTEMS LABORATORY</span><h1>ÀTÚNBÍ <span> / node editor</span></h1></div></div><span class="version">G6 · INTERVENTION LAB</span></header>',
  ' <section class="intro4"><div><h2>Create patterns. Compose systems. Test what emerges.</h2><p>Purpose: understand and engineer how algorithms generate collective behaviour. Begin with an empty 10³ environment, install algorithms, connect pattern outputs, and use controlled experiments to measure the consequences.</p></div><div class="stats"><strong id="node-count">0</strong><span>ENVIRONMENTS</span><strong id="edge-count">0</strong><span>RELATIONSHIPS</span></div></section>',
  ' <div class="toolbar"><div class="tools-left"><button type="button" id="add-btn" class="accent">＋ Add empty sandbox</button><button type="button" id="example-btn">Load example</button><button type="button" id="clear-btn">Clear workspace</button></div><div class="tools-right"><button type="button" id="export-btn">↓ Export JSON</button><button type="button" id="import-btn">↑ Import JSON</button><input type="file" id="import-file" accept=".json,application/json" hidden /></div></div>',
  ' <div class="columns">',
  '  <section class="panel4 graph-section"><div class="section-head"><div><span class="micro">01 / PATTERN NETWORK</span><h3>Node graph</h3></div><span class="hint">DRAG HEADERS OR FOCUS THEM AND USE ARROW KEYS</span></div>',
  '   <div class="graph-scroller"><div id="graph-board"><svg id="wires" viewBox="0 0 1100 600" aria-label="Pattern relationships"></svg><div id="node-layer"></div><div id="empty-graph"><div class="void-symbol">◇</div><h3>No algorithms exist yet.</h3><p>Start by adding an empty spatial environment. Then select the algorithm that will generate its first pattern.</p><button id="empty-add" type="button">＋ Add first empty sandbox</button></div></div></div>',
  '   <div class="graph-foot"><span><i class="key-dot output"></i> Pattern output</span><span><i class="key-dot input"></i> Algorithm input</span><span><i class="key-line"></i> Executable relationship</span></div>',
  '  </section>',
  '  <section class="panel4 spatial-section"><div class="section-head"><div><span class="micro">02 / COMPOSITE PATTERN SPACE</span><h3>Algorithm-generated patterns</h3></div><span class="hint">10 × 10 × 10 PER ENVIRONMENT</span></div>',
  '   <div class="volume"><canvas id="scene"></canvas><div class="volume-top"><span id="view-label">EMPTY WORKSPACE</span><span id="tick-label">TICK 0000</span></div><div class="volume-bottom">DRAG TO ORBIT · SCROLL TO ZOOM</div></div>',
  '   <div class="transport"><div><button id="run-btn" class="accent">▶ Run</button><button id="step-btn">Step +1</button><button id="reset-btn">↻ Reset</button></div><div id="vr-slot"></div></div>',
  '   <p class="caption4">An environment contains no objects until algorithms generate patterns. Multiple pattern fields share its coordinate domain and are visualised as a colour mixture. In WebXR, controller-ray targets run, pause, step and recenter the G6 network.</p>',
  '  </section>',
  ' </div>',
  ' <section class="panel4 inner-section"><div class="section-head"><div><span class="micro">03 / INTERNAL ALGORITHM GRAPH</span><h3>Inside an environment</h3></div><span class="hint">SELECT AN ENVIRONMENT TO EDIT ITS INTERNAL PATTERNS</span></div><div id="layers-body"></div></section>',
  ' <section class="lower"><div class="panel4 connections"><div class="section-head"><div><span class="micro">04 / INTER-ENVIRONMENT RELATIONSHIPS</span><h3>Connections</h3></div><span class="hint">EACH EDGE IS A TRANSFORMATION</span></div><div id="edge-list" class="edge-list"></div></div>',
  ' <div class="panel4 metrics"><div class="section-head"><div><span class="micro">05 / LIVE INSPECTION</span><h3>Observe the experiment</h3></div></div><div id="metrics-list"></div></div></section>',
  ' <section class="panel4 g6-theory"><div class="section-head"><div><span class="micro">06 / BARE THEORY · VERSION 1.0</span><h3>Purpose, philosophy and experimental theory</h3></div><span class="hint">HYPOTHESES MUST BE TESTABLE</span></div><div class="g6-theory-body"><p class="g6-purpose">To make the formation of complex system behaviour <strong>observable, experimentally testable and constructible</strong> through algorithmic composition.</p><div class="g6-steps"><span>Bound</span><span>Generate</span><span>Compose</span><span>Observe</span><span>Intervene</span><span>Discover</span></div><details><summary>Show philosophical assumptions and hypotheses</summary><p>Space defines possibility; algorithms generate patterns; relationships execute transformations; composition may produce properties not evident in isolation; knowledge requires controlled intervention. These claims form the proposed Bounded Algorithmic Relational Emergence (BARE) framework, not a new established scientific law.</p><p><strong>H1:</strong> connections change trajectories. <strong>H2:</strong> connections may change spatial organisation. <strong>H3:</strong> some effects persist. <strong>H4:</strong> relationship topology and strength change results. Trajectory divergence alone never proves emergence.</p></details></div></section>',
  ' <section class="panel4 g6-experiment"><div class="section-head"><div><span class="micro">07 / G6 INTERVENTION ENGINE</span><h3>Connected system vs controlled ablation</h3></div><span class="hint">MATCHED INITIAL STATE · DETERMINISTIC RUNS</span></div><div class="g6-body"><p>Run two independent copies of this network from the same current states. The control selectively removes relationships while every existing algorithm continues executing. Your working simulation remains unchanged.</p><div class="g6-controls"><label>Remove relationships in control<select id="g6-ablation"><option value="all">All connections</option><option value="internal">Internal connections only</option><option value="external">External connections only</option></select></label><label>Experiment horizon<select id="g6-horizon"><option value="10">10 ticks</option><option value="24" selected>24 ticks</option><option value="48">48 ticks</option><option value="80">80 ticks</option></select></label><button id="g6-run" class="g6-primary" type="button">▶ Run controlled experiment</button><button id="g6-export" type="button" disabled>↓ Export evidence JSON</button></div><div class="g6-output"><div id="g6-plot" class="g6-plot"><div class="g6-empty">No experiment yet. Add algorithms and connections, then run a controlled comparison.</div></div><div id="g6-observations" class="g6-measures"><p class="g6-empty">The experiment will report spatial divergence, structural differences, persistence and a cautious interpretation.</p></div></div><p class="g6-disclaimer">A measured interaction is evidence of causal sensitivity under this intervention, not automatically evidence of weak or strong emergence. The structural metric is spatial neighbour gradient; the relational metric is within-environment pattern coactivation.</p></div></section>',
  ' <section class="method4"><span class="micro">G6 / ACCEPTANCE GATE</span><p>Define a hypothesis → create independently running algorithms → introduce internal or external relationships → compare connected and ablated runs from identical states → inspect spatial divergence, structural differences and persistence → export evidence. Treat emergence as a candidate interpretation requiring stronger controls.</p></section>',
  ' <footer>ÀTÚNBÍ · the environment is empty until an algorithm generates a pattern <a href="https://github.com/ailopin8/atunbi-binary-system-compiler">Source on GitHub</a></footer>',
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
    +'<div class="g-node-head" tabindex="0" role="group" aria-label="Environment '+n.id+' position. Arrow keys move; Shift moves farther." data-drag="'+n.id+'"><span class="environment-label">ENV '+n.id+' · 10³ EMPTY SPACE</span><button class="remove-node" type="button" data-action="delete" data-id="'+n.id+'" aria-label="Remove environment '+n.id+'">×</button></div>'
    +'<div class="g-node-body"><div class="node-core"><span class="node-glyph">'+(assigned?'✳':'◇')+'</span><div><strong>'+(assigned?meta[n.algorithm].label:'Empty environment')+'</strong><small>'+ (assigned?'ALGORITHM GENERATING PATTERN':'NO ALGORITHM · NO CONTENT') +'</small></div></div>'
    +'<label class="choose">Primary algorithm<select data-algo="'+n.id+'" aria-label="Algorithm for environment '+n.id+'">'+algoOptions(n.layers[0]?.algorithm ?? 'empty')+'</select></label>'
    +'<p class="algo-note">'+n.layers.length+' independent algorithm(s) in this environment · '+n.innerLinks.length+' internal relationship(s)</p>'
    +'<button class="inspect-node" data-action="inspect" data-id="'+n.id+'" type="button">◎ Edit internal algorithms</button>'
    +'<div class="node-ports"><button type="button" data-action="target" data-id="'+n.id+'" class="port-button" aria-label="Input: connect pattern to environment '+n.id+'"><i class="port in"></i>Input</button>'
    +'<button type="button" data-action="source" data-id="'+n.id+'" class="port-button'+(pendingSource===n.id?' armed':'')+'" aria-label="Connect from pattern of environment '+n.id+'">Pattern<i class="port out"></i></button></div>'
    +'<div class="node-measure"><span>EXPOSED PATTERN</span><strong id="node-mean-'+n.id+'">'+mean(n.state).toFixed(3)+'</strong><span>INPUT IMPACT</span><strong id="node-impact-'+n.id+'">'+n.influence.toFixed(4)+'</strong></div>'
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
    const target=nodes.find(n=>n.id===e.to);
    const choices=target?.layers.map(layer=>'<option value="'+layer.id+'"'+
      (layer.id===e.targetLayerId?' selected':'')+'>A'+layer.id+' · '+
      meta[layer.algorithm].label+'</option>').join('') ?? '';
    return '<div class="edge-card" data-edge="'+e.id+'"><div class="edge-title"><span class="edge-index">E'+e.id+'</span><strong>ENV '+e.from+' EXPOSED PATTERN → ENV '+e.to+' ALGORITHM</strong><button type="button" data-edge-action="delete" data-id="'+e.id+'">Remove</button></div>'
      +'<div class="edge-settings"><label>Destination algorithm<select data-target-layer="'+e.id+'">'+choices+'</select></label>'
      +'<label>Transformation<select data-edge-mode="'+e.id+'"><option value="excite"'+(e.mode==='excite'?' selected':'')+'>Excite (+)</option><option value="inhibit"'+(e.mode==='inhibit'?' selected':'')+'>Inhibit (−)</option></select></label>'
      +'<label>Strength<input data-edge-strength="'+e.id+'" type="range" min="0" max="1" step=".05" value="'+e.strength+'" /></label><output id="edge-strength-'+e.id+'">'+e.strength.toFixed(2)+'</output>'
      +'<label><input type="checkbox" data-edge-enabled="'+e.id+'" '+(e.enabled?'checked':'')+' /> Active</label></div></div>';
  }).join(''):'<div class="placeholder">No external relationships. Select <strong>Pattern</strong> in one environment, then <strong>Input</strong> in another.</div>';
}
function internalPanel(): void {
  const el=document.querySelector<HTMLElement>('#layers-body');
  if (!el) return;
  const n=nodes.find(n=>n.id===activeId);
  if (!n) {
    el.innerHTML='<p class="placeholder">Select or create an environment to edit its internal algorithm graph. The workspace starts empty.</p>';
    return;
  }
  const options=(Object.keys(meta) as Algorithm[]).filter((key): key is ActiveAlgorithm => key !== 'empty')
    .map(key=>'<option value="'+key+'">'+meta[key].label+'</option>').join('');
  const sourceOptions=n.layers.map(layer=>'<option value="'+layer.id+'">A'+layer.id+' · '+meta[layer.algorithm].label+'</option>').join('');
  const receivingOptions=n.layers.map((layer,i)=>'<option value="'+layer.id+'"'+(i===1?' selected':'')+'>A'+layer.id+' · '+meta[layer.algorithm].label+'</option>').join('');
  el.innerHTML='<div class="inner-summary"><span>ENVIRONMENT '+n.id+' · 10³ coordinate cells</span><strong>'+n.layers.length+' / '+MAX_LAYERS+' algorithms</strong></div>'
    +'<p class="inner-help">These are algorithms operating inside the same empty space. Each owns its own state field; a relationship transforms one pattern into a local input for another.</p>'
    +'<div class="layer-list">'+(n.layers.length?n.layers.map(layer=>
      '<div class="layer-row"><span class="layer-color" style="background:'+meta[layer.algorithm].color+'"></span>'
      +'<div class="layer-name"><strong>A'+layer.id+' · '+meta[layer.algorithm].label+'</strong><small>Own evolving field · mean <span id="layer-avg-'+n.id+'-'+layer.id+'">'+mean(layer.state).toFixed(3)+'</span>'
      +' · influence <span id="layer-impact-'+n.id+'-'+layer.id+'">'+layer.influence.toFixed(4)+'</span></small></div>'
      +'<button type="button" data-delete-layer="'+layer.id+'" title="Remove algorithm">Remove</button></div>'
      ).join(''):'<div class="empty-layers">No algorithms inside this environment. Its space is empty.</div>')+'</div>'
    +'<div class="inner-tools"><label>Install algorithm<select id="add-layer-type">'+options+'</select></label>'
    +'<button id="add-layer-btn" type="button" class="inner-accent">＋ Add algorithm</button></div>'
    +'<div class="pattern-output"><label>Expose pattern output to outer node graph<select id="output-layer"'+(!n.layers.length?' disabled':'')+'>'+
      n.layers.map(layer=>'<option value="'+layer.id+'"'+(layer.id===n.outputLayerId?' selected':'')+'>'+
        'A'+layer.id+' · '+meta[layer.algorithm].label+'</option>').join('')+'</select></label>'
    +'<small>Only the selected internal pattern is transmitted on this environment’s outgoing connections. All internal algorithms continue running.</small></div>'
    +'<div class="internal-edges"><strong>Internal pattern relationships</strong>'
    +(n.innerLinks.length?n.innerLinks.map(edge=>
      '<div class="internal-edge"><span>A'+edge.from+' → A'+edge.to+'</span>'
      +'<select aria-label="Internal transformation '+edge.id+'" data-inner-mode="'+edge.id+'"><option value="excite"'+(edge.mode==='excite'?' selected':'')+'>Excite</option><option value="inhibit"'+(edge.mode==='inhibit'?' selected':'')+'>Inhibit</option></select>'
      +'<label>Strength<input aria-label="Internal strength '+edge.id+'" type="range" min="0" max="1" step=".05" value="'+edge.strength+'" data-inner-strength="'+edge.id+'" /></label>'
      +'<label><input type="checkbox" data-inner-enabled="'+edge.id+'" '+(edge.enabled?'checked':'')+' /> Active</label>'
      +'<button data-remove-inner="'+edge.id+'" type="button">×</button></div>'
    ).join(''):'<p class="empty-layers">No internal connections yet.</p>')+'</div>'
    +'<div class="inner-new-link"><label>Pattern source<select id="inner-from"'+(n.layers.length<2?' disabled':'')+'>'+sourceOptions+'</select></label>'
    +'<label>Receiving algorithm<select id="inner-to"'+(n.layers.length<2?' disabled':'')+'>'+receivingOptions+'</select></label>'
    +'<button id="inner-connect" type="button"'+(n.layers.length<2?' disabled':'')+'>Connect internal patterns</button></div>';
}
function render_g6(): void {
  const tickLabel=document.querySelector<HTMLElement>('#tick-label');
  if (tickLabel) tickLabel.textContent='TICK '+String(tick).padStart(4,'0');
  const nc=document.querySelector<HTMLElement>('#node-count');if (nc) nc.textContent=String(nodes.length);
  const ec=document.querySelector<HTMLElement>('#edge-count');if (ec) ec.textContent=String(edges.length);
  for (const n of nodes) for (const layer of n.layers) {
    const avg=document.querySelector<HTMLElement>('#layer-avg-'+n.id+'-'+layer.id);
    const impact=document.querySelector<HTMLElement>('#layer-impact-'+n.id+'-'+layer.id);
    if (avg) avg.textContent=mean(layer.state).toFixed(3);
    if (impact) impact.textContent=layer.influence.toFixed(4);
  }
  const status=document.querySelector<HTMLElement>('#view-label');
  if (status) status.textContent=nodes.length===0?'EMPTY WORKSPACE':nodes.reduce((sum,n)=>sum+n.layers.length,0)+' ALGORITHMS / '+nodes.length+' ENVIRONMENTS';
  for (const n of nodes) {
    const avg=document.querySelector<HTMLElement>('#node-mean-'+n.id);
    const effect=document.querySelector<HTMLElement>('#node-impact-'+n.id);
    if (avg) avg.textContent=mean(n.state).toFixed(3);
    if (effect) effect.textContent=n.influence.toFixed(4);
  }
  const metrics=document.querySelector<HTMLElement>('#metrics-list');
  if (metrics) metrics.innerHTML=nodes.length?nodes.map(n=>'<div class="metric-line"><span class="metric-dot" style="background:'+meta[n.algorithm].color+'"></span><span>Env '+n.id+' · '+n.layers.length+' algorithms</span><span>output mean '+mean(n.state).toFixed(3)+'</span><strong>impact '+n.influence.toFixed(4)+'</strong></div>').join(''):'<p class="placeholder">No algorithms or patterns to inspect. Create an environment first.</p>';
  paintVolume();
}
function redraw(): void {
  graphRender();
  edgeRender();
  internalPanel();
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
    if (!n.layers.length) return;
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
    if (!mesh || !n.layers.length) continue;
    const layerColors=n.layers.map(layer=>new THREE.Color(meta[layer.algorithm].color));
    for (let z=0;z<N;z++) for (let y=0;y<N;y++) for (let x=0;x<N;x++) {
      const i=at(x,y,z);
      let sum=0,max=0,r=0,g=0,b=0;
      for (let k=0;k<n.layers.length;k++) {
        const v=n.layers[k].state[i];
        if (v<0.03) continue;
        const brightness=Math.pow(v,1.3);
        sum+=brightness;max=Math.max(max,v);
        r+=layerColors[k].r*brightness;
        g+=layerColors[k].g*brightness;
        b+=layerColors[k].b*brightness;
      }
      matrixDummy.position.set(groupX+(x-4.5)*.117,groupY+(y-4.5)*.117,(z-4.5)*.117);
      matrixDummy.scale.setScalar(max>.16?.24+.89*max:0.000001);
      matrixDummy.updateMatrix();
      mesh.setMatrixAt(i,matrixDummy.matrix);
      if (sum>0) colorCache.setRGB(r/sum,g/sum,b/sum).multiplyScalar(.3+.7*max);
      else colorCache.setRGB(0,0,0);
      mesh.setColorAt(i,colorCache);
    }
    mesh.instanceMatrix.needsUpdate=true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
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
  if(el.dataset.action==='inspect'){activeId=id;graphRender();internalPanel();notice('Editing algorithms inside environment '+id+'.');return;}
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
  const algo=t.value as Algorithm;
  if (!(algo in meta)) return;
  const first=n.layers[0];
  if (algo === 'empty') {
    if(first)deleteLayer(n,first.id);
    else notice('The environment is already empty.');
    return;
  }
  if (first) {
    first.algorithm=algo;
    first.state=seed(algo,n.id*17+first.id);
    first.influence=0;
  } else addLayer(n,algo);
  syncSandbox(n);
  activeId=n.id;
  redraw();
  notice('Primary algorithm '+meta[algo].label+' assigned to environment '+n.id+'.');
});
interface Drag { id:number; sx:number;sy:number;x:number;y:number }
let drag: Drag|null=null;
board.addEventListener('keydown', event => {
  const header = event.target as HTMLElement;
  if (!header.matches('[data-drag]') || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const n = nodes.find(node => node.id === Number(header.dataset.drag));
  if (!n) return;
  const amount = event.shiftKey ? 40 : 10;
  if (event.key === 'ArrowLeft') n.x -= amount;
  if (event.key === 'ArrowRight') n.x += amount;
  if (event.key === 'ArrowUp') n.y -= amount;
  if (event.key === 'ArrowDown') n.y += amount;
  n.x = Math.max(10,Math.min(836,n.x)); n.y = Math.max(10,Math.min(375,n.y));
  const article = header.closest<HTMLElement>('[data-node]');
  if (article) {article.style.left=n.x+'px'; article.style.top=n.y+'px';}
  drawEdges(); notice('Environment '+n.id+' moved to '+n.x+', '+n.y+'. Simulation state unchanged.');
});
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
  const target=t.getAttribute('data-target-layer');
  const e=edges.find(e=>e.id===Number(mode??enabled??target));
  if(!e)return;
  if(target!==null){
    const chosen=Number(t.value);
    if(nodes.find(n=>n.id===e.to)?.layers.some(l=>l.id===chosen))e.targetLayerId=chosen;
  }
  if(mode!==null)e.mode=t.value as Mode;
  if(enabled!==null)e.enabled=(t as HTMLInputElement).checked;
  drawEdges();
  notice('Relationship settings updated.');
});
const internalRoot=document.querySelector<HTMLElement>('#layers-body')!;
internalRoot.addEventListener('click',event=>{
  const target=event.target as HTMLElement;
  const n=nodes.find(n=>n.id===activeId);
  if(!n)return;
  const add=target.closest('#add-layer-btn');
  const remove=target.closest<HTMLElement>('[data-delete-layer]');
  const removeLink=target.closest<HTMLElement>('[data-remove-inner]');
  if(add){
    const select=internalRoot.querySelector<HTMLSelectElement>('#add-layer-type');
    if(!select)return;
    const type=select.value as ActiveAlgorithm;
    if(!Object.prototype.hasOwnProperty.call(meta,type)||String(type)==='empty')return;
    if(addLayer(n,type)){redraw();notice('Another independently evolving '+meta[type].label+' algorithm was added to environment '+n.id+'.');}
    return;
  }
  if(remove){deleteLayer(n,Number(remove.dataset.deleteLayer));return;}
  if(removeLink){
    n.innerLinks=n.innerLinks.filter(e=>e.id!==Number(removeLink.dataset.removeInner));
    redraw();
    notice('Internal relationship removed. Both algorithms continue to evolve.');
    return;
  }
  if(target.closest('#inner-connect')){
    const from=Number(internalRoot.querySelector<HTMLSelectElement>('#inner-from')?.value);
    const to=Number(internalRoot.querySelector<HTMLSelectElement>('#inner-to')?.value);
    addInternalLink(n,from,to);
  }
});
internalRoot.addEventListener('change',event=>{
  const target=event.target as HTMLSelectElement|HTMLInputElement;
  const n=nodes.find(n=>n.id===activeId);if(!n)return;
  if(target.id==='output-layer'){
    const layerId=Number(target.value);
    if(n.layers.some(l=>l.id===layerId)){
      n.outputLayerId=layerId;syncSandbox(n);graphRender();refreshDynamic();
      notice('Externally exposed pattern changed. Internal algorithms continue running.');
    }
    return;
  }
  const mode=target.getAttribute('data-inner-mode'), enabled=target.getAttribute('data-inner-enabled');
  const key=mode??enabled;
  if(key===null)return;
  const edge=n.innerLinks.find(e=>e.id===Number(key));if(!edge)return;
  if(mode!==null)edge.mode=target.value as Mode;
  if(enabled!==null)edge.enabled=(target as HTMLInputElement).checked;
});
internalRoot.addEventListener('input',event=>{
  const target=event.target as HTMLInputElement;
  const key=target.getAttribute('data-inner-strength');
  if(key===null)return;
  const n=nodes.find(n=>n.id===activeId);
  const edge=n?.innerLinks.find(e=>e.id===Number(key));
  if(edge)edge.strength=Number(target.value);
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
function experimentSnapshot() {
  return {
    worlds: nodes.map(n => ({
      id: n.id, outputLayerId: n.outputLayerId,
      layers: n.layers.map(l => ({ id: l.id, algorithm: l.algorithm, state: l.state.slice() })),
      innerLinks: n.innerLinks.map(edge => ({ ...edge }))
    })),
    externalLinks: edges.map(edge => ({ ...edge }))
  };
}
let lastExperiment: ExperimentResult | null = null;
let lastExperimentSource: ReturnType<typeof experimentSnapshot> | null = null;
let lastExperimentStartTime = 0;
function experimentPlot(data: ExperimentResult): string {
  const width = 620, height = 194, left = 44, right = 14, top = 21, bottom = 30;
  const maxValue = Math.max(0.0001,...data.observations.map(o => o.divergence)) * 1.12;
  const x = (step:number) => left + (step - 1) / Math.max(1,data.horizon - 1) * (width-left-right);
  const y = (value:number) => top + (1 - value/maxValue) * (height-top-bottom);
  const path = data.observations.map((o,i) => (i ? 'L' : 'M') + x(o.step).toFixed(2) + ' ' + y(o.divergence).toFixed(2)).join(' ');
  const lines = [0,.25,.5,.75,1].map(v => '<line x1="'+left+'" y1="'+y(v*maxValue)+'" x2="'+(width-right)+'" y2="'+y(v*maxValue)+'" stroke="#27405a" stroke-dasharray="3 5"/><text x="'+(left-6)+'" y="'+(y(v*maxValue)+3)+'" text-anchor="end" font-size="10" fill="#91a8c5">'+(v*maxValue).toFixed(3)+'</text>').join('');
  return '<div class="g6-plot-title"><strong>Trajectory divergence</strong><span>RMS across all algorithm states · '+data.horizon+' ticks</span></div><svg viewBox="0 0 620 194" role="img" aria-label="Divergence between connected and ablated network trajectories">'+lines+'<path d="'+path+'" fill="none" stroke="#66cfff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="'+left+'" y="187" fill="#9aafc7" font-size="10">Tick 1</text><text x="'+(width-right)+'" y="187" text-anchor="end" fill="#9aafc7" font-size="10">Tick '+data.horizon+'</text></svg>';
}
function renderExperiment(data: ExperimentResult): void {
  const plot=document.querySelector<HTMLElement>('#g6-plot');
  const output=document.querySelector<HTMLElement>('#g6-observations');
  if(plot) plot.innerHTML=experimentPlot(data);
  if(output) output.innerHTML='<div class="g6-readouts">'
    +'<div><span>Final divergence</span><strong>'+data.finalDivergence.toFixed(4)+'</strong></div>'
    +'<div><span>Peak divergence</span><strong>'+data.peakDivergence.toFixed(4)+'</strong></div>'
    +'<div><span>Spatial gradient Δ</span><strong>'+(data.finalGradientDifference>=0?'+':'')+data.finalGradientDifference.toFixed(5)+'</strong></div>'
    +'<div><span>Coactivation Δ</span><strong>'+(data.finalCoactivationDifference>=0?'+':'')+data.finalCoactivationDifference.toFixed(5)+'</strong></div>'
    +'<div><span>Persistent steps</span><strong>'+data.persistentSteps+'</strong></div>'
    +'<div><span>Candidate pattern</span><strong>'+(data.candidateCollectivePattern?'YES · INVESTIGATE':'NOT ESTABLISHED')+'</strong></div></div>'
    +'<p class="g6-conclusion">'+data.interpretation+'</p>';
  const exportButton=document.querySelector<HTMLButtonElement>('#g6-export');
  if(exportButton)exportButton.disabled=false;
}
document.querySelector('#g6-run')?.addEventListener('click',()=>{
  if(!nodes.some(n => n.layers.length)) {notice('Install algorithms before running an experiment.');return;}
  const horizon=Number(document.querySelector<HTMLSelectElement>('#g6-horizon')?.value??24);
  const ablation=(document.querySelector<HTMLSelectElement>('#g6-ablation')?.value??'all') as Ablation;
  try {
    const snapshot=experimentSnapshot();
    const result=runAblationExperiment(snapshot,(layer,input,time)=>evolve({id:layer.id,algorithm:layer.algorithm,state:layer.state,influence:0},input,time),horizon,ablation,tick);
    lastExperiment=result;
    lastExperimentSource=snapshot;
    lastExperimentStartTime=tick;
    renderExperiment(result);
    notice('Controlled experiment finished. The live simulation was not modified.');
  }catch(e){notice('Experiment could not run: '+(e instanceof Error?e.message:'Unknown failure'));}
});
document.querySelector('#g6-export')?.addEventListener('click',()=>{
  if(!lastExperiment||!lastExperimentSource)return;
  const report={
    format:'atunbi.g6.ablation.v1',
    name:'Bounded Algorithmic Relational Emergence intervention experiment',
    purpose:'Quantify the influence of algorithmic pattern relationships under matched starting conditions.',
    theory:'BARE v1.0 (proposed, not scientifically validated)',
    initialTick:lastExperimentStartTime,
    environmentSize:[N,N,N],
    hypothesis:['H1 relational influence','H2 structural differentiation','H3 persistence','H4 configuration dependence'],
    baseline:'Identical initial states, selected relationships disabled in control',
    initialNetwork:{
      worlds:lastExperimentSource.worlds.map(n=>({id:n.id,outputLayerId:n.outputLayerId,layers:n.layers.map(l=>({id:l.id,algorithm:l.algorithm,state:Array.from(l.state)})),innerLinks:n.innerLinks})),
      externalLinks:lastExperimentSource.externalLinks
    },
    result:lastExperiment
  };
  if(!sendEvidence('g6','atunbi-g6-evidence.json',report))return;
  notice('G6 evidence JSON exported with the starting network and complete paired trajectory measurements.');
});
registerView('g6',render_g6);
function refreshDynamic() {publishState('g6',{tick,environments:nodes.length,algorithms:nodes.reduce((sum,n)=>sum+n.layers.length,0)});}
redraw();resize();
notice('Workspace ready. Start with an empty environment; nothing runs until an algorithm is assigned.');
const updateSpatialControls = installSpatialControls({
  renderer, scene, camera, controls, content:volumeGroup,
  clearWorkspace:() => {nodes=[];edges=[];running=false;tick=0;pendingSource=null;activeId=null;redraw();notice('Workspace cleared. No algorithms or patterns exist.');},
  isRunning:() => running,
  toggleRun:() => {document.querySelector<HTMLButtonElement>('#run-btn')?.click();},
  getSummary:() => 'G6 '+(running?'running':'paused')+' at tick '+tick+'. '+nodes.length+' environments, '+edges.length+' external relationships. '+nodes.map(n=>'Environment '+n.id+': '+n.layers.length+' algorithms, output mean '+mean(n.state).toFixed(3)+', input impact '+n.influence.toFixed(4)+'.').join(' '),
  pause:() => {running=false; const button=document.querySelector<HTMLElement>('#run-btn'); if(button)button.textContent='▶ Run';},
  step:() => {document.querySelector<HTMLButtonElement>('#step-btn')?.click();}
});
renderer.setAnimationLoop((now:number)=>{
  if(running && now-lastStep>=1000/clockHz){
    const count=Math.min(3,Math.floor((now-lastStep)*clockHz/1000));
    for(let i=0;i<count;i++)step();
    lastStep=now;
  }
  if (!renderer.xr.isPresenting) controls.update();
  updateSpatialControls(now);
  renderer.render(scene,camera);
});
