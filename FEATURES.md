# Observed features and controller menu

Verified on 19 October 2026 using model/menu tests, desktop/mobile browser flows, automated accessibility scans and a simulated WebXR session. Physical-headset behavior is not yet verified.

## Observed features

| Category | Features observed in checks |
| --- | --- |
| Workspace | Empty environments, algorithm installation, internal/external links, keyboard node movement, guarded clearing and JSON import/export |
| G6 simulation | Run/pause, single step, reset, matched non-mutating experiments, horizon and all ablation choices |
| G7 compiler | Both presets, source validation, 24-bit instructions, bounded coordinates, transport, 32-bit packets and coupling comparison |
| G8 binary kernel | Three presets, bit-only 1000-cell matrices, instruction/packet encoding, delayed message delivery, causality, depth slices and external annotations |
| G9 discovery | Matched no-op/bit-flip/uncoupling runs, numeric descriptors, exact recurrence, full-VM cycle checks, replay and independent hypotheses |
| View and accessibility | Keyboard camera orbit/zoom/recenter, state descriptions, pause-all, responsive controls, visible focus and inline validation |
| Evidence and notebook | Five JSON export paths, network round trip, invalid-import rejection and hypothesis persistence after reload |
| References | All eight supplied original links with applied-versus-reference notes |
| G10 composition | PID regulation, 32-bit fixed-point registers, anti-windup, derivative filtering, simple equation drivers, binary actuation and paired replay |
| Modular workflow | Typed ports, real edge disconnection, delayed delivery, trace, compatible wiring and atomic import, save/load and graph overview |
| Controller interaction | Ray selection, thumbstick highlight/select, grip-to-back, pagination, disabled prerequisites, confirmation/cancel and desktop restoration in simulated WebXR |

## Categorized menu list

74 actions across 10 categories share the same desktop/WebXR action registry. Text entry, imports and downloads use the page.

### Workspace

- Load example — confirmation required
- Add empty sandbox
- Edit algorithms and links — page only
- Import network JSON — page only
- Clear workspace — confirmation required

### G6 simulation

- Run / pause G6
- Step G6 +1
- Reset G6 — confirmation required
- Run G6 experiment
- Next ablation mode
- Next experiment horizon

### G7 compiler

- Compile G7 source
- Run / pause G7
- Step G7 +1
- Reset G7 — confirmation required
- Compare G7 coupling
- Next G7 preset
- Edit system sentences — page only

### G8 binary kernel

- Compile G8 source
- Run / pause G8
- Step G8 +1
- Reset G8 — confirmation required
- Test G8 causality
- Reciprocal XOR preset
- One-way preset
- Isolated preset
- Next binary depth slice
- Edit binary source — page only
- Annotate G8 meaning — page only

### G9 discovery

- Run discovery
- Verify exact replay
- Next intervention mode
- Next duration
- Next flip address
- Next intervention tick
- Next detected pattern
- Read measured evidence
- Write observer hypothesis — page only

### View and safety

- Recenter view
- Describe G6 state
- Pause all runtimes
- Orbit left — page only
- Orbit right — page only
- Orbit up — page only
- Orbit down — page only
- Zoom in — page only
- Zoom out — page only

### Evidence and notebook

- Export G6 network — page only
- Export G6 experiment — page only
- Export G7 evidence — page only
- Export G8 binary — page only
- Export G9 evidence — page only
- Open hypothesis notebook — page only

### Reference library

- Web UI and UX process
- PhET simulation guidance
- PhET accessibility
- Meta Quest references
- Open all original links — page only

### G10 composition

- Step system +1
- Run / pause system
- Reset system — confirmation required
- Compare PID / open loop
- Verify system replay
- Import G8 matrix
- Export system evidence — page only
- Next system preset
- Toggle oscillator edge
- Edit PID gains — page only

### Modular workflow

- Advance workflow tick
- Save wiring — page only
- Load saved wiring — page only
- Restore default wiring — confirmation required
- Export wiring JSON — page only
- Edit module connections — page only

## Verification and practical limits

Run `npm run typecheck`, `npm test`, `npm run build` and `npm run test:browser`. The browser report is written to `test-results/feature-checks.json`; the workflow publishes that report as a GitHub Actions artifact.

The spatial scene remains G6. Menu operations for G7/G8/G9 report their independent state; they do not pretend to display those kernels in the G6 volume. Text entry, file selection and downloads use the page. Native headset hand tracking, device permissions, physical controller mappings and comfort require a real headset. No claim of complete WCAG certification or scientific proof of emergence is made by automated checks.
