# G6 controlled intervention protocol

## Objective

Compare the evolving pattern network with a matched counterfactual in which a specified class of relationships has been ablated. Test relational influence and structural differentiation without presuming that divergence is proof of emergence.

## Procedure

1. Build or load an experiment containing at least one installed algorithm. All environments are initially empty.
2. For informative causal tests, ensure at least one enabled internal or external edge transmits a nonzero pattern to a receptive algorithm.
3. Choose **All connections**, **Internal connections only**, or **External connections only** in the control ablation selector.
4. Choose horizon 10, 24, 48 or 80 discrete ticks.
5. Run the **controlled experiment**. The engine clones the current network state and simulates paired worlds. It leaves the working network unchanged.
6. Inspect global trajectory RMS divergence, neighbour-gradient delta, coactivation delta and the longest consecutive sequence of ticks exceeding the provisional divergence threshold.
7. Repeat with edges disabled or with a different ablation class, then compare the outcomes.
8. Export the G6 evidence JSON for archival and independent review.

## Measures

- RMS trajectory divergence: square-root of mean squared cell-state differences between paired worlds over all installed algorithms.
- Spatial organisation proxy: average absolute difference across six-connected grid neighbours, evaluated separately per world.
- Coactivation: mean pointwise product of distinct algorithm-layer fields co-residing within each environment.
- Persistence: longest run of ticks above a fixed provisional divergence cutoff.

## Current interpretation rules

- `interactionDetected`: peak divergence > 1e-5.
- `structureChanged`: absolute final gradient difference > 5e-4.
- `candidateCollectivePattern`: an interaction and structural difference are detected, the longest above-threshold run is ≥5, and final divergence >0.012.

These thresholds are currently **uncalibrated heuristics**. A positive candidate flag is only a prioritisation aid for further experiments. It neither proves weak emergence under all philosophical definitions nor computes causal emergence in the technical information-theoretic sense.

## Valid negative controls

- All edges disabled: both experiments must evolve identically from identical states.
- Zero-strength enabled edges: no effect.
- A target that saturates: possible zero effect despite nonzero source (a valid result).
- A non-responsive source with no outgoing coupling: no influence (valid).

## Current implementation limits

- Small deterministic toy algorithms and fixed 10³ scalar fields.
- Does not calculate formal statistical confidence intervals, sensitivity surfaces, effective information or decomposition of multivariate information.
- No stochastic replicates or physical-world measurement validation.
- The generated evidence JSON stores experiment starting states and per-tick aggregate observations rather than the entire 1,000-cell field trajectory at every tick.

The next scientific engineering milestone is edge-specific, multi-seed intervention testing with independently checkable macrovariables and error bounds.
