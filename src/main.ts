import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const SIZE = 10;
const COUNT = SIZE * SIZE * SIZE;
const index = (x: number, y: number, z: number) => x + SIZE * (y + SIZE * z);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));
const seeded = (x: number, y: number, z: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
};
type World = {
  a: Float32Array;
  b: Float32Array;
  baseline: Float32Array;
  tick: number;
};
let world: World;
let playing = false;
let connected = true;
let strength = 0.65;
let tickRate = 8;
let lastTick = 0;
let viewportMode: 'both' | 'a' | 'b' = 'both';

function initialWorld(): World {
  const a = new Float32Array(COUNT);
  const b = new Float32Array(COUNT);
  for (let z = 0; z < SIZE; z++)
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const id = index(x, y, z);
        const r2 =
          Math.pow(x - 4.5, 2) + Math.pow(y - 4.5, 2) + Math.pow(z - 4.5, 2);
        a[id] = 0.92 * Math.exp(-r2 / 13) + seeded(x, y, z) * 0.04;
        b[id] = clamp(
          0.035 +
            seeded(z + 17, x + 29, y + 43) * 0.11 +
            Math.exp(-r2 / 8) * 0.43
        );
      }
  return { a, b, baseline: b.slice(), tick: 0 };
}
function neighbors(
  field: Float32Array,
  x: number,
  y: number,
  z: number
): number {
  let sum = 0;
  let count = 0;
  for (const [dx, dy, dz] of [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]) {
    const xx = x + dx,
      yy = y + dy,
      zz = z + dz;
    if (xx >= 0 && xx < SIZE && yy >= 0 && yy < SIZE && zz >= 0 && zz < SIZE) {
      sum += field[index(xx, yy, zz)];
      count += 1;
    }
  }
  return count ? sum / count : field[index(x, y, z)];
}
const mean = (field: Float32Array) =>
  field.reduce((sum, value) => sum + value, 0) / COUNT;
const active = (field: Float32Array) =>
  field.reduce((sum, value) => sum + (value > 0.5 ? 1 : 0), 0) / COUNT;
function step() {
  const nextA = new Float32Array(COUNT);
  const nextB = new Float32Array(COUNT);
  const nextBaseline = new Float32Array(COUNT);
  // A produces a spatial pattern field. Each B cell receives a mapped value
  // from the corresponding A coordinate rather than a global aggregate.
  const patternA = world.a;
  const phase = world.tick * 0.095;
  for (let z = 0; z < SIZE; z++)
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const id = index(x, y, z);
        const oldA = world.a[id];
        const nextToSource =
          Math.pow(x - (4.5 + 2 * Math.sin(phase)), 2) +
          Math.pow(y - (4.5 + 2 * Math.cos(phase * 0.7)), 2) +
          Math.pow(z - 4.5, 2);
        const source =
          Math.exp(-nextToSource / 4) * (0.08 + 0.025 * Math.sin(phase * 2));
        nextA[id] = clamp(
          oldA +
            0.26 * (neighbors(world.a, x, y, z) - oldA) +
            source -
            0.016 * oldA
        );
        const texture =
          0.075 * Math.sin(x * 1.43 + z * 0.73) * Math.cos(y * 0.94);
        const oldB = world.b[id];
        const oldControl = world.baseline[id];
        // B retains its nonlinear activation rule. The relationship
        // modifies its local excitation using A's current pattern.
        const localPatternInput = connected ? strength * patternA[id] : 0;
        const drive =
          0.52 * oldB +
          0.48 * neighbors(world.b, x, y, z) +
          texture -
          0.34 +
          1.1 * localPatternInput;
        const baseDrive =
          0.52 * oldControl +
          0.48 * neighbors(world.baseline, x, y, z) +
          texture -
          0.34;
        nextB[id] = clamp(0.78 * oldB + 0.22 * sigmoid(8 * drive));
        nextBaseline[id] = clamp(
          0.78 * oldControl + 0.22 * sigmoid(8 * baseDrive)
        );
      }
  world = { a: nextA, b: nextB, baseline: nextBaseline, tick: world.tick + 1 };
  refresh();
}

