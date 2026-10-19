# ÀTÚNBÍ: system purpose and BARE theory v1.0

**Status:** Proposed design and research framework. It is neither a peer-reviewed theory nor an established law of emergence.

**Date:** 19 October 2026.

## 1. Canonical purpose and system boundary

Àtúnbí exists **to make the formation of complex system behaviour observable, experimentally testable, reproducible and constructible through algorithmic composition.**

**Primary system of interest:** A network of bounded spatial environments hosting multiple independently executable algorithms. Each algorithm evolves an internal pattern. Typed relationships can transmit output patterns to existing algorithms within the same environment or another environment. An experimenter observes resulting changes and develops testable explanations.

**The environment is initially empty.** The 10 × 10 × 10 domain is a coordinate space, not a box populated with 1,000 pre-existing algorithm cubes. The visible voxels are graphical samples of patterns generated only by assigned algorithms.

**Inside the system boundary:** algorithm state and execution; bounded spatial coordinate domain; installed transition rules; typed pattern ports and connections; simulation clock; representation/rendering; measurements; controlled interventions; experimental provenance; authoring interfaces.

**Outside the system boundary:** claims about the physical universe, external sensory validation, real-world causal mechanisms, live training on external data, real VR hand authoring (future work) and claims of strong emergence.

**Stakeholders:** experimenter, systems modeller, educator, developer, research collaborator. The model is an instrument, not a substitute for empirical validation.

## 2. Purpose decomposition and requirements

| ID | Subpurpose | Functional consequence | Acceptance |
|---|---|---|---|
| P1 | Bound possibility | Create empty, addressable spatial environments | New sandbox has zero resident algorithms |
| P2 | Generate dynamics | Assign algorithms with distinct state and rule | One algorithm can evolve with no links |
| P3 | Compose behaviours | Route typed pattern outputs into existing algorithm inputs | Link ablation changes the receiving trajectory when influence is nonzero |
| P4 | Observe change | Display spatial, temporal and graph measurements | States and metrics correspond to the simulation |
| P5 | Intervene rigorously | Run matched connected and counterfactual experiments | Same starting state, same time schedule, only links differ |
| P6 | Distinguish effects | Report magnitude, structure and persistence | Divergence does not automatically imply emergence |
| P7 | Reproduce findings | Store states, rule identities, parameters and measurements | JSON can reconstruct experiment assumptions |
| P8 | Build reusable knowledge | Catalogue patterns, relations, trials and failures | Evidence is tied to a replicable model version |

Outcomes should be labelled separately as **simulation observation**, **experimental evidence**, **hypothesis supported in a particular model**, and **external-world conclusion**. The current software can support the first two only.

## 3. Constructive Relational Systems Philosophy (CRSP)

This is Àtúnbí's proposed guiding philosophy, not a universal metaphysical conclusion.

1. **Potentiality before mechanism.** A domain is a possibility space. A mechanism is an assigned algorithm.
2. **Process before visual object.** A pattern is a manifestation of state transitions; graphics are observers' representations.
3. **Executable relation rather than ornamental connection.** Edges are algorithms mapping source outputs to target inputs.
4. **Part autonomy and conditional whole behaviour.** Components have local rules, while composite trajectories depend on coupling.
5. **Observability is not causality.** A pattern's appearance is an observation. Causal attribution requires an intervention under controlled conditions.
6. **Emergence is a scientific question, not a promised aesthetic.** Persistent, distinguishable collective patterns may motivate further causal investigation, but the observer must define the macrovariable, timescale and null model.
7. **Bounded claims.** Results hold only for the implemented transition equations, initial conditions, scheduling choices and parameter range tested.

CRSP synthesises cybernetics, compositional modelling and intervention-based experimentation. Its distinct contribution is an executable **pattern-output → relationship operator → existing algorithm-input** workflow integrated into a spatial node editor.

## 4. Bounded Algorithmic Relational Emergence (BARE) — proposed theory

### Primitive entities

- Spatial environment \(E_i=\{0,\ldots,9\}^3\). Empty until algorithms are installed.
- Algorithm layer \(A_{ik}=(F_{ik},X_{ik},\Delta t)\), with its own transition rule and mutable state.
- Observable pattern \(P_{ik}(t)=H_{ik}(X_{ik}(t))\).
- Typed relationship \(R_{jk\to il}=G_{jk\to il}(P_{jk})\). A relationship may scale, attenuate, inhibit, delay, threshold or spatially remap signals.
- Network \(\mathcal{G}=(\mathcal{A},\mathcal{R})\) with algorithm nodes and typed relationship edges.
- Observer \(\mathcal{O}\), specifying an observable or macrovariable and sampling timescale.
- Intervention \(\mathcal{I}\), such as removing only internal or external edges while holding initial conditions constant.

