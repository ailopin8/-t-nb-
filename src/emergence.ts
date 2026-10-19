/**
 * ÀTÚNBÍ / G6 experimental engine
 *
 * Deterministic, synchronous counterfactual ablation experiments on bounded
 * algorithmic pattern networks. No mutation of the user's live workspace.
 *
 * An effect of connectivity is NOT proof of emergence. This engine measures
 * intervention sensitivity, trajectory divergence and pattern organization.
 */
export type Ablation = 'all' | 'internal' | 'external';
export type ConnectionMode = 'excite' | 'inhibit';
export interface PatternLayer<A extends string = string> {
  id: number;
  algorithm: A;
  state: Float32Array;
}
export interface PatternEdge {
  from: number;
  to: number;
  strength: number;
  mode: ConnectionMode;
  enabled: boolean;
}
export interface PatternWorld<A extends string = string> {
  id: number;
  layers: PatternLayer<A>[];
  outputLayerId: number | null;
  innerLinks: PatternEdge[];
}
export interface PatternNetwork<A extends string = string> {
  worlds: PatternWorld<A>[];
  externalLinks: (PatternEdge & { targetLayerId: number })[];
}
export interface ExperimentObservation {
  step: number;
  divergence: number;
  gradientDifference: number;
  coactivationDifference: number;
  coupledGradient: number;
  controlGradient: number;
}
export interface ExperimentResult {
  ablation: Ablation;
  horizon: number;
  layerCount: number;
  activeInternalEdges: number;
  activeExternalEdges: number;
  observations: ExperimentObservation[];
  finalDivergence: number;
  peakDivergence: number;
  finalGradientDifference: number;
  finalCoactivationDifference: number;
  persistentSteps: number;
  interactionDetected: boolean;
  structureChanged: boolean;
  candidateCollectivePattern: boolean;
  interpretation: string;
}
export type Transition<A extends string> = (
  layer: PatternLayer<A>,
  input: Float32Array,
  simulationTime: number
) => Float32Array;

const SIZE = 10;
const COUNT = SIZE ** 3;
const offset = (x: number, y: number, z: number): number => x + SIZE * (y + SIZE * z);