const root = document.getElementById('app');
if (!root) throw new Error('Missing application root');
root.innerHTML = [
  '<div class="shell">',
  ' <header class="topbar">',
  '  <div class="brand"><div class="brand-symbol">◎</div><div><span class="eyebrow">ALGORITHMIC SYSTEMS LABORATORY</span><h1>ÀTÚNBÍ <span class="muted">/ sandbox network</span></h1></div></div>',
  '  <span class="stage-pill">PROTOTYPE · G1–G3</span>',
  ' </header>',
  ' <section class="intro"><div><h2>Connect patterns, not cubes.</h2><p>Each 10 × 10 × 10 environment hosts an evolving algorithmic pattern. A node exposes that pattern as an output, and a relationship changes another sandbox’s existing algorithm.</p></div><div class="cube-count"><strong>2,000</strong><span>SPATIAL STATE CELLS</span></div></section>',
  ' <div class="workbench">',
  '  <section class="panel editor">',
  '   <div class="panelhead"><span class="eyebrow">01 / NODE NETWORK</span><span class="tiny">SYNCHRONOUS CLOCK</span></div>',
  '   <article class="node-card node-a"><div class="node-header"><span class="node-icon">A</span><div><strong>Environment A · diffusion</strong><small>10³ SPACE · PATTERN GENERATOR</small></div><span class="status-dot" title="Active"></span></div><p>Algorithm A evolves a diffusion pattern in its bounded 3D environment.</p><div class="node-footer"><span>Pattern node output</span><code>pattern_A: field[10³]</code><span class="socket socket-out"></span></div></article>',
  '   <div class="connector"><div class="wire"></div><div class="wire-detail"><span class="flow-badge">↓ SPATIAL PATTERN RELATION</span><span class="tiny">A.pattern[x,y,z] → B.excitation[x,y,z]</span></div></div>',
  '   <article class="node-card node-b"><div class="node-header"><span class="node-icon">B</span><div><strong>Environment B · activation</strong><small>10³ SPACE · EXISTING ALGORITHM</small></div><span class="status-dot" title="Active"></span></div><p>Algorithm B already produces its own clusters. Incoming pattern A locally modulates its activation rule.</p><div class="node-footer"><span class="socket socket-in"></span><span>Pattern input</span><code>excitation_B: field[10³]</code></div></article>',
  '   <div class="control-group"><div class="control-label"><label for="coupling">Connection strength</label><output id="strength-value">0.65</output></div><input id="coupling" type="range" min="0" max="1" step="0.05" value="0.65" />',
  '    <label class="toggle-row"><input type="checkbox" id="connected" checked /><span>Enable A → B connection</span><strong id="link-indicator">CONNECTED</strong></label>',
  '   </div>',
  '   <div class="signal-box"><span class="eyebrow">MEAN PATTERN INPUT</span><strong id="edge-value">0.000</strong><small>Average of local A → B inputs. Actual influence varies across all 1,000 cells.</small></div>',
  '  </section>',
  '  <section class="panel viewer">',
  '   <div class="panelhead"><span class="eyebrow">02 / SPATIAL FIELD</span><span class="tiny">INTERACTIVE 3D · WEBXR PREVIEW</span></div>',
  '   <div class="viewport"><canvas id="scene"></canvas><div class="viewport-label label-left"><span class="tag-dot blue"></span>ENV A · PATTERN</div><div class="viewport-label label-right"><span class="tag-dot purple"></span>ENV B · PATTERN</div><div class="viewport-hint">DRAG TO ORBIT · SCROLL TO ZOOM</div></div>',
  '   <div class="viewer-controls"><div class="segmented" aria-label="View selection"><button data-view="both" class="selected" type="button">Both cubes</button><button data-view="a" type="button">A only</button><button data-view="b" type="button">B only</button></div><div id="vr-slot"></div></div>',
  '   <div class="transport"><div class="transport-left"><button type="button" id="play" class="primary-btn">▶ Run</button><button type="button" id="step">Step +1</button><button type="button" id="reset">↻ Reset</button></div><span class="tick-label">TICK <strong id="tick">0000</strong></span></div>',
  '   <p class="viewer-note">Desktop: orbit and inspect. Quest Browser: enter VR when supported. VR controller editing is planned for G7, not yet implemented.</p>',
  '  </section>',
  '  <aside class="panel inspector">',
  '   <div class="panelhead"><span class="eyebrow">03 / INSTRUMENTS</span><span class="tiny">LIVE MEASUREMENTS</span></div>',
  '   <div class="readout"><span>Mean energy in A</span><strong id="a-mean">0.000</strong><div class="meter"><i id="a-meter" class="m-blue"></i></div></div>',
  '   <div class="readout"><span>Activated cells in B</span><strong id="b-active">0.0%</strong><div class="meter"><i id="b-meter" class="m-purple"></i></div></div>',
  '   <div class="readout"><span>Counterfactual difference</span><strong id="delta">0.000</strong><small>Mean B activation minus uncoupled B</small><div class="meter"><i id="delta-meter" class="m-gold"></i></div></div><div class="readout"><span>Spatial pattern divergence</span><strong id="rms">0.0000</strong><small>Root-mean-square difference across B’s 1,000 cells</small></div>',
  '   <div class="observations"><span class="eyebrow">OBSERVATION</span><p id="observation">Initial state. Step forward to observe the connection effect.</p></div>',
  '   <button type="button" id="export" class="export-btn">↓ Export experiment JSON</button>',
  '   <div class="export-note" id="export-note" role="status" aria-live="polite">Exports algorithm identifiers, connection settings and all voxel states.</div>',
  '  </aside>',
  ' </div>',
  ' <section class="panel method"><div class="method-title"><span class="eyebrow">04 / STAGE-GATE DEVELOPMENT</span><h3>What counts as completion?</h3></div>',
  ' <div class="gate-grid"><div class="gate"><span class="gate-num">G0</span><strong>Specification</strong><small>Boundary, purpose, interfaces</small><span class="gate-status completed">DEFINED</span></div>',
  ' <div class="gate"><span class="gate-num">G1</span><strong>Single cube</strong><small>1,000 bounded cells update deterministically</small><span class="gate-status built">IN PROTOTYPE</span></div>',
  ' <div class="gate"><span class="gate-num">G2</span><strong>Independent cubes</strong><small>Two distinct local algorithms</small><span class="gate-status built">IN PROTOTYPE</span></div>',
  ' <div class="gate"><span class="gate-num">G3</span><strong>Typed coupling</strong><small>A’s field modifies the existing B update rule cell by cell</small><span class="gate-status built">IN PROTOTYPE</span></div>',
  ' <div class="gate"><span class="gate-num">G4+</span><strong>Network editor + VR</strong><small>Rewiring, new modules, comparisons, controllers</small><span class="gate-status pending">NOT BUILT</span></div></div>',
  ' <details><summary>View the exact verification procedure</summary><ol><li>Press Step +1. Confirm the tick counter advances and cube A changes.</li><li>Run with the connection enabled. Observe the difference between B and its uncoupled control.</li><li>Disable the connection, press Reset, then step again. The difference must remain zero.</li><li>Export JSON and verify a configuration and 1,000 values per field.</li></ol><p>The environments are bounded spaces, the algorithms evolve patterns within them, and the edge transports a typed pattern field. Spatial change demonstrates causal coupling, not automatic emergence.</p></details>',
  ' </section><footer>ÀTÚNBÍ · modular algorithms, explicit boundaries, observable consequences <span>v0.1 · fixed 10³ voxel resolution</span></footer>',
  '</div>',
].join('');

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#070d1c');
const camera = new THREE.PerspectiveCamera(56, 1, 0.01, 100);
camera.position.set(3.2, 2.75, 4.8);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.32, -0.6);
controls.enableDamping = true;
controls.update();
scene.add(new THREE.AmbientLight(0xffffff, 1.0));
const grid = new THREE.GridHelper(7, 20, 0x243353, 0x151e34);
grid.position.set(0, 0.55, -0.7);
scene.add(grid);
const boxOutline = new THREE.BoxGeometry(1.28, 1.28, 1.28);
const outlineMaterialA = new THREE.LineBasicMaterial({
  color: 0x31609c,
  transparent: true,
  opacity: 0.5,
});
const outlineMaterialB = new THREE.LineBasicMaterial({
  color: 0x7341a6,
  transparent: true,
  opacity: 0.5,
});
const voxelGeo = new THREE.BoxGeometry(0.083, 0.083, 0.083);
const voxelMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.92,
});
function makeField(posX: number, outlineMat: THREE.LineBasicMaterial) {
  const mesh = new THREE.InstancedMesh(voxelGeo, voxelMaterial.clone(), COUNT);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const dummy = new THREE.Object3D();
  for (let z = 0; z < SIZE; z++)
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        dummy.position.set(
          posX + (x - 4.5) * 0.125,
          1.45 + (y - 4.5) * 0.125,
          -0.75 + (z - 4.5) * 0.125
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(index(x, y, z), dummy.matrix);
      }
  mesh.instanceMatrix.needsUpdate = true;
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(boxOutline),
    outlineMat
  );
  outline.position.set(posX, 1.45, -0.75);
  scene.add(mesh, outline);
  return { mesh, outline };
}
const viewA = makeField(-0.88, outlineMaterialA);
const viewB = makeField(0.88, outlineMaterialB);
const flowPoints = [
  new THREE.Vector3(-0.22, 1.45, -0.75),
  new THREE.Vector3(0.22, 1.45, -0.75),
];
const linkLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(flowPoints),
  new THREE.LineDashedMaterial({
    color: 0xe9b45b,
    dashSize: 0.09,
    gapSize: 0.06,
  })
);
linkLine.computeLineDistances();
scene.add(linkLine);
const lowA = new THREE.Color('#091e41'),
  highA = new THREE.Color('#3ad7fa');
