# ÀTÚNBÍ: software architecture mapped to BARE theory

## 1. Architectural driver

Purpose → formally bounded environments → independently executable algorithms → typed pattern outputs → executable relationships → synchronized simulation → intervention and measurement → evidence and model revision.

This architecture is **a functional decomposition**, not a guarantee that individual subsystems can be distributed to separate computers without additional scheduling, serialization and networking.

## 2. Logical subsystem map

| Subsystem | Inputs | Transformation | Outputs | Current implementation |
|---|---|---|---|---|
| S0 Model specification | user intent, algorithm/port schema | validate model and bounds | typed network definition | `src/editor.ts` |
| S1 Spatial domain | fixed coordinate topology | index and restrict operations | 10³ addressable positions | `src/editor.ts` |
| S2 Algorithm runtime | local prior state and inputs | transition `F_i` | new algorithm fields | `src/editor.ts` / `evolve` |
| S3 Pattern operators | source pattern + edge settings | field transformation and mapping | signed destination input field | `src/editor.ts` |
| S4 Synchronous scheduler | network graph, current tick | snapshot all states, update all, then commit | deterministic next state | `src/editor.ts` / `step` |
| S5 Visual observer | states, selected graph metadata | Three.js spatial rendering and UI projection | live 3D patterns, metrics | `src/editor.ts`, `src/g4.css` |
| S6 Experimental intervention | copied network, control specification | run connected/ablated paired trajectories | matched experiment time series | `src/emergence.ts` |
| S7 Measurement | paired trajectories | RMS divergence, mean neighbour gradient, coactivation, persistence | experiment evidence | `src/emergence.ts` |
| S8 Evidence and documentation | initial states, intervention settings and results | serialize reproducible record | JSON and theory documents | `src/editor.ts`, `docs/` |

Subsequent versions should extract S0–S4 and S5 into independently testable modules. The current experiment engine is already implemented separately.

## 3. Relationships and types

Current ports transmit same-sized spatial scalar fields of shape `[10,10,10]`; typed connections identify selected source layer patterns and specific receiving layers. Edge operators currently implement signed gain (excitation/inhibition) with an identity spatial mapping.

Proposed port contract:

```ts
interface PatternPort {
  valueType: 'scalar-field' | 'vector-field' | 'event' | 'graph' | 'timeseries';
  spatialShape?: [number, number, number];
  unit?: string;
  timeBase: string;
  observableName: string;
}

interface RelationOperator {
  operatorId: string;
  inputPort: PatternPort;
  outputPort: PatternPort;
  parameters: Record<string, unknown>;
  delayTicks: number;
}
```

The port contract is an **architectural proposal** rather than the current runtime schema. A future typechecker should reject shape, unit, time or data-type mismatches before execution.

## 4. Experimental engine

`src/emergence.ts` defines `PatternNetwork`, `PatternWorld`, `PatternLayer`, `runAblationExperiment`, and the numerical observation series.

The experiment engine clones the current network and runs two separate copies:

1. An experimental copy with the user's enabled relationships.
2. A comparison copy with **all**, **internal-only** or **external-only** connections removed.

Both use identical initial layer state arrays, transition functions and clock timestamps. Neither writes into the user's live workspace. A time series of global divergence, spatial gradient differences and within-environment coactivation differences is produced.

A positive intervention effect validates causal sensitivity **inside the modeled equations**, not external-world causality. Counterfactual conclusions assume correct simulator implementation and no unmodelled confounds.

## 5. Validation and failure handling

| Gate | Method | Pass/interpretation |
|---|---|---|
| G6-A | Empty graph / zero algorithms | Experiment blocked with visible warning |
| G6-B | Same initial snapshot, links all disabled | Zero difference over all ticks |
| G6-C | Nonzero link with responsive receiving algorithm | Observable trajectory difference |
| G6-D | Internal-only and external-only ablations | Different interventions are accepted and measured |
| G6-E | Randomized order of algorithm storage with deterministic IDs | Final state independent of processing order (future automated invariant test) |
| G6-F | Export evidence JSON | Contains initial network and complete observations |
| G6-G | Browser and Meta Quest performance profiling | Latency/memory recorded, hard performance limits enforced (future) |

Threshold-based *candidate* labels are provisional. More stringent controlled replicates, shuffled-pattern negative controls, bootstrapped uncertainties and independent macrovariable definitions are required before any scientifically substantive emergence claim.

## 6. Prioritized roadmap / innovation bounded by purpose

### P0: Experimental validity, highest priority
- Edge-by-edge ablation, placebo controls and seed selection.
- Independent unit and property tests of scheduler, field mapping and numerical metrics.
- Full state provenance and versioned replay.
- Clear pass/fail experiment hypotheses and calibrated thresholds.

### P1: More informative model composition
- Multiple algorithm output ports (not just one exposed layer per environment).
- Spatial transforms (rotate, translate, convolution, morph, mask), event-typed relationships, delays and time-scale converters.
- Intra-environment algorithm graph visualization with shape and unit checking.
- Matrix-to-graph and system-sentence-to-network import.

### P2: Stronger scientific inference
- Parameter sweeps, factorial designs and sensitivity surfaces.
- Perturbation-response signatures, structural motifs, pattern lifetimes and recurrence measures.
- Non-additivity/synergy measurements with explicit matched baselines.
- Effect-size uncertainty, confidence intervals where statistical sampling warrants them, and replicated experiments.

### P3: Performance and VR research workspace
- GPU/WebGPU field computation and sparse updates.
- Independent clocks, event-driven scheduling, parallel workers with deterministic replay.
- Full Meta Quest controller-based spatial node editing.
- Spatial workspaces for simultaneous experiment comparisons.

### P4: Knowledge and discovery platform
- Searchable reusable library of algorithm motifs and measured interaction patterns.
- Human-readable system sentences generated from graph structure.
- Provenance graphs connecting models, hypotheses, interventions, observations and design decisions.
- Optional AI-assisted hypothesis suggestions, explicitly separated from experimental validation.

### P5: Adaptive design and generative discovery
- Search over algorithms/relationship operators under fixed reproducibility constraints.
- Optimisation toward defined user purposes, not a vague goal of producing 'more emergence'.
- Safety/resource sandboxing for third-party or machine-generated algorithms.
- Versioned publishing of experiments for collaborative replication.

Features outside the defined purpose should be excluded until a traceable research/design need is established. For instance, general chat, ecommerce and social gaming are not core requirements merely because Àtúnbí could technically host them.

## 7. Quality attributes

- **Scientific integrity:** hypotheses, intervention controls, reproducibility and explicit claim bounds.
- **Isolation:** one algorithm's state is not another's state.
- **Determinism:** synchronous updates from prior-tick snapshots; future stochasticity requires controlled seeds.
- **Observability:** local and composite results can be separately inspected.
- **Extensibility:** algorithm and relationship operators can be added without changing the model's purpose.
- **Performance:** profile actual CPU/GPU work; modularity alone does not guarantee reduced computation.
- **User experience:** 2D authoring and eventual VR exploration share the same simulation state.

## 8. Theory → software → evidence loop

Purpose → model design → node graph → compiled schedule → simulation → controlled perturbation → numerical measurement → hypothesis evaluation → documentation → revised design.

The theory determines what the simulation **must make testable**, while empirical results constrain what the theory **may legitimately claim**.
