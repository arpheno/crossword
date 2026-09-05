# Crossword Generation Algorithms: Mathematical and State-of-the-Art Review

**Review state:** Living artifact — source mathematics and primary-source comparison complete; local benchmark verification in progress
**Repository snapshots:** construction core read at `v2@3ea7d72`; application/UI integration re-read as `HEAD` advanced through `v2@7d13f08` to `4b137c0`; uncommitted work visible on 2026-09-03
**Audience:** Construction, application, model-runtime, evaluation, and test agents
**Scope:** American-style blocked crossword topology, fill, theme placement, clue production, personalization, and publish-time validation

## Executive position (initial)

The current core has crossed the line from toy backtracking into a credible CSP implementation: per-length candidate indexes, bitset domains, worklist crossing propagation, an undo trail, pairwise all-different deletion, seeded ordering, node budgets, and a separate post-fill editorial score. Recent commits also repaired the earlier threshold-scale mismatch and added measured template/performance work.

That still does not make it state of the art. The solver presently treats the problem mainly as a binary word-crossing CSP plus a scalar word score. High-end crossword construction is a coupled optimization problem over topology, theme placement, lexical quality, repetition/root similarity, crossings, clueability, cultural/person-specific objectives, and compute risk. A fast feasibility solver is necessary; it is not the editorial optimizer.

The recommended direction is a **hybrid portfolio constructor**:

1. exact or strongly propagated CSP/CP-SAT/ILP machinery for hard constraints;
2. limited-discrepancy or best-first/beam search over editorially ranked decisions;
3. nogood learning and decomposition around theme entries / articulation structure;
4. a multi-objective quality model with hard dominance gates;
5. LLMs used for semantic candidate expansion and clue work, never as the authority on grid validity;
6. offline simulation and human calibration to learn search policy and personalization weights.

## 1. Formal problem statement

For a fixed block topology, let:

- `S = {1, …, n}` be answer slots;
- `D_i` be the eligible word domain for slot `i` after length, pattern, source, locale, and policy filters;
- `x_i ∈ D_i` be the selected fill word;
- `C` be the set of crossings `(i,p,j,q)` meaning character `p` of `x_i` equals character `q` of `x_j`;
- `E` be exclusions/recent answers;
- `L` be locked theme assignments;
- `root(x)` be a normalization used to prevent trivial morphological repetition.

The hard feasibility problem is:

```text
find x_1 … x_n
subject to
  x_i[p] = x_j[q]                    for every (i,p,j,q) ∈ C
  x_i ≠ x_j                          for all i ≠ j
  root(x_i) ≠ root(x_j)              where editorial policy requires it
  x_i ∉ E
  x_i = L_i                          for locked slots
  eligible(x_i, i, profile, policy)  for every slot i
```

For ordinary fixed-grid fill, this is a finite-domain CSP. It can also be encoded as exact cover, SAT, integer programming, or CP-SAT. Once topology/theme selection and soft quality are included, the practical problem is weighted constraint optimization:

```text
maximize  F(x, T, P) =
  lexical_quality(x)
  + theme_coherence(x, T)
  + clueability(x)
  + crossing_fairness(x)
  + learner_value(x, P)
  + novelty(x, P)
  - obscurity_risk(x, P)
  - repetition(x)
  - search_risk(x, T)
```

This objective must not be one unconstrained weighted sum. Structural validity, source eligibility, safety, clue-answer agreement, and minimum fairness are hard gates. The remaining objectives should be optimized lexicographically or with a Pareto frontier so that, for example, profile relevance cannot compensate for junk fill.

## 2. Current repository algorithm (verified at `3ea7d72`)

The TypeScript engine in `packages/construction/src/csp.ts` currently implements:

- candidate normalization and validation;
- per-length local candidate indices;
- one bitset domain per slot;
- precomputed position/letter bitsets;
- worklist-based maintained arc consistency (MAC) across crossings;
- minimum-remaining-values slot selection with crossing-degree tie-breaking;
- score-ordered value selection with deterministic tie-breaking;
- all-different propagation by deleting an assigned word from other domains;
- word-level undo trail rather than cloning domains;
- branch-and-bound when no assignment threshold requests first-feasible behavior;
- synchronous and cooperatively yielding asynchronous drivers;
- cancellation and node-limit terminal states.

The application layer now calculates `scoreFill(...).score` after a CSP solution and rejects values below the recipe's normalized `qualityThreshold` (`packages/application/src/constructPuzzle.ts:190-205`). This corrects the most serious defect in the prior snapshot, where a `0..1` editorial threshold was compared with an unbounded sum of candidate scores. `FillSlot.importance`, however, is declared but not consumed anywhere in selection or scoring.

### 2.1 The current objective mismatch is the highest-priority mathematical defect