const lowB = new THREE.Color('#200e38'),
  highB = new THREE.Color('#cb8dff');
const tempColor = new THREE.Color();
function paint(
  mesh: THREE.InstancedMesh,
  values: Float32Array,
  low: THREE.Color,
  high: THREE.Color
) {
  for (let i = 0; i < COUNT; i++) {
    const v = Math.pow(values[i], 0.8);
    tempColor.copy(low).lerp(high, v);
    mesh.setColorAt(i, tempColor);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
function write(selector: string, content: string) {
  const el = document.querySelector<HTMLElement>(selector);
  if (el) el.textContent = content;
}
function meter(selector: string, fraction: number) {
  const el = document.querySelector<HTMLElement>(selector);
  if (el)
    el.style.width =
      Math.max(0, Math.min(100, fraction * 100)).toFixed(1) + '%';
}
function refresh() {
  const aMean = mean(world.a),
    bMean = mean(world.b),
    controlMean = mean(world.baseline);
  const difference = bMean - controlMean;
  const spatialRms = Math.sqrt(
    world.b.reduce((sum, value, i) => sum + (value - world.baseline[i]) ** 2, 0) / COUNT
  );
  const influence = connected ? strength * aMean : 0;
  write('#a-mean', aMean.toFixed(3));
  write('#b-active', (100 * active(world.b)).toFixed(1) + '%');
  write('#delta', (difference >= 0 ? '+' : '') + difference.toFixed(4));
  write('#rms', spatialRms.toFixed(4));
  write('#edge-value', influence.toFixed(3));
  write('#tick', String(world.tick).padStart(4, '0'));
  meter('#a-meter', aMean);
  meter('#b-meter', active(world.b));
  meter('#delta-meter', Math.abs(difference) * 2);
  if (world.tick === 0)
    write(
      '#observation',
      'Initial state. Step forward to observe the connection effect.'
    );
  else if (!connected || strength === 0)
    write(
      '#observation',
      'The connection is disabled. The counterfactual difference should be zero after a reset.'
    );
  else if (Math.abs(difference) > 0.01)
    write(
      '#observation',
      'The pattern arriving from A is changing B’s existing algorithm at individual spatial positions. This is measured coupling, not proof of emergence.'
    );
  else
    write(
      '#observation',
      'Both cubes are evolving. The output difference is currently small.'
    );
  paint(viewA.mesh, world.a, lowA, highA);
  paint(viewB.mesh, world.b, lowB, highB);
  linkLine.visible = connected && strength > 0 && viewportMode === 'both';
  viewA.mesh.visible = viewA.outline.visible = viewportMode !== 'b';
  viewB.mesh.visible = viewB.outline.visible = viewportMode !== 'a';
}
function reset() {
  playing = false;
  world = initialWorld();
  lastTick = 0;
  write('#play', '▶ Run');
  refresh();
}
document
  .querySelector<HTMLButtonElement>('#step')
  ?.addEventListener('click', () => {
    playing = false;
    write('#play', '▶ Run');
    step();
  });
document
  .querySelector<HTMLButtonElement>('#reset')
  ?.addEventListener('click', reset);
document
  .querySelector<HTMLButtonElement>('#play')
  ?.addEventListener('click', () => {
    playing = !playing;
    lastTick = performance.now();
    write('#play', playing ? 'Ⅱ Pause' : '▶ Run');
  });
document
  .querySelector<HTMLInputElement>('#coupling')
  ?.addEventListener('input', event => {
    strength = Number((event.target as HTMLInputElement).value);
    write('#strength-value', strength.toFixed(2));
    refresh();
  });
document
  .querySelector<HTMLInputElement>('#connected')
  ?.addEventListener('change', event => {
    connected = (event.target as HTMLInputElement).checked;
    write('#link-indicator', connected ? 'CONNECTED' : 'DISABLED');
    refresh();
  });
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button =>
  button.addEventListener('click', () => {
    viewportMode = button.dataset.view as typeof viewportMode;
    document
      .querySelectorAll('[data-view]')
      .forEach(b => b.classList.toggle('selected', b === button));
    refresh();
  })
);
document
  .querySelector<HTMLButtonElement>('#export')
  ?.addEventListener('click', () => {
    const payload = {
      format: 'atunbi.experiment.v1',
      createdAt: new Date().toISOString(),
      size: [10, 10, 10],
      tick: world.tick,
      clockHz: tickRate,
      modules: [
        {
          id: 'A',
          algorithm: 'local_6_neighbor_diffusion_with_moving_source_v1',
          state: Array.from(world.a),
          outputPort: { name: 'pattern_A', type: 'scalar_field', shape: [10, 10, 10] },
          outputs: { mean_energy: mean(world.a) },
        },
        {
          id: 'B',
          algorithm: 'nonlinear_neighbor_threshold_activation_v1',
          state: Array.from(world.b),
          inputPort: { name: 'excitation_B', type: 'scalar_field', shape: [10, 10, 10] },
          outputs: { activated_fraction: active(world.b) },
        },
      ],
      edges: [
        {
          source: 'A.pattern_A',
          target: 'B.excitation_B',
          type: 'voxelwise_pattern_modulation',
          mapping: 'identity_xyz',
          influenceRule: 'B.drive[x,y,z] += 1.1 * strength * A.pattern[x,y,z]',
          enabled: connected,
          strength,
        },
      ],
      counterfactual: {
        module: 'B',
        state: Array.from(world.baseline),
        mean_difference: mean(world.b) - mean(world.baseline),
        spatial_rms: Math.sqrt(world.b.reduce((sum, value, i) => sum + (value - world.baseline[i]) ** 2, 0) / COUNT),
      },
      initialCondition: 'deterministic_seed_v1',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'atunbi-experiment-tick-' + world.tick + '.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    write(
      '#export-note',
      'JSON exported: 2 modules, 1 edge, 1 counterfactual field.'
    );
  });
const vrSlot = document.querySelector('#vr-slot');
if (vrSlot) {
  const vr = VRButton.createButton(renderer);
  vr.id = 'enter-vr';
  vrSlot.appendChild(vr);
}
function resize() {
  const parent = canvas.parentElement;
  if (!parent) return;
  const width = Math.max(1, parent.clientWidth),
    height = Math.max(1, parent.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas.parentElement!);
reset();
resize();
renderer.setAnimationLoop((now: number) => {
  if (playing && now - lastTick >= 1000 / tickRate) {
    const elapsed = Math.min(
      3,
      Math.floor(((now - lastTick) * tickRate) / 1000)
    );
    for (let i = 0; i < elapsed; i++) step();
    lastTick = now;
  }
  controls.update();
  renderer.render(scene, camera);
});