### Update semantics

For algorithm k inside environment i:

\[
X_{ik}(t+1)
=F_{ik}\left(X_{ik}(t),
\sum_{(j,l)\to(i,k)}G_{jl\to ik}\left(P_{jl}(t)\right),C_{ik}\right).
\]

Every algorithm uses **the same prior-tick snapshot**; new states are committed after all target updates. Feedback across relationships is thus subject to one or more discrete ticks, not an unintended in-place order effect.

### BARE's four falsifiable hypotheses

**H1, relational influence:** for some nonzero relationships, two matched worlds that differ only in those relationships have non-identical trajectories.

**H2, structural differentiation:** some relationships change the organisation of patterns (for example the average spatial neighbour gradient), not merely their total intensity.

**H3, temporal persistence:** for some parameter configurations, relationships create differences in specified observables persisting through a defined sequence of ticks.

**H4, configuration sensitivity:** varying relation strength, sign, mapping and graph topology changes composite dynamics in systematic, testable ways. Rigorous H4 testing requires parameter sweeps, replication and sensitivity analysis, not just two examples.

The word 'emergent' shall not automatically be assigned to any result satisfying H1–H3. The theory's strongest novel claim requires independent validation across multiple algorithm families and meaningful macrovariable definitions.

### Nulls and failure outcomes

- H1 null: the altered connection does not change target state under the given conditions.
- H2 null: the relationship changes intensity but not the chosen structural observable.
- H3 null: the difference decays or fails the declared persistence threshold.
- H4 null: the measured property is insensitive to parameter changes in the studied range.

**Failure is a valid scientific result** and must not be hidden by visually exciting animations.

## 5. Current intervention metrics

Let connected (C) and ablated control (B) trajectories start from identical states:

\[
X^{C}(0)=X^{B}(0).
\]

The experiment estimates:

\[
D_t=\sqrt{\frac{1}{M}\sum_{k=1}^{M}\left(X_k^C(t)-X_k^B(t)\right)^2}
\]

as the global RMS field divergence over all algorithm states.

It also measures a spatial gradient:

\[
G(X)=\frac{1}{|\mathcal{N}|}\sum_{(p,q)\in\mathcal{N}}|X_p-X_q|
\]

where \(\mathcal{N}\) is the set of nearest-neighbour voxel pairs. Structural difference is \(\Delta G=G(X^C)-G(X^B)\).

Within each environment, pairwise coactivation is an average of \(X_{a,p}X_{b,p}\) across co-resident algorithm pairs. The difference between experimental and control coactivation trajectories is another **proxy** for relationally induced pattern change.

A provisional **candidate collective pattern** is marked when measured divergence is nontrivial, a structural-gradient difference exceeds a preset threshold, and divergence persists for multiple ticks. Thresholds are heuristic and uncalibrated; the candidate label must never be read as proof of emergent causation.

## 6. Scientific precedents and distinctions

- **Ashby, W. R. (1956), *An Introduction to Cybernetics***: regulation and requisite variety. Archive: https://ashby.info/archive.html
- **Grimm et al. (2020), ODD protocol**, *Journal of Artificial Societies and Social Simulation* 23(2):7: purpose, patterns, state, scheduling and replicability. https://www.jasss.org/23/2/7.html
- **Stanford Encyclopedia of Philosophy**, *Emergent Properties* (Summer 2026): distinctions between weak and stronger emergence. https://plato.stanford.edu/archives/sum2026/entries/properties-emergent/
- **Emergence and Causality in Complex Systems: A Survey of Causal Emergence and Related Quantitative Studies** (2024): literature on effective information and macro-level causal accounts. https://pmc.ncbi.nlm.nih.gov/articles/PMC10887681/

Àtúnbí does **not** currently compute effective information, multiscale causal emergence, predictive information decomposition or a formal proof of emergence.

## 7. Proposed research programme

1. Replicate the G6 paired experiment on several transition rules and initial states.
2. Define task-specific macrovariables (cluster count, entropy, propagation speed, recurrence, oscillatory coherence and stability).
3. Conduct multiple ablation controls, including edge-by-edge removals, inhibitory versus excitatory coupling, shuffled spatial mappings and placebo links.
4. Sweep coupling strength and topology while controlling stochasticity.
5. Look for non-additive interaction terms and regime boundaries.
6. Compare predictions with held-out model configurations before proposing general results.
7. Only thereafter consider empirical grounding against measured real-world systems.

**Design principle:** Àtúnbí's purpose is not to find emergence at all costs; it is to make claims about emergence testable, reproducible and refutable.
