# ÀTÚNBÍ · Algorithmic Pattern Sandbox Network

A browser-based laboratory for composing evolving patterns generated inside bounded spatial environments.

**Live website:** https://atunbi-algorithmic-sandbox-network-g8lqqr.v2.appdeploy.ai/

## The architecture

- **Sandbox / environment:** a bounded 10 × 10 × 10 three-dimensional space (1,000 spatial cells).
- **Algorithm:** a state transition rule executing inside the environment, generating and updating spatial patterns.
- **Pattern node output:** a typed interface through which a generated pattern is exposed to a network.
- **Relationship:** a typed transformation that transfers one pattern's influence to the existing algorithm in another sandbox.
- **Composite system:** multiple environments with independently evolving algorithms coupled through pattern relationships.

### First experiment

- Environment **A** contains a diffusion algorithm that evolves a spatial energy pattern.
- Environment **B** contains its *own*, separate nonlinear activation algorithm and evolving cluster pattern.
- The **A → B** edge transmits the spatial field `A.pattern_A[x,y,z]` into `B.excitation_B[x,y,z]`.
- The relationship adds `1.1 * strength * A.pattern_A[x,y,z]` to B's local activation drive. It changes B's **existing algorithm** rather than replacing it.
- A separate uncoupled B control allows measurement of the mean and root-mean-square (RMS) pattern differences.

A 10 × 10 × 10 environment is **not** 1,000 little cubes that themselves constitute separate algorithms. The 1,000 cells describe the space in which a given algorithm may express a pattern.

## Get started

Requires Node.js and npm.

```bash
npm install
npm run dev
```

Open the local Vite address. To build:

```bash
npm run build
npm run preview
```

## Prototype capabilities

- Two distinct 10³ spatial sandbox environments.
- Spatial field-to-field coupling, toggleable and strength-adjustable.
- Start/pause, discrete stepping, reset, and 3D orbit viewing.
- Counterfactual B process and live spatial divergence readout.
- JSON export of model identities, every cell state, connection mapping, and counterfactual state.
- Three.js/WebXR viewer (controller-based authoring not yet implemented).

## Development stages

| Stage | Verification objective | Status |
|---|---|---|
| G0 | Define boundaries, algorithms, states, nodes, port schemas | Specified |
| G1 | Evolve a pattern inside a single 10³ sandbox | Implemented |
| G2 | Run two existing, independent algorithms | Implemented |
| G3 | A pattern output changes B's evolution, and the change is measurable | Implemented |
| G4 | Interactive node editor with multiple pattern nodes, rewiring and transforms | Planned |
| G5 | Import, reset, replay and compare experiments | Partly implemented: export only |
| G6 | Hypothesis-driven emergence metrics and composition experiments | Planned |
| G7 | Meta Quest controller-based editing and immersive navigation | Planned |
| G8 | Plug-in algorithm and custom relationship modules | Planned |

Read [docs/architecture.md](docs/architecture.md) for the system specification.

*These demonstrations validate causal coupling in a toy system, not spontaneous emergence or physical-world accuracy.*
