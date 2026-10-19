import {registerView, publishState, sendEvidence} from './flow/site';
import './g7.css';

type Opcode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type Word = { word: number; line: number; label: string };
type UnitSpec = {
  id: number; name: string; position: [number, number, number];
  energy: number; bias: number; purpose: string; code: Word[];
};
type Program = { units: UnitSpec[]; source: string; warnings: string[] };
type Packet = { tick: number; word: number; from: number; to: number };
type UnitState = UnitSpec & {
  at: [number, number, number]; e: number; b: number;
  model: number; error: number; last: number; phase: number;
  oscillator: number; gain: number; target: number;
  inbox: number[]; path: number[][]; received: number;
};
const MAX_CODE = 32;
const DICTIONARY: Record<number, string> = {
  1:'RECEIVE', 2:'MOVE', 3:'SEND', 4:'OSCILLATE', 5:'ADAPT',
  6:'RESTORE', 7:'TARGET', 8:'SEEK', 9:'OBSERVE', 10:'OUTPUT_GAIN'
};
const PRESETS = {
  feedback: [
    'SYSTEM A AT (1,3,1) ENERGY 180 BIAS 0.20 PURPOSE "Generate an adaptive pulse"',
    'SYSTEM B AT (8,5,8) ENERGY 120 BIAS -0.20 PURPOSE "Predict incoming signals"',
    'A RECEIVES FROM B WITH GAIN 0.75',
    'A MOVES ALONG X AUTOMATICALLY',
    'A OSCILLATES AT RATE 0.36',
    'A ADAPTS MODEL AT RATE 0.20',
    'A RESTORES ENERGY TO 160',
    'A SENDS TYPE 1 TO B',
    'B RECEIVES FROM A WITH GAIN 0.90',
    'B MOVES ALONG Z AUTOMATICALLY',
    'B OSCILLATES AT RATE 0.21',
    'B ADAPTS MODEL AT RATE 0.35',
    'B RESTORES ENERGY TO 128',
    'B SENDS TYPE 3 TO A'
  ].join('\n'),
  seek: [
    'SYSTEM A AT (1,1,1) ENERGY 220 BIAS 0.10 PURPOSE "Seek a spatial target"',
    'SYSTEM B AT (8,8,8) ENERGY 100 BIAS -0.10 PURPOSE "Regulate received input"',
    'A OSCILLATES AT RATE 0.45',
    'A SEEKS CELL (7,7,7)',
    'A SETS OUTPUT GAIN TO 1.80',
    'A SENDS TYPE 1 TO B',
    'B RECEIVES FROM A WITH GAIN 1.25',
    'B ADAPTS MODEL AT RATE 0.60',
    'B RESTORES ENERGY TO 128 WITH STRENGTH FAST',
    'B OBSERVES CELL (8,8,8)',
    'B SENDS TYPE 2 TO A',
    'A RECEIVES FROM B WITH GAIN 0.50'
  ].join('\n')
};
const bound = (v: number, l: number, h: number) => Math.max(l, Math.min(h, v));
const bits = (n: number, width: number) => (n >>> 0).toString(2).padStart(width, '0');
const cell = (p: number[]) => 100 * p[2] + 10 * p[1] + p[0];
const coords = (n: number): [number,number,number] => [n % 10, Math.floor(n / 10) % 10, Math.floor(n / 100)];
const num = (s: string) => Number(s);
const q = (v: number, scale: number) => bound(Math.round(v * scale), 0, 255);
const nameId = (s: string) => ({ A:1, B:2 } as Record<string, number>)[s] || 0;
function encode(op: number, addr = 0, arg = 0, flags = 0): number {
  if (![op,addr,arg,flags].every(Number.isInteger) ||
    op < 0 || op > 15 || addr < 0 || addr >= 1000 ||
    arg < 0 || arg > 255 || flags < 0 || flags > 3) {
    throw Error('Invalid 24-bit instruction field');
  }
  return ((op << 20) | (addr << 10) | (arg << 2) | flags) >>> 0;
}
function decode(w: number) {
  return { op: (w >>> 20) & 15, address: (w >>> 10) & 1023,
    arg: (w >>> 2) & 255, flags: w & 3 };
}
function pack(src: number, dst: number, addr: number, kind: number, data: number, flags: number) {
  if (![src,dst,addr,kind,data,flags].every(Number.isInteger) ||
    src < 0 || src > 15 || dst < 0 || dst > 15 || addr < 0 || addr >= 1000 ||
    kind < 0 || kind > 15 || data < 0 || data > 255 || flags < 0 || flags > 3) {
    throw Error('Invalid 32-bit packet field');
  }
  return ((src << 28) | (dst << 24) | (addr << 14) |
    (kind << 10) | (data << 2) | flags) >>> 0;
}
function unpack(w: number) {
  return { src: (w >>> 28) & 15, dst: (w >>> 24) & 15,
    address: (w >>> 14) & 1023, kind: (w >>> 10) & 15,
    data: (w >>> 2) & 255, flags: w & 3 };
}
function parseSource(source: string): Program {
  const units: UnitSpec[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const statements: { no:number; text:string }[] = [];
  for (const [i, raw] of source.split(/\r?\n/).entries()) {
    const text = raw.trim();
    if (!text || text.startsWith('#')) continue;
    statements.push({ no:i + 1, text });
  }
  for (const entry of statements) {
    if (!entry.text.toUpperCase().startsWith('SYSTEM ')) continue;
    const m = entry.text.match(/^SYSTEM ([AB]) AT \((\d+),(\d+),(\d+)\) ENERGY (\d+) BIAS (-?\d+(?:\.\d+)?) PURPOSE "([^"]{1,120})"$/i);
    if (!m) { errors.push('Line ' + entry.no + ': invalid SYSTEM declaration'); continue; }
    const name = m[1].toUpperCase();
    const p = [num(m[2]),num(m[3]),num(m[4])] as [number,number,number];
    const energy = num(m[5]);
    const bias = num(m[6]);
    if (units.some(u => u.name === name) || p.some(v => v < 0 || v > 9) ||
      energy > 255 || !Number.isFinite(bias) || Math.abs(bias) > 1) {
      errors.push('Line ' + entry.no + ': duplicate or out-of-range system declaration');
      continue;
    }
    units.push({ id:nameId(name), name, position:p, energy, bias, purpose:m[7], code:[] });
  }
  if (!units.length) errors.push('Declare at least one SYSTEM before compiling.');
  if (units.length > 2) errors.push('G7 currently supports at most two sandbox processors.');
  for (const entry of statements) {
    if (entry.text.toUpperCase().startsWith('SYSTEM ')) continue;
    const match = entry.text.match(/^([AB]) (.*)$/i);
    if (!match) { errors.push('Line ' + entry.no + ': expected A or B at start'); continue; }
    const who = units.find(u => u.name === match[1].toUpperCase());
    if (!who) { errors.push('Line ' + entry.no + ': undeclared system ' + match[1].toUpperCase()); continue; }
    const t = match[2].toUpperCase();
    let m: RegExpMatchArray | null;
    const add = (op: Opcode, addr: number, arg: number, flags: number, label: string) => {
      who.code.push({ word:encode(op,addr,arg,flags), line:entry.no, label });
    };
    if ((m = t.match(/^RECEIVES FROM ([AB]) WITH GAIN (\d+(?:\.\d+)?)$/))) {
      const gain = num(m[2]);
      if (gain > 1.992) errors.push('Line ' + entry.no + ': gain must be between 0 and 1.992');
      else if (!units.some(u => u.name === m![1])) errors.push('Line ' + entry.no + ': source is not declared');
      else add(1,0,q(gain,128),nameId(m[1]),'RECEIVE from ' + m[1]);
    } else if ((m = t.match(/^MOVES ALONG ([XYZ]) (AUTOMATICALLY|POSITIVE|NEGATIVE)$/))) {
      add(2,0,'XYZ'.indexOf(m[1]),({ AUTOMATICALLY:0,POSITIVE:1,NEGATIVE:2 } as Record<string,number>)[m[2]],'MOVE ' + m[1]);
    } else if ((m = t.match(/^OSCILLATES AT RATE (\d+(?:\.\d+)?)$/))) {
      const rate = num(m[1]);
      if (rate > 2.55) errors.push('Line ' + entry.no + ': frequency cannot exceed 2.55 rad/tick');
      else add(4,0,q(rate,100),0,'OSCILLATE');
    } else if ((m = t.match(/^ADAPTS MODEL AT RATE (\d+(?:\.\d+)?)$/))) {
      const rate = num(m[1]);
      if (rate > 1) errors.push('Line ' + entry.no + ': learning rate cannot exceed 1');
      else add(5,0,q(rate,255),0,'ADAPT MODEL');
    } else if ((m = t.match(/^RESTORES ENERGY TO (\d+)(?: WITH STRENGTH (SLOW|MEDIUM|FAST))?$/))) {
      const target = num(m[1]);
      if (target > 255) errors.push('Line ' + entry.no + ': energy target cannot exceed 255');
      else add(6,0,target,({ SLOW:1,MEDIUM:2,FAST:3 } as Record<string,number>)[m[2] || 'MEDIUM'],'RESTORE ENERGY');
    } else if ((m = t.match(/^SENDS TYPE (\d+) TO ([AB])$/))) {
      const kind = num(m[1]);
      if (kind > 15 || kind < 1) errors.push('Line ' + entry.no + ': message type must be 1..15');
      else if (!units.some(u => u.name === m![2])) errors.push('Line ' + entry.no + ': destination is not declared');
      else {
        add(7,0,nameId(m[2]),0,'TARGET ' + m[2]);
        add(3,0,kind,0,'SEND TYPE ' + kind);
      }
    } else if ((m = t.match(/^SEEKS CELL \((\d+),(\d+),(\d+)\)$/))) {
      const xyz = [num(m[1]),num(m[2]),num(m[3])];
      if (xyz.some(v => v > 9)) errors.push('Line ' + entry.no + ': address must fit the 10×10×10 space');
      else add(8,cell(xyz),1,0,'SEEK CELL');
    } else if ((m = t.match(/^OBSERVES CELL \((\d+),(\d+),(\d+)\)$/))) {
      const xyz = [num(m[1]),num(m[2]),num(m[3])];
      if (xyz.some(v => v > 9)) errors.push('Line ' + entry.no + ': address must fit the 10×10×10 space');
      else add(9,cell(xyz),0,0,'OBSERVE CELL');
    } else if ((m = t.match(/^SETS OUTPUT GAIN TO (\d+(?:\.\d+)?)$/))) {
      const gain = num(m[1]);
      if (gain > 1.992) errors.push('Line ' + entry.no + ': output gain must not exceed 1.992');
      else add(10,0,q(gain,128),0,'OUTPUT GAIN');
    } else {
      errors.push('Line ' + entry.no + ': unsupported sentence. Use the documented grammar.');
    }
    if (who.code.length > MAX_CODE) errors.push('System ' + who.name + ' exceeds 32 machine instructions.');
  }
  for (const u of units) {
    if (u.code.length === 0) warnings.push('System ' + u.name + ' has no executable instructions.');
    if (!u.code.some(x => decode(x.word).op === 3)) warnings.push('System ' + u.name + ' sends no messages.');
  }
  if (errors.length) throw Error(errors.join('\n'));
  return { units:units.sort((a,b) => a.id - b.id), source, warnings };
}
class BinaryMachine {
  program: Program;
  units: UnitState[];
  tick = 0;
  pending: number[] = [];
  trace: Packet[] = [];
  coupling: number;
  totalPackets = 0;
  constructor(program: Program, coupling = 0.75) {
    this.program = program;
    this.coupling = coupling;
    this.units = program.units.map(u => ({
      ...u, at:[...u.position], e:u.energy, b:u.bias, model:0,
      error:0,last:0,phase:0,oscillator:0,gain:1,target:0,
      inbox:[],path:[[...u.position]],received:0
    }));
  }
  step() {
    this.tick++;
    const delivering = this.pending;
    this.pending = [];
    for (const word of delivering) {
      const p = unpack(word);
      const target = this.units.find(u => u.id === p.dst);
      if (target) target.inbox.push(word);
    }
    for (const u of this.units) {
      for (const item of u.code) {
        const d = decode(item.word);
        switch (d.op) {
          case 1: {
            const keep: number[] = [];
            for (const word of u.inbox) {
              const packet = unpack(word);
              if (d.flags !== 0 && d.flags !== packet.src) { keep.push(word); continue; }
              const sign = packet.kind === 2 ? -1 : 1;
              const measurement = sign * (packet.data - 128) / 127;
              const effect = measurement * (d.arg / 128) * this.coupling;
              u.last = bound(effect,-2,2);
              u.b = bound(u.b * 0.99 + effect * 0.12,-1,1);
              u.e = bound(Math.round(u.e + effect * 10),0,255);
              u.received++;
            }
            u.inbox = keep;
            break;
          }
          case 2: {
            const axis = d.arg;
            const direction = d.flags === 1 ? 1 : d.flags === 2 ? -1 :
              (Math.sin(this.tick * 0.30 + u.phase + u.b * 2) > -0.20 ? 1 : -1);
            let next = u.at[axis] + direction;
            if (next > 9) next = 8;
            if (next < 0) next = 1;
            u.at[axis] = next;
            break;
          }
          case 3: {
            const payload = bound(Math.round(128 + (u.oscillator * 86 +
              u.b * 40 + (u.e - 128) * 0.11) * u.gain),0,255);
            if (this.units.some(v => v.id === u.target)) {
              const word = pack(u.id,u.target,cell(u.at),d.arg,payload,u.b >= 0 ? 1 : 0);
              this.pending.push(word);
              this.totalPackets++;
              this.trace.push({ tick:this.tick,word,from:u.id,to:u.target });
              if (this.trace.length > 512) this.trace.shift();
            }
            break;
          }
          case 4:
            u.oscillator = Math.sin(this.tick * (d.arg / 100) + u.phase);
            break;
          case 5: {
            const residual = u.last - u.model;
            u.error = residual;
            u.model = bound(u.model + (d.arg / 255) * residual,-2,2);
            break;
          }
          case 6: {
            const rate = d.flags === 1 ? 0.05 : d.flags === 3 ? 0.35 : 0.15;
            u.e = bound(Math.round(u.e + (d.arg - u.e) * rate),0,255);
            break;
          }
          case 7:
            u.target = d.arg;
            break;
          case 8: {
            const dest = coords(d.address);
            for (let axis = 0; axis < 3; axis++) {
              if (u.at[axis] !== dest[axis]) {
                u.at[axis] += Math.sign(dest[axis] - u.at[axis]);
                break;
              }
            }
            break;
          }
          case 9:
            u.last = u.at.every((c,i) => c === coords(d.address)[i]) ? 1 : 0;
            break;
          case 10:
            u.gain = d.arg / 128;
            break;
        }
      }
      u.phase += u.b * 0.012;
      u.path.push([...u.at]);
      if (u.path.length > 100) u.path.shift();
    }
  }
  run(n: number) { for (let i = 0; i < n; i++) this.step(); }
}
function paired(program: Program, n = 60) {
  const connected = new BinaryMachine(program,0.75);
  const control = new BinaryMachine(program,0);
  connected.run(n); control.run(n);
  const perUnit = connected.units.map((u,i) => {
    const b = control.units[i];
    return { name:u.name, biasDelta:Math.abs(u.b - b.b),
      modelDelta:Math.abs(u.model - b.model),
      energyDelta:Math.abs(u.e - b.e),
      positionDelta:Math.hypot(...u.at.map((v,k) => v - b.at[k])) };
  });
  return { ticks:n, connectedPackets:connected.totalPackets,
    couplingOn:0.75,couplingOff:0,perUnit };
}
function checkBinary(): string {
  for (const addr of [0,1,345,999]) {
    const w = encode(8,addr,1,0), d = decode(w);
    if (d.address !== addr || encode(d.op,d.address,d.arg,d.flags) !== w) throw Error('Instruction roundtrip failed');
    const p = pack(1,2,addr,3,200,1), p2 = unpack(p);
    if (p2.src !== 1 || p2.dst !== 2 || p2.address !== addr ||
      p2.data !== 200 || p2.flags !== 1) throw Error('Packet roundtrip failed');
  }
  const example = parseSource(PRESETS.feedback);
  const network = new BinaryMachine(example);
  network.run(12);
  if (network.tick !== 12 || network.totalPackets < 20 ||
    network.units.some(u => u.at.some(v => v < 0 || v > 9))) throw Error('Virtual machine failed');
  try { parseSource('SYSTEM A AT (10,1,1) ENERGY 128 BIAS 0 PURPOSE "Bad"'); }
  catch { return 'PASS · binary roundtrip, coordinate bounds, execution, validation'; }
  throw Error('Invalid coordinates were accepted');
}
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw Error('Missing G7 element ' + id);
  return found as T;
}
function download(name: string, content: unknown) {sendEvidence('g7',name,content);}
const panel = document.createElement('section');
panel.className = 'g7 panel4';
panel.innerHTML = [
  '<div class="section-head"><div><span class="micro">08 / G7 · BINARY SENTENCE COMPILER</span><h3>System sentences → instructions → observable behaviour</h3></div><span class="hint">DETERMINISTIC VIRTUAL MACHINE · 10³ SPACE</span></div>',
  '<div class="g7-content"><p class="g7-lead">Write bounded, machine-readable system sentences. Compile them into verified 24-bit instructions, then observe the resulting algorithms and their 32-bit messages. This is a separate experimental runtime; it does not overwrite your G6 node network.</p>',
  '<div class="g7-editor"><div class="g7-author"><div class="g7-bar"><strong>01 / SYSTEM SENTENCES</strong><select id="g7-preset" aria-label="Example program"><option value="feedback">Adaptive feedback</option><option value="seek">Spatial seeking</option></select></div>',
  '<textarea id="g7-source" spellcheck="false" aria-label="System sentence source"></textarea>',
  '<div class="g7-actions"><button id="g7-compile" class="g7-primary">⚙ Compile & load</button><button id="g7-help">Grammar reference</button><span id="g7-diagnostics" role="status"></span></div>',
  '<details id="g7-grammar"><summary>Supported system sentence forms</summary><pre>SYSTEM A AT (1,3,1) ENERGY 180 BIAS 0.20 PURPOSE "..."',
  'A RECEIVES FROM B WITH GAIN 0.75',
  'A MOVES ALONG X AUTOMATICALLY',
  'A OSCILLATES AT RATE 0.36',
  'A ADAPTS MODEL AT RATE 0.20',
  'A RESTORES ENERGY TO 160 WITH STRENGTH FAST',
  'A SENDS TYPE 1 TO B',
  'A SEEKS CELL (7,7,7)',
  'A OBSERVES CELL (5,4,3)',
  'A SETS OUTPUT GAIN TO 1.80</pre><p>Range restrictions: positions 0..9; energy 0..255; bias -1..1; receive and output gain 0..1.992; learning rate 0..1. Invalid or unknown sentences never execute.</p></details></div>',
  '<div class="g7-code"><div class="g7-bar"><strong>02 / 24-BIT PROGRAMS</strong><span id="g7-codelen">No program</span></div><div id="g7-assembly" class="g7-assembly"><p>Compile to inspect real encoded instructions and their source lines.</p></div></div></div>',
  '<div class="g7-transport"><div class="g7-buttons"><button id="g7-run" disabled>▶ Run</button><button id="g7-step" disabled>Step +1</button><button id="g7-reset" disabled>↻ Reset</button><button id="g7-paired" disabled>Compare coupling vs zero</button><button id="g7-export" disabled>↓ Export binary evidence</button></div><label>Coupling <input id="g7-coupling" type="range" min="0" max="100" value="75"><output id="g7-coupling-label">75%</output></label><label>Rate <input id="g7-speed" type="range" min="1" max="20" value="6"><output id="g7-speed-label">6/s</output></label></div>',
  '<div class="g7-cubes"><div class="g7-volume"><div class="g7-bar"><strong class="g7-gold">SANDBOX A</strong><span id="g7-state-a">No algorithm</span></div><canvas id="g7-canvas-a"></canvas><div class="g7-unit" id="g7-read-a">Empty coordinate space</div></div><div class="g7-volume"><div class="g7-bar"><strong class="g7-cyan">SANDBOX B</strong><span id="g7-state-b">No algorithm</span></div><canvas id="g7-canvas-b"></canvas><div class="g7-unit" id="g7-read-b">Empty coordinate space</div></div></div>',
  '<div class="g7-bottom"><div class="g7-packet"><div class="g7-bar"><strong>03 / 32-BIT RELATIONSHIP PACKET</strong><span id="g7-tick">TICK 0</span></div><div id="g7-lastpacket" class="g7-bits">No output yet</div><p class="g7-key">SOURCE 4 · DESTINATION 4 · ADDRESS 10 · TYPE 4 · DATA 8 · FLAGS 2</p><div id="g7-log" class="g7-log">Messages arrive on the next tick. The receiving algorithm interprets the data through its own instructions.</div></div><div class="g7-evidence"><div class="g7-bar"><strong>04 / CONTROLLED OBSERVATION</strong></div><div id="g7-control">Compile a program and select “Compare coupling vs zero” to run 60 matched ticks with and without message influence.</div><small id="g7-selftest"></small></div></div>',
  '<p class="g7-foot">10 bits address 1,000 valid positions; 24 unused codes are rejected. Source sentences are a constrained domain-specific language, not unrestricted natural-language understanding. Instruction meaning comes from the VM specification, not from binary bits alone.</p></div>'
].join('\n');
const anchor = document.querySelector('.g6-experiment');
if (anchor) anchor.insertAdjacentElement('afterend',panel);
else document.querySelector('#app')?.appendChild(panel);
const textArea = el<HTMLTextAreaElement>('g7-source');
const preset = el<HTMLSelectElement>('g7-preset');
textArea.value = PRESETS.feedback;
let compiled: Program | null = null;
let vm: BinaryMachine | null = null;
let live = false;
let timer: number | null = null;
let hz = 6;
let cp = 0.75;
let comparison: ReturnType<typeof paired> | null = null;
const setRun = (on: boolean) => {
  live = on;
  el('g7-run').textContent = live ? 'Ⅱ Pause' : '▶ Run';
  if (timer !== null) window.clearInterval(timer);
  timer = live ? window.setInterval(() => { vm?.step(); update(); },1000 / hz) : null;
};
function refreshPrograms() {
  if (!compiled) return;
  const section = el('g7-assembly');
  section.replaceChildren();
  const length = compiled.units.reduce((sum,u) => sum + u.code.length,0);
  el('g7-codelen').textContent = length + ' instructions · ' + (length * 3) + ' bytes';
  for (const u of compiled.units) {
    const heading = document.createElement('h4');
    heading.textContent = 'SANDBOX ' + u.name + ' · ' + u.purpose;
    section.appendChild(heading);
    for (const instruction of u.code) {
      const entry = document.createElement('div');
      entry.className = 'g7-instruction';
      const decodeWord = decode(instruction.word);
      const binary = document.createElement('code');
      binary.textContent = bits(instruction.word,24);
      const label = document.createElement('span');
      label.textContent = 'L' + instruction.line + ' · ' + instruction.label +
        ' (' + DICTIONARY[decodeWord.op] + ')';
      entry.append(binary,label);
      section.appendChild(entry);
    }
  }
}
function project(pos: number[], width: number, height: number) {
  const X = pos[0] - 4.5, Y = pos[1] - 4.5, Z = pos[2] - 4.5;
  const az = -0.7, tilt = 0.43, c = Math.cos(az), s = Math.sin(az);
  const x = X * c - Z * s, d = X * s + Z * c;
  const y = Y * Math.cos(tilt) - d * Math.sin(tilt);
  const scale = Math.min(width,height) * 0.058;
  return [width * 0.5 + x * scale, height * 0.52 - y * scale];
}
const cubeCorners = [[0,0,0],[9,0,0],[9,9,0],[0,9,0],
  [0,0,9],[9,0,9],[9,9,9],[0,9,9]];