Let topology `T` have `n` slots, and let `q(w)` be the base candidate score. The fill-quality function in `quality.ts` is:

```text
Q(x, T) = 0.28 · staple(x)
        + 0.24 · lengthBand(T)
        + 0.20 · crossingFairness(T)
        + 0.16 · longAnswerShare(T)
        + 0.12 · checkedShare(T)

staple(x) = (1/n) · sum_i 1[q(x_i) >= 0.45]
```

For a fixed topology, average answer length, the distribution of crossings per slot, long-answer share, and checked share do not depend on the selected words. More strongly, accepted topologies require every white cell to belong to both an Across and Down run (`topology.ts:153-179`), and the topology emits exactly one intersection per crossing cell (`topology.ts:295-308`), so `checkedShare(T) = 1` for every valid constructed grid. Therefore:

```text
Q(x, T) = K(T) + (0.28/n) · # { i : q(x_i) >= 0.45 }
```

The current “editorial” gate is consequently only a topology score plus a quota of entries on one side of an arbitrary score cutoff. It has no preference between a barely acceptable `0.45` word and an excellent `0.99` word, and no preference between two sub-threshold entries. `maxCrossings` is also computed but unused in `quality.ts:50`.

The CSP does **not** optimize `Q`. Without `minimumAssignmentScore`, it branch-and-bounds the additive candidate objective

```text
S(x) = sum_i blendedCandidateScore(x_i)
```

and the application evaluates `Q` only after the search returns. With learner adaptation enabled, `S` uses the learner-blended score while `Q` deliberately uses the base score. Thus the solver can spend its entire node budget maximizing `S`, return an incumbent that fails `Q`, and cause a template restart even when another assignment on the same topology would pass `Q`. This is not merely imperfect calibration; the optimizer and acceptance predicate are mathematically different.

**Required correction:** express publishability as constraints available during search and make the optimization hierarchy explicit. A minimal version is:

```text
hard:       valid crossings, uniqueness/root policy, eligibility, locks
hard:       bad-entry count <= B(T, day)
lexicographic objectives:
  1. minimize worst-entry risk
  2. minimize total editorial penalties
  3. maximize long/theme interest and profile utility subject to diversity
  4. minimize expected solve/search risk
```

A thresholded staple indicator can be maintained incrementally, giving both immediate pruning and an admissible remaining-good-entries bound. A continuous, calibrated entry penalty should replace the cutoff as the main quality signal.

### 2.2 Propagation is binary MAC plus incomplete all-different propagation

Crossing propagation is correctly implemented with a worklist and bitset letter supports (`csp.ts:286-427`). Its cost for one directed crossing revision is approximately:

```text
O(26 · (w_source + w_target))
```

where `w_l = ceil(m_l / 32)` for the relevant length class. Per-length local indexes are a material improvement over global-width bitsets.

The global word-uniqueness constraint is not maintained arc consistent. On assignment, the chosen word is deleted from every same-length slot (`csp.ts:543-552`), but slots changed by those deletions are not added to the propagation queue; only the assigned slot seeds `propagateFrom`. A deletion can remove the last support for a letter at another crossing, leaving stale neighbor domains until later search. This does not admit an invalid completed grid, but it weakens MRV, delays contradictions, and makes the “classic MAC” comment too strong. At minimum, every domain changed by all-different deletion must seed the worklist. A Régin-style global all-different propagator should be benchmarked, not assumed to win: crossword domains are large, while duplicate-word conflicts may be sparse.

### 2.3 Branch-and-bound is admissible but too weak, and optimality is unreported

The upper bound adds the globally best score for each remaining slot length (`csp.ts:454-462`). It ignores the slot's current domain, crossings, uniqueness, and learned exclusions:

```text
UB(state) = currentScore + sum_unassigned bestGlobalScore(length(slot))
```

This is admissible for maximizing the additive score but often extremely loose. A nearly free stronger bound is the highest live score in each current domain; an assignment-relaxation or matching bound can additionally account for all-different.

When the node limit is reached after any complete incumbent was found, `solveFill` returns `status: 'solved'` (`csp.ts:619-647`) rather than reporting that optimization terminated on a resource limit. The solution records the node count at the moment it was discovered, not final search effort. Consumers therefore cannot distinguish a proven optimum from an anytime incumbent or benchmark actual nodes reliably. Add `terminationReason`, `provenOptimal`, `nodesExplored`, `bestBound`, and `gap` to the result contract.

### 2.4 Personalization currently changes static word order, not puzzle adaptation

`applyLearnerPreferences` is an inexpensive deterministic rank perturbation, not yet the proposed user vector space:

- `difficulty` exists in `LearnerMemoryState` but is unused;
- base surprisal is derived only from the lexicon score as `6(1-score)+1`, not learned or corpus-calibrated;
- `filledCrossLetters` is always zero, so crossing-assisted recognition never affects the score;
- affordance uses global candidate-pool `(length, position, letter)` counts, not the live slot domain or its actual crossing positions;
- unseen words receive the same exploration constant, with no semantic diversity, topic exposure, or uncertainty model;
- one fixed `0.35` blend can trade crossword quality against learner utility before the separate base-quality gate rejects the result.

Keep this as a baseline, but do not call it adaptive puzzle generation in evaluation. The next model should optimize a **distribution over puzzle content across time**, subject to within-puzzle lexical quality and diversity constraints, and should be evaluated for calibration/regret against replayed or synthetic learner trajectories.

### 2.5 The browser construction path currently fails its first real broker contract

`constructPuzzle` unions the slot lengths of every template available to the recipe before calling the model. At this snapshot every Monday–Saturday recipe produces:

```text
9 target lengths: 3, 4, 5, 6, 7, 9, 10, 11, 15
```

`model-runtime/src/broker.ts` sets `MAX_TARGET_LENGTHS = 8` and rejects a larger request. The application tests use a fake `ModelBroker` implementation that does not enforce the real broker contract, so they pass while the browser's real `createModelBroker` returns `invalid-model-output` before inference. The Construct button is wired, but no constructable weekday can currently cross this boundary.

**Required correction:** select/rank a topology or theme-core candidate before requesting its semantic bag, or define a paged/batched length contract. Add an integration test using the real broker around a fake adapter for every constructable day. “Fake port accepts request” is not a boundary test.

### 2.6 On non-theme days, the mandatory LLM candidate bag is mathematically inert

For every model suggestion, the application calls `lexicon.resolve(surface)` and receives the lexicon's ordinary `FillCandidate`. It then appends the entire lexicon slice and deduplicates model-resolved candidates first. The CSP subsequently sorts all candidates by lexicon/learner score and seeded word hash. Suggestion order, `confidence`, `role`, `associations`, and `intendedSense` never enter the fill objective or constraints. A suggestion outside the lexicon is discarded. Therefore on days with `themeLocks = 0`, candidate generation does not change the domain, value order, score, or fill at all; it only gates the pipeline on having called a model.

Theme days do consume model suggestions for locks, but those locks bypass lexicon membership. The current behavior is thus binary: **zero semantic influence** on ordinary days and **unchecked hard authority** on theme entries.

The correction is not to blindly add model confidence to word scores. Resolve proposals to first-class sense records, attach semantic/profile roles as bounded puzzle-level objectives, and preserve base editorial quality as a dominating objective. Add a metamorphic product test: holding seed/artifacts constant, two intentionally different valid model bags must produce a controlled, explainable difference in candidate roles or the final frontier—while invalid/out-of-lexicon suggestions cannot become ordinary fill.

### 2.7 Clue ladders exist in storage but weekday policy does not select them

The recipe's `clueMix` is never read after definition. The application serially requests a clue ladder for every answer, while manifest assembly chooses a `standard` variant if one exists, otherwise the first variant. Stored `difficulty` does not affect the primary clue. The adapter also coerces malformed mechanisms/difficulties and accepts loose non-JSON candidate lists, so the nominal strict-schema boundary is more permissive than its comments imply.

Treat generation and selection separately: batch grounded clue variants, reject/repair invalid schema with explicit receipts, score every clue-answer-sense tuple, then solve a small assignment problem that matches the weekday difficulty/mechanism distribution while penalizing duplicate surfaces and preserving per-entry fairness.

### Complexity model

Let `m_l` be the number of candidates of length `l`, `w_l = ceil(m_l / 32)` the corresponding bitset width, `a` the number of directed crossing arcs, and `k = 26` the alphabet size.

One crossing revision using letter-support bitsets is approximately:

```text
O(k · (w_left + w_right))
```

instead of pairwise compatibility checking:

```text
O(|D_left| · |D_right|)
```

A full propagation wave is bounded roughly by `O(a · k · w)` per wave, but repeated domain changes make total propagation dependent on the number of deletions. Search remains exponential in the worst case. Performance therefore depends much more on domain ordering, early contradiction strength, topology selection, and learned/reused nogoods than on the asymptotic cost of a single revise operation.

### What the current model does not encode at this snapshot

- root/lemma-family all-different;
- global n-gram/orthographic ugliness constraints;
- explicit clueability or sense availability during fill;
- a theme-placement model coupled to topology selection;
- nogood recording / conflict-directed backjumping;
- restarts driven by conflict statistics rather than a fixed seeded loop;
- top-k diverse fills rather than first acceptable fill;
- a portfolio of heuristics/solvers selected by topology hardness;
- calibrated multi-objective optimization;
- an admissible or learned bound for editorial quality;
- uncertainty-aware local-model candidate scores.