function cloneNetwork<A extends string>(network: PatternNetwork<A>): PatternNetwork<A> {
  return {
    worlds: network.worlds.map(world => ({
      id: world.id,
      outputLayerId: world.outputLayerId,
      layers: world.layers.map(layer => ({
        id: layer.id, algorithm: layer.algorithm, state: layer.state.slice()
      })),
      innerLinks: world.innerLinks.map(edge => ({ ...edge }))
    })),
    externalLinks: network.externalLinks.map(edge => ({ ...edge }))
  };
}
function weightedSign(edge: PatternEdge): number {
  return edge.mode === 'inhibit' ? -edge.strength : edge.strength;
}
function advance<A extends string>(
  network: PatternNetwork<A>,
  transition: Transition<A>,
  time: number,
  removeInternal: boolean,
  removeExternal: boolean
): void {
  const next = network.worlds.map(world => ({
    id: world.id,
    layers: world.layers.map(layer => {
      const input = new Float32Array(COUNT);
      if (!removeInternal) {
        for (const relation of world.innerLinks) {
          if (!relation.enabled || relation.to !== layer.id) continue;
          const source = world.layers.find(candidate => candidate.id === relation.from);
          if (!source) continue;
          const weight = weightedSign(relation);
          for (let i = 0; i < COUNT; i++) input[i] += weight * source.state[i];
        }
      }
      if (!removeExternal) {
        for (const relation of network.externalLinks) {
          if (!relation.enabled || relation.to !== world.id || relation.targetLayerId !== layer.id) continue;
          const sourceWorld = network.worlds.find(candidate => candidate.id === relation.from);
          const source = sourceWorld?.layers.find(candidate => candidate.id === sourceWorld.outputLayerId);
          if (!source) continue;
          const weight = weightedSign(relation);
          for (let i = 0; i < COUNT; i++) input[i] += weight * source.state[i];
        }
      }
      return { id: layer.id, state: transition(layer, input, time) };
    })
  }));
  for (const update of next) {
    const world = network.worlds.find(current => current.id === update.id);
    if (!world) continue;
    for (const layerUpdate of update.layers) {
      const layer = world.layers.find(current => current.id === layerUpdate.id);
      if (layer) layer.state = layerUpdate.state;
    }
  }
}
function allLayers<A extends string>(network: PatternNetwork<A>): PatternLayer<A>[] {
  return network.worlds.flatMap(world => world.layers);
}
function divergence<A extends string>(connected: PatternNetwork<A>, control: PatternNetwork<A>): number {
  let sumSquares = 0;
  let count = 0;
  for (const world of connected.worlds) {
    const comparison = control.worlds.find(w => w.id === world.id);
    if (!comparison) throw new Error('Counterfactual missing an environment.');
    for (const layer of world.layers) {
      const other = comparison.layers.find(l => l.id === layer.id);
      if (!other) throw new Error('Counterfactual missing an algorithm.');
      for (let i = 0; i < COUNT; i++) {
        const d = layer.state[i] - other.state[i];
        sumSquares += d * d;
        count++;
      }
    }
  }
  return count ? Math.sqrt(sumSquares / count) : 0;
}
function spatialGradient<A extends string>(network: PatternNetwork<A>): number {
  let total = 0;
  let count = 0;
  for (const layer of allLayers(network)) {
    const field = layer.state;
    for (let z = 0; z < SIZE; z++)
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const here = field[offset(x,y,z)];
          if (x + 1 < SIZE) { total += Math.abs(here - field[offset(x+1,y,z)]); count++; }
          if (y + 1 < SIZE) { total += Math.abs(here - field[offset(x,y+1,z)]); count++; }
          if (z + 1 < SIZE) { total += Math.abs(here - field[offset(x,y,z+1)]); count++; }
        }
  }
  return count ? total / count : 0;
}
function spatialCoactivation<A extends string>(network: PatternNetwork<A>): number {
  let total = 0;
  let count = 0;
  for (const world of network.worlds) {
    for (let a = 0; a < world.layers.length; a++)
      for (let b = a + 1; b < world.layers.length; b++) {
        const left = world.layers[a].state, right = world.layers[b].state;
        for (let i = 0; i < COUNT; i++) { total += left[i] * right[i]; count++; }
      }
  }
  return count ? total / count : 0;
}
export function runAblationExperiment<A extends string>(
  source: PatternNetwork<A>,
  transition: Transition<A>,
  horizon: number,
  ablation: Ablation,
  startTime = 0
): ExperimentResult {
  if (!Number.isSafeInteger(horizon) || horizon < 1 || horizon > 80) {
    throw new Error('Experimental horizon must be an integer between 1 and 80.');
  }
  const connected = cloneNetwork(source);
  const baseline = cloneNetwork(source);
  const count = allLayers(source).length;
  const observations: ExperimentObservation[] = [];
  let persistentSteps = 0, longest = 0;
  for (let step = 1; step <= horizon; step++) {
    advance(connected,transition,startTime+step-1,false,false);
    advance(baseline,transition,startTime+step-1,ablation !== 'external',ablation !== 'internal');
    const d = divergence(connected,baseline);
    const gc = spatialGradient(connected);
    const gb = spatialGradient(baseline);
    observations.push({
      step,
      divergence: d,
      gradientDifference: gc - gb,
      coactivationDifference: spatialCoactivation(connected) - spatialCoactivation(baseline),
      coupledGradient: gc,
      controlGradient: gb
    });
    persistentSteps = d >= 0.012 ? persistentSteps + 1 : 0;
    longest = Math.max(longest,persistentSteps);
  }
  const final = observations[observations.length - 1];
  const peak = Math.max(...observations.map(row => row.divergence));
  const interaction = peak > 0.00001;
  const structure = Math.abs(final.gradientDifference) > 0.0005;
  const candidate = interaction && structure && longest >= 5 && final.divergence > 0.012;
  return {
    ablation, horizon, layerCount: count,
    activeInternalEdges: source.worlds.reduce((sum,world) => sum+world.innerLinks.filter(link=>link.enabled && link.strength > 0).length,0),
    activeExternalEdges: source.externalLinks.filter(edge=>edge.enabled && edge.strength > 0).length,
    observations, finalDivergence:final.divergence,
    peakDivergence:peak,
    finalGradientDifference:final.gradientDifference,
    finalCoactivationDifference:final.coactivationDifference,
    persistentSteps:longest,
    interactionDetected:interaction,
    structureChanged:structure,
    candidateCollectivePattern:candidate,
    interpretation: candidate
      ? 'Persistent relationship-dependent structural difference detected: a candidate collective pattern, not proof of scientific emergence.'
      : interaction
        ? 'Relationship-dependent trajectory change detected. Additional structural or persistence evidence is needed before treating it as a candidate collective pattern.'
        : 'No measurable relationship effect detected in this configuration and time horizon.'
  };
}