const cubeEdges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],
  [6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
function draw(canvas: HTMLCanvasElement, u: UnitState | undefined, color: string) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(rect.width,200), height = Math.max(rect.height,200);
  const dpi = Math.min(window.devicePixelRatio || 1,2);
  canvas.width = Math.round(width * dpi);
  canvas.height = Math.round(height * dpi);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(dpi,dpi);
  context.clearRect(0,0,width,height);
  context.lineWidth = 1;
  context.strokeStyle = '#294360';
  for (const [a,b] of cubeEdges) {
    const p = project(cubeCorners[a],width,height);
    const r = project(cubeCorners[b],width,height);
    context.beginPath();context.moveTo(p[0],p[1]);context.lineTo(r[0],r[1]);context.stroke();
  }
  for (let n = 1; n < 9; n++) {
    for (const pair of [[[n,0,0],[n,0,9]],[[0,0,n],[9,0,n]]]) {
      const p = project(pair[0],width,height);
      const r = project(pair[1],width,height);
      context.strokeStyle = '#1a2a41';
      context.beginPath();context.moveTo(p[0],p[1]);context.lineTo(r[0],r[1]);context.stroke();
    }
  }
  if (!u) return;
  if (u.path.length > 1) for (let i = 1; i < u.path.length; i++) {
    const p = project(u.path[i - 1],width,height);
    const r = project(u.path[i],width,height);
    context.globalAlpha = i / u.path.length * 0.65 + 0.1;
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.beginPath();context.moveTo(p[0],p[1]);context.lineTo(r[0],r[1]);context.stroke();
  }
  context.globalAlpha = 1;
  const p = project(u.at,width,height);
  const glow = context.createRadialGradient(p[0],p[1],1,p[0],p[1],28);
  glow.addColorStop(0,color);glow.addColorStop(1,'rgba(0,0,0,0)');
  context.globalAlpha = 0.3;
  context.fillStyle = glow;
  context.beginPath();context.arc(p[0],p[1],28,0,Math.PI * 2);context.fill();
  context.globalAlpha = 1;
  context.fillStyle = color;
  context.beginPath();context.arc(p[0],p[1],5,0,Math.PI * 2);context.fill();
  context.font = '11px monospace';
  context.fillText('(' + u.at.join(',') + ')',p[0] + 9,p[1] - 10);
}
function render_g7() {
  el('g7-tick').textContent = 'TICK ' + (vm?.tick || 0);
  for (const [label,color] of [['a','#efbc6b'],['b','#58d7e9']]) {
    const u = vm?.units.find(x => x.name.toLowerCase() === label);
    el('g7-state-' + label).textContent = u ? 'ENERGY ' + bits(u.e,8) : 'EMPTY';
    el('g7-read-' + label).textContent = u ?
      'Position (' + u.at.join(',') + ') · bias ' + u.b.toFixed(3) +
      ' · model ' + u.model.toFixed(3) + ' · error ' + u.error.toFixed(3) +
      ' · received ' + u.received : 'Empty coordinate space';
    draw(el<HTMLCanvasElement>('g7-canvas-' + label),u,color);
  }
  if (!vm?.trace.length) {
    el('g7-lastpacket').textContent = 'No output yet';
    el('g7-log').textContent = 'Step the program to emit a 32-bit relationship message.';
    return;
  }
  const last = vm.trace[vm.trace.length - 1];
  const packet = unpack(last.word);
  el('g7-lastpacket').innerHTML =
    '<span class="g7-gold">' + bits(packet.src,4) + '</span> ' +
    '<span class="g7-cyan">' + bits(packet.dst,4) + '</span> ' +
    '<span class="g7-blue">' + bits(packet.address,10) + '</span> ' +
    '<span class="g7-purple">' + bits(packet.kind,4) + '</span> ' +
    '<span class="g7-green">' + bits(packet.data,8) + '</span> ' + bits(packet.flags,2);
  el('g7-log').textContent = vm.trace.slice(-5).reverse().map(p => {
    const item = unpack(p.word);
    return 't' + p.tick + ' · ' + item.src + ' → ' + item.dst +
      ' · type ' + item.kind + ' · data ' + item.data +
      ' · cell ' + item.address;
  }).join('\n');
}
function compile() {
  setRun(false);
  try {
    const next = parseSource(textArea.value);
    const newVm = new BinaryMachine(next,cp);
    compiled = next;
    vm = newVm;
    comparison = null;
    el('g7-control').textContent = 'Ready for controlled observation.';
    el('g7-diagnostics').textContent = '✓ Valid · ' +
      next.units.length + ' sandbox(s)' +
      (next.warnings.length ? ' · ' + next.warnings.join(' ') : '');
    el('g7-diagnostics').className = 'g7-ok';
    for (const id of ['g7-run','g7-step','g7-reset','g7-paired','g7-export'])
      (el(id) as HTMLButtonElement).disabled = false;
    refreshPrograms();update();
  } catch (e) {
    el('g7-diagnostics').textContent = String(e instanceof Error ? e.message : e);
    el('g7-diagnostics').className = 'g7-bad';
    compiled = null;
    vm = null;
    el('g7-codelen').textContent = 'Compilation blocked';
    el('g7-assembly').textContent = 'No program was loaded. Correct the indicated source line.';
    for (const id of ['g7-run','g7-step','g7-reset','g7-paired','g7-export'])
      (el(id) as HTMLButtonElement).disabled = true;
    update();
  }
}
el('g7-compile').addEventListener('click',compile);
el('g7-help').addEventListener('click',() => { el('g7-grammar').setAttribute('open',''); });
preset.addEventListener('change',() => { textArea.value = PRESETS[preset.value as keyof typeof PRESETS]; });
el('g7-run').addEventListener('click',() => setRun(!live));
el('g7-step').addEventListener('click',() => { setRun(false); vm?.step(); update(); });
el('g7-reset').addEventListener('click',() => {
  setRun(false);
  if (compiled) vm = new BinaryMachine(compiled,cp);
  comparison = null;
  el('g7-control').textContent = 'Program reset to its initial state.';
  update();
});
el('g7-paired').addEventListener('click',() => {
  if (!compiled) return;
  comparison = paired(compiled);
  const outcome = comparison;
  el('g7-control').textContent = '60-tick intervention · ' +
    outcome.connectedPackets + ' packets emitted. ' +
    outcome.perUnit.map(u => 'Sandbox ' + u.name +
      ': |Δbias| ' + u.biasDelta.toFixed(4) +
      ', |Δmodel| ' + u.modelDelta.toFixed(4) +
      ', |Δenergy| ' + u.energyDelta.toFixed(1) +
      ', spatial distance ' + u.positionDelta.toFixed(2)
    ).join(' · ') +
    '. Differences indicate sensitivity to coupling, not proof of emergence.';
});
el('g7-export').addEventListener('click',() => {
  if (!compiled || !vm) return;
  download('atunbi-g7-binary-evidence.json',{
    format:'atunbi.binary-sentence-g7/1',
    spatialShape:[10,10,10],
    address:'100*z+10*y+x',
    instructionFields:[['opcode',4],['address',10],['argument',8],['flags',2]],
    packetFields:[['source',4],['destination',4],['address',10],['type',4],['data',8],['flags',2]],
    source:compiled.source,
    programs:compiled.units.map(u => ({ ...u, code:u.code.map(ins =>
      ({ ...ins, binary:bits(ins.word,24), decoded:decode(ins.word) })) })),
    runtime:{ tick:vm.tick,coupling:vm.coupling,totalPackets:vm.totalPackets,
      states:vm.units.map(u => ({ id:u.id,name:u.name,position:u.at,energy:u.e,bias:u.b,
        model:u.model,error:u.error,received:u.received,
        occupancyBinary:Array.from({ length:1000 },(_,i) => cell(u.at) === i ? '1' : '0').join(''),
        trail:u.path
      })),
      packetTrace:vm.trace.map(p => ({ tick:p.tick,binary:bits(p.word,32),
        decoded:unpack(p.word) })) },
    pairedExperiment:comparison
  });
});
el<HTMLInputElement>('g7-coupling').addEventListener('input',event => {
  cp = num((event.target as HTMLInputElement).value) / 100;
  el('g7-coupling-label').textContent = Math.round(cp * 100) + '%';
  if (vm) vm.coupling = cp;
});
el<HTMLInputElement>('g7-speed').addEventListener('input',event => {
  hz = num((event.target as HTMLInputElement).value);
  el('g7-speed-label').textContent = hz + '/s';
  if (live) setRun(true);
});
window.addEventListener('resize',update);
try { el('g7-selftest').textContent = checkBinary(); }
catch (e) { el('g7-selftest').textContent = 'SELF TEST FAILED: ' + String(e); }
registerView('g7',render_g7);
function update() {publishState('g7',{tick:vm?.tick||0,packets:vm?.totalPackets||0});}
update();
(window as unknown as { __ATUNBI_G7: unknown }).__ATUNBI_G7 = {
  parseSource,encode,decode,pack,unpack,paired,
  getState:() => ({
    compiled:!!compiled,tick:vm?.tick || 0,packets:vm?.totalPackets || 0,
    error:el('g7-diagnostics').textContent,
    comparison
  })
};

document.addEventListener('atunbi:pause-all',()=>setRun(false));