These are verified absences from the current construction/search path, not claims that every item must be implemented.

## 3. Published-method comparison

### 3.1 What “state of the art” means here

There is no single accepted benchmark for personalized, American-style, clue-generating construction. The literature separates at least four different problems:

1. **fixed-grid composition:** fill a supplied block pattern from an answer lexicon;
2. **optimization crosswords:** fill (and sometimes place blocks in) a grid to maximize a formal answer score;
3. **crossword resolution:** infer answers from an already-authored grid and clues;
4. **educational generation:** extract subject answers and generate definitions/clues, often with far looser grid/editorial standards.

Claims must stay within those boundaries. A record on Romanian optimization crosswords is not direct evidence of NYT-style editorial quality; a high clue-solving accuracy is not evidence of clue-generation fairness. The most recent primary source found for hard construction optimization is Botea and Bulitko's 2025 hybrid work, while recent LLM papers mostly address answer/clue generation rather than dense American-grid optimization.

### 3.2 Evidence matrix

| Primary source | Problem and method | Strong result / lesson | Repository comparison | Action here |
|---|---|---|---|---|
| [Ginsberg et al., *Search Lessons Learned from Crossword Puzzles* (AAAI 1990)](https://cdn.aaai.org/AAAI/1990/AAAI90-032.pdf) | Fixed-grid word-slot CSP; experiments with lookahead, ordering, and backtracking variants | Directional arc consistency, dynamic ordering, and backjumping mattered on large dictionary CSPs | Current word-slot MRV + bitset crossing propagation is in the right family, but has no backjumping/conflict set and its all-different deletions do not maintain the claimed MAC invariant | First repair the propagation invariant; then ablate chronological backtracking against conflict-directed backjumping |
| [Botea, *Crossword Grid Composition with a Hierarchical CSP Encoding* (CP 2007)](https://www.cse.cuhk.edu.hk/~jlee/cp07Model/pdf/crossword.pdf) | Couples high-level word variables to low-level letter-cell variables with channeling constraints | The hierarchical representation solved more instances than the classical encoding in its experiments | Position/letter bitsets compactly encode much of the same support information, but there are no explicit cell variables, alternative viewpoint, or matching ablation | Compare current bitset MAC with a cell/slot channeling prototype on identical corpora; do not presume either is faster in TypeScript |
| [Ginsberg, *Dr.Fill: Crosswords and an Implemented Solver for Singly Weighted CSPs* (JAIR 2011)](https://arxiv.org/abs/1401.4597) | Weighted CSP for clue resolution using specialized variable/value heuristics, limited discrepancy search, partitioning, and postprocessing | Empirically rejected branch-and-bound for its setting; used heuristic-order trust plus controlled deviations and local repair | Current solver relies on DFS branch-and-bound with a loose upper bound and no local repair/decomposition | Benchmark improved limited discrepancy search (ILDS), bounded best-first search, and post-solution local repair against DFS—not as doctrine, but because candidate ranking is exactly the uncertain heuristic LDS exploits |
| [Rigutini et al., *Automatic Generation of Crossword Puzzles* (2012)](https://doi.org/10.1142/S0218213012500145) | WebCrow generation: information retrieval/NLP creates answer-definition material, then CSP compiles the grid | Establishes a clean semantic-content → validated entries → deterministic compilation split | Architectural intent matches, but current `intendedSense: web2:${word}` is a label, not resolved evidence; provenance is seed text rather than source-grounded sense/fact data | Add a licensed sense/fact layer before clue generation and make unsupported entries fail closed |
| [Botea & Bulitko, *Scaling Up Search with Partial Initial States in Optimization Crosswords* (SoCS 2021)](https://ojs.aaai.org/index.php/SOCS/article/view/18547) | Optimization search reuses the best partial assignment from failed high-target searches | Reusing promising partial states reduced time by orders of magnitude and solved more competition-level instances | Current attempts discard the whole search frontier/incumbent structure and simply rotate templates | Persist ranked partial fills and conflict summaries within an artifact/seed; use them to warm a relaxed target or alternate topology attempt |
| [Botea & Bulitko, *Tiered State Expansion in Optimization Crosswords* (AIIDE 2022)](https://ojs.aaai.org/index.php/AIIDE/article/view/21950) | Completeness-preserving split of domains into a preferred tier and deferred fallback tier | Many instances solved in about 1.2 minutes that otherwise timed out after four hours | Current DFS immediately enumerates every live value in score order | Split editorially strong/weak entries; explore a small strong tier now and defer the weak tier until propagation can shrink it. This maps unusually well to “common glue, but only when necessary” |
| [Botea & Bulitko, *Core Expansion in Optimization Crosswords* (SoCS 2023)](https://ojs.aaai.org/index.php/SOCS/article/view/27277) | Builds a high-value thematic core, places it as a seed, ranks seeds cheaply, then completes selected seeds | Advanced automatic topology results close to top human competition scores | Current theme locks blindly occupy the longest slots of a preselected template, without measuring crossability or joint feasibility | Generate several intersecting theme cores/placements, propagate each, score hardness + editorial promise, then spend full fill search only on the frontier |
| [Majima & Ishihara, *Generating News-Centric Crossword Puzzles as a Constraint Satisfaction and Optimization Problem* (CIKM 2023)](https://arxiv.org/abs/2308.04688) | Treats topic inclusion as an explicit target rate and measures feasibility/time as the target changes | Reported a sharp practical tradeoff: higher topic rates lower success and destabilize runtime | Current learner utility is blended word-by-word with no puzzle-level topic/exposure constraint or measured feasibility curve | Express personalization as bounded quotas/targets and learn a feasible operating region per day/topology rather than maximizing topicality |
| [Botea & Bulitko, *Generating High-Score Crosswords Puzzles With Bi-Objective, Stochastic and Systematic Search* (2025)](https://doi.org/10.1177/13896911251324363) | Extended thematic seeds, Pareto pairs, Monte Carlo ranking, genetic/stochastic portfolios, then systematic search/proofs | Current construction SOTA found in this review; hybrid search improves scores and can prove targets impossible on selected seeds | Current bank → one DFS fill → post-hoc scalar gate lacks seed diversity, Pareto structure, portfolio search, and proof metadata | Use a portfolio controller over theme cores/topologies/fills; retain a Pareto frontier and explicit optimality/gap/termination records |
| [Zinn et al., *Using GermaNet for the Generation of Crossword Puzzles* (KONVENS 2024)](https://aclanthology.org/2024.konvens-main.10/) | Lexical-semantic network supports German answer/clue generation; discusses LLM clue possibilities | Modern evidence for lexical resources as a controllable semantic substrate | Current lexicon is primarily surface/score/provenance; senses and relations are not first-class | Store sense IDs, semantic relations, register, locale, source facts, and clueability before asking an LLM to realize a clue |
| [Zeinalipour et al., *Harnessing LLMs for Educational Content-Driven Italian Crossword Generation* (CLiC-it 2024)](https://aclanthology.org/anthology-files/anthology-files/anthology-files/pdf/clicit/2024.clicit-1.110.pdf) | Fine-tunes small local models on answer/context/clue data; combines automatic overlap metrics with human A–E ratings | Shows local 7–8B clue models can improve with task data, while explicitly noting ROUGE does not measure semantic clue quality | Current clue path has no reference-grounded automatic checks, human rubric, calibration set, or batch-level style/difficulty evaluation | Create a multilingual clue-eval set and human rubric; use semantic/factual/leakage checks plus solver-calibrated difficulty, never ROUGE alone |
| [Bonomo et al., *Filling crosswords is very hard* (TCS 2024)](https://doi.org/10.1016/j.tcs.2023.114275) | Structural complexity analysis of fixed-grid fill | No-reuse keeps the problem NP-hard even under severe grid-graph restrictions | Confirms that a clever encoding will not remove worst-case hardness | Invest in instance selection, quality-aware pruning, portfolios, observability, and graceful anytime results rather than chasing a universal polynomial shortcut |

### 3.3 Technique-level verdict

| Technique | Evidence status | Fit for this product | Decision |
|---|---|---|---|
| Per-length bitset MAC | Strong engineering baseline; locally implemented | Excellent for browser-local fixed-grid fill | Keep and repair before replacing |
| CP-SAT / SAT rewrite | Mature general technology, but no evidence yet on this exact corpus/runtime | Useful as an offline oracle and comparison baseline; browser payload/runtime may be poor | Spike offline, not the default architecture |
| Exact cover / Algorithm X | Elegant for pure feasibility, awkward for weighted editorial/global constraints | Limited unless used for a simplified oracle | Do not lead with it |
| Régin all-different | Strong general propagation theory | May prune word reuse but matching cost could dominate huge sparse domains | Benchmark on hard cases after correctly queueing pairwise deletions |
| Conflict-directed backjumping/nogoods | Direct crossword evidence since 1990; broadly applicable | High potential because hard failures recur around the same crossings/theme locks | Add compact conflict instrumentation, then ablate |
| ILDS / tiered expansion | Direct crossword evidence and ideal when value ranking is useful but fallible | Very high fit for base quality + personalization ranking | Highest-priority search-policy experiment |
| Theme core/seed search | Direct 2023–2025 optimization-crossword SOTA | Very high fit for themes and personalized anchor vocabulary | Build after benchmark/quality foundations |
| Genetic search over full fills | Evidence for topology/seed portfolios, not a universal replacement for CSP | Useful above the deterministic fill engine, not inside every slot decision | Restrict to portfolio/topology layer |
| Learned proxy fitness | Demonstrated for expensive solver scoring | Promising only after enough trustworthy generated/human-rated data exists | Later; start with transparent features |
| LLM-generated answer bag | Recent educational systems support semantic generation, not hard validity | Good recall-expansion mechanism; bad authority | Batch, validate, resolve to senses, then admit to domains |
| LLM clue generation | Strong practical potential; evaluation remains the hard part | Required by product vision | Ground in sources/senses, generate ladders in batches, validate, calibrate with solvers + humans |

### 3.4 Comparison axes retained for every experiment

Every internal or external solver comparison must report:

| Axis | Questions |
|---|---|
| Representation | Slot CSP, cell CSP, exact cover, SAT, ILP/CP-SAT, neural policy, or hybrid? |
| Propagation | Forward checking, AC-3/MAC, generalized arc consistency, watched supports, nogoods? |
| Variable ordering | MRV, degree, impact/activity, theme-first, learned policy, limited discrepancy? |
| Value ordering | Frequency, editorial score, least-constraining value, lookahead, neural ranker? |
| Global constraints | All-different, roots, phrases, symmetry/topology, clueability, diversity? |
| Optimization | First feasible, branch-and-bound, weighted Max-CSP, Pareto/lexicographic, sampling? |
| Decomposition | Theme anchoring, connected-component/cutset decomposition, parallel portfolios? |
| Data/model role | Lexicon only, corpus priors, neural embeddings, LLM candidate/clue generation? |
| Evidence | Grid size, corpus, success rate, time/memory, quality/human judgment, reproducibility? |

### 3.5 Consequence for architecture

The recommended portfolio is not one monolithic “smart generator”:

```text
profile + day recipe + novelty ledger
                |
                v
semantic proposal model ---> licensed sense/fact resolver ---> eligible entry pool
                                                               |
                theme/core/topology frontier <-----------------+
                     |         |         |
                     v         v         v
                fill worker fill worker fill worker   (different seeds/policies)
                     \         |         /
                      Pareto + hard-gate judge
                               |
                         clue-ladder batch
                               |
                    factual/style/leakage judge
                               |
                     signed immutable manifest
```

The deterministic layer remains authoritative. The model proposes semantic material and wording; the search system selects among validated material; the judge records why a puzzle is publishable.

### 3.6 Editorial objective that can actually be searched

For each entry `i`, define a calibrated risk `r_i(x_i)` from lexical evidence: frequency/register, abbreviation/proper-name flags, source confidence, clueable senses, recent repetition, morphology, locale, and learned human ratings. Define crossing risk `n_ij` from the probability that both crossing entries are unknown or ambiguous to the target household—the generalized “Natick” failure.

Do not average these into oblivion. A practical lexicographic objective is:

```text
level 0 hard feasibility:
  crossings, normalization, source eligibility, uniqueness/root policy,
  theme requirements, safety, topology rules

level 1 hard editorial floors:
  max_i r_i <= R_day
  max_(i,j) n_ij <= N_day
  count_i[r_i > warning_day] <= B_day
  clueableSenseCount(x_i) >= 1

level 2 minimax quality:
  minimize max_i r_i

level 3 aggregate quality:
  minimize sum_i r_i + lambda_n * sum_(i,j) n_ij

level 4 experience:
  maximize themeInterest + learnerUtility + lexicalDiversity + wordplay

level 5 operational tie-break:
  minimize predicted search/clue cost
```

This encodes the editorial truth that one atrocious crossing can ruin a puzzle even when the average fill is good. The hard counts and additive lower bounds can be maintained during CSP search; minimax and aggregate levels support branch-and-bound or bounded Pareto search. Store the full component vector in the manifest.

### 3.7 User model: a vector space without creating an exam or filter bubble

A single topic vector is insufficient. Maintain local state with four distinct components:

```text
P_u(t) = {
  semantic_interest posterior: mean mu_u, uncertainty Sigma_u,
  lexical ability: theta_u over frequency/register/morphology/wordplay features,
  item memory: stability/difficulty/last exposure per lemma or sense,
  recent exposure: topic, entity, root, answer, clue-form histograms
}
```

For an answer/sense with semantic embedding `z_w`, an exploration-aware interest term can be:

```text
interest_u(w) = mu_u^T z_w + beta_t * sqrt(z_w^T Sigma_u z_w)
```

The first term exploits demonstrated interests; the second deliberately samples uncertain regions. It must sit behind puzzle-level diversity constraints, for example:

```text
topicShare_g(A) <= cap_g
entropy(topicHistogram(A)) >= H_day
duplicateRootDistance(A) >= d_min
generalInterestShare(A) >= rho_day
```

A determinantal-point-process or simpler maximum-marginal-relevance term can reward semantic spread:

```text
diversity(A) = log det(K_A + epsilon I)
```

but a transparent topic/root cap is the better first implementation. The goal is broad curiosity with personalized accents, not maximum cosine similarity to yesterday's behavior.

Model clue difficulty separately from answer selection. For clue variant `c`, estimate independent solve probability with an item-response model:

```text
P(solve c without crossings | u) = sigmoid(a_c * (theta_u - b_c))
P(solve c with k/l letters)      = sigmoid(a_c * (theta_u - b_c) + gamma * k/l)
```

Each weekday targets a distribution, not one number (e.g. some immediate footholds, a broad middle, a small stretch tail). Behavior recorded after many crossing letters is censored evidence and must update ability/memory less than an unaided answer. This formalizes the user's key insight: keep strong answers, then tune difficulty through clue variants.

### 3.8 Test specifications for the solver agents

These are required before sophisticated search work:

1. **Differential optimum oracle.** Generate tiny 2–7 slot CSPs with small domains; enumerate every assignment independently; assert solver feasibility, best score, all-different, locks, exclusions, and patterns exactly match. Include negative and tied-score cases.
2. **Arc-consistency invariant oracle.** Expose a test-only propagation trace or pure diagnostic. After every propagation fixed point, for every value in every live domain and every crossing arc, assert a supporting neighbor value exists. Add a three-slot witness where all-different deletion removes the last letter support in a slot not crossing the newly assigned slot.
3. **Anytime contract.** Force the same instance to terminate by exhaustion, first acceptable solution, cancellation, and node limit after an incumbent. Assert `terminationReason`, `provenOptimal`, final node count, bound, incumbent, and gap.
4. **Objective-alignment witness.** Construct two feasible fills where the higher blended-sum fill fails the editorial gate and the lower-sum fill passes. The application must return the publishable fill without rotating templates.
5. **Metamorphic checks.** Candidate order must not change optimum; increasing only one selected candidate score cannot lower optimal score; adding an exclusion/lock/pattern cannot enlarge the solution set; increasing a node budget cannot worsen the best incumbent under identical policy; renaming slot IDs cannot change feasibility.
6. **Root-family and duplicate tests.** Explicitly cover exact duplicates, case normalization, inflectional/root families, repeated multiword surfaces, and theme-exception policy.
7. **Quality decomposition tests.** Prove every component's declared dependence: topology-only features do not masquerade as fill quality; every accepted topology yields checked share `1`; a single worst-entry/Natick violation fails regardless of average score.
8. **Heuristic ablation harness.** On a fixed corpus/hash/seed matrix record success, wall time, CPU time, nodes, revisions, deletions, backtracks, peak bytes, incumbent quality over time, final bound/gap, and energy proxy. Compare medians and tail quantiles, not one run.
9. **Personalization replay simulator.** Generate/replay learner histories; test exploration coverage, topic entropy, repetition, solve-probability calibration, regret, and non-collapse when one topic receives many fast solves.
10. **Clue evaluation.** For every clue-answer-sense tuple test answer leakage/morphology, enumeration, factual entailment to licensed evidence, ambiguity, duplicate clue forms, and solver-estimated difficulty. Maintain blinded human ratings as the calibration target.

### 3.9 Mutation-testing interpretation

The report written at 2026-09-03 17:19 contains 656 `csp.ts` mutants: 455 killed, 29 timed out, 152 survived, and 20 uncovered. That is `73.78%` detected over all mutants (`76.10%` when uncovered mutants are removed), so the configured `70%` floor passes. This is a baseline, not confidence in solver correctness.

Survivors occur in request validation, bitset loops, propagation queue behavior, assignment checks, upper-bound construction, and result control flow—the exact places on which correctness and the mathematical claims depend. Timeouts are counted as detected but may only expose performance sensitivity. Required policy:

- triage by invariant/risk, not by chasing a percentage;
- convert the differential, arc-consistency, and anytime specs above into killers first;
- give timeout mutants a longer focused rerun before crediting them;
- mutate `quality.ts`, `adaptive.ts`, and the application publish gate in separate fast campaigns;
- remove the stale mutation-profile reference to the deleted `fillFeasibility.test.ts`;
- ratchet thresholds per package only after equivalent mutants are narrowly documented.

## 4. Immediate mathematical review questions

1. Does per-length indexing reduce only memory, or also improve cache behavior measurably on the 15×15 corpus?
2. Is propagation truly MAC after every assignment and all-different deletion, or can unsupported values survive until deeper search?
3. Is all-different enforced as pairwise deletion only, or would a Régin-style global constraint produce meaningful pruning at crossword domain sizes?
4. Does the upper bound sum the best remaining slot scores without accounting for word uniqueness/crossing incompatibility, making branch-and-bound too weak?
5. Are score scales calibrated across lengths and sources, or does a grid with more short answers win mechanically?
6. Does first-publishable stopping hide much better fills one branch away?
7. Can topology hardness be estimated cheaply from domain entropy, arc tightness, and early propagation loss?
8. Which cutsets/theme anchors split the constraint graph enough for parallel subsearch?
9. Can failed attempts emit reusable nogoods keyed by template + artifact hashes?
10. How should profile utility be regularized so personalization preserves surprise and broad word intelligence?

## 5. Ordered agent work packages

| Order | Work package | Deliverable |
|---:|---|---|
| 0A | Real-boundary correction | Every constructable day passes through the real broker with a fake adapter; length batching/topology selection is explicit |
| 0B | Model-influence contract | Validated semantics have a bounded, test-visible role on ordinary days; model proposals are neither inert nor hard-constraint authority |
| 0C | Objective alignment | Incremental publish constraints and lexicographic quality replace post-hoc rejection of a differently optimized incumbent |
| 1 | Solver correctness/telemetry | Repair all-different propagation; report termination, optimality, nodes, bound, gap, revisions, deletions, backtracks, depth, time, and bytes |
| 2 | Reproducible benchmark corpus | Public/provenance-clean templates, fixed lexicon hashes, seeds, budgets, machines, and JSONL results |
| 3 | Search-policy ablation | DFS baseline vs tiered expansion/ILDS, live-domain bounds, partial-state reuse, backjumping/nogoods, and portfolios |
| 4 | Theme/core frontier | Multiple crossable theme cores and placements ranked by editorial value, propagation hardness, and diversity |
| 5 | Diverse top-k/Pareto search | Return multiple materially different valid fills with component vectors under a wall-clock budget |
| 6 | Alternative encoding spike | Hierarchical CSP and CP-SAT/SAT comparison on the same fixed-grid corpus; exact cover only as a narrow oracle |
| 7 | Semantic/clue layer | Licensed sense/fact records, batched clue ladders, constrained weekday selection, factual/leakage/style judges |
| 8 | Personalization simulation | Synthetic/replayed histories, novelty/diversity constraints, calibration, exploration coverage, and regret |

## 6. Evidence ledger

| Evidence | Status |
|---|---|
| Current commit/dirty-tree inventory | Recorded across `3ea7d72`–`4b137c0` + uncommitted work; moving-tree caveat applies |
| Current CSP source audit | Complete for search/index/propagation/result semantics |
| Current construction/application audit | Complete for fill objective, quality gate, and learner blend |
| Published-method primary sources | Complete for the decision set (1990–2025); links embedded in §3 |
| Local benchmark baseline | Partial only: perf gate passed on three fixtures (`8.158 s/159 nodes`, `2.062 s/5,896`, `2.474 s/2,468`); insufficient sample size and node metric is incomplete |
| Heuristic/encoding comparison | Not run yet |
| 0A real-boundary correction | CLOSED 2026-09-03: topology selected before the bag; target lengths paged in batches of <= 8 (MAX_TARGET_LENGTHS honored); constructPuzzle.broker.test.ts runs EVERY constructable day through createModelBroker around the fake adapter — all 6 pass; also caught + fixed the missing-length-class CSP crash |
| 0C objective alignment (minimal form) | CLOSED 2026-09-03: poorEntryFloor/poorEntryLimit enforce a hard bad-entry budget during search; objective-alignment witness (3.8 spec 4) proves the constraint dominates the raw sum; recipe budgets set per day |
| 1 solver telemetry (partial) | CLOSED 2026-09-03: termination + provenOptimal on FillResult (exhausted/satisfied/cancelled/node-limit/unsatisfiable); anytime contract test (3.8 spec 3). Still open: revisions/deletions/backtracks/depth/bytes counters, bestBound/gap |
| 1 all-different worklist repair | OPEN - deletions from all-different do not yet seed the propagation worklist (review 2.2) |
| Archive judge evidence | Monday 40/40, Tuesday 40/40, Wednesday 39/40, Thursday 39/40 sampled masks solve with the lab lexicon; Friday/Saturday/Sunday re-judging at a reduced node budget in progress |

## 7. Rules for implementation agents

- Never optimize against one convenient template or one seed.
- Record every benchmark's commit, artifact hashes, machine/runtime, seed, time, node budget, and outcome.
- Separate feasibility metrics from editorial quality metrics.
- Treat timeouts/cancellations/resource limits as distinct outcomes, not “unsatisfiable.”
- Do not add an advanced technique without an ablation against the current MAC baseline.
- Prefer a small proven improvement in success-rate/quality per joule over a fashionable solver rewrite.
- Keep LLM output outside hard-constraint authority and validate every surface/sense/clue independently.
