# G5 · Nested algorithm composition

The ÀTÚNBÍ environment is initially an **empty bounded 10 × 10 × 10 space**, without resident objects, algorithms or patterns. Installing an algorithm creates a dynamic field in that space. Multiple installed algorithms retain **independent state arrays**; the display renders an intensity-weighted combination of these fields, not prefilled cubes.

## Ontology

- **Environment:** immutable 10³ coordinate domain, empty until configured.
- **Algorithm layer:** one installed transition rule with its own current state, ID and input-impact readout.
- **Pattern:** a 3D scalar field that the layer generates at each update.
- **Internal connection:** a signed transformation of a source layer's prior-tick pattern into a destination layer's local inputs, within the same environment.
- **Exposed pattern:** one selected layer output per environment, used by outer-graph connections. Non-exposed layers continue evolving.
- **External connection:** a signed transformation from the selected output of a source environment into an explicitly chosen destination algorithm layer in a different environment.

## Update order

At discrete global tick t, collect all source fields before advancing any layer:

```text
for each environment:
    for each resident algorithm layer L:
        U_internal(L,t) = Σ inner_edge.weights × source_pattern(t)
        U_external(L,t) = Σ outer_edge.weights × exposed_source_pattern(t)
        new_state(L) = transition_L(old_state(L), U_internal + U_external, t)
commit all new algorithm states simultaneously
```

Thus, one algorithm cannot accidentally use another's next-tick state within the same tick. Feedback loops are allowed at the graph level but have a one-tick delay.

Local input impact is calculated as the RMS difference between a layer’s *next state with its current connection inputs* and the next state using zero connection inputs from the same current state. This is a one-step intervention metric, not a proof of emergent behaviour.

## Current controls

1. Add empty sandbox.
2. Assign a primary algorithm inside it.
3. Use **Edit internal algorithms** to select that environment's internal workbench.
4. Install more algorithms in that environment (currently maximum four).
5. Connect internal source and destination algorithms, then adjust sign, strength and active status.
6. Choose which algorithmic pattern the environment exposes to the outer graph.
7. Connect environment pattern outputs to other environments, selecting a specific receiving algorithm.
8. Step, run, pause, reset; compare per-layer means and input-impact metrics.
9. Export the `atunbi.node-network.v3` JSON and import it later. The import supports legacy v2 graphs as single-algorithm environments.

## Acceptance gates

- A new environment contains **zero installed algorithms** and displays only a spatial boundary.
- Two algorithms inside one environment evolve with distinct state buffers when unconnected.
- A nonzero internal relationship changes the designated receiver's next-state output.
- Disabling or deleting a relationship leaves the algorithms intact, and its input impact disappears when no other relationships feed the target.
- Exposing a different output changes future outgoing influence without stopping hidden algorithms.
- Export/import preserves every algorithm field, internal edge, external edge, selected exposed field, and tick.

## Prototype constraints

Maximum six environments, four algorithms per environment, current fixed 10³ grid resolution and a synchronous browser CPU simulation loop. Viewer geometry is a 3D representation of current pattern state; its boxes are rendering primitives, not resident algorithmic objects. WebXR remains a view-only preview; Quest controller graph authoring is not yet available. No ongoing GitHub-to-site deployment sync is configured.
