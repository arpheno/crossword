//! Pure fixed-topology crossword fill search.
//!
//! This crate deliberately knows nothing about browsers, clocks, threads, or
//! JavaScript. The public request/result types are the Fill Contract v1 wire
//! model; `FillSolver::step` provides the coarse cooperative boundary needed
//! by the Wasm adapter.

use std::cmp::Ordering;
use std::collections::{HashMap, VecDeque};

use serde::{Deserialize, Serialize};

pub const CONTRACT_VERSION: &str = "fill-v1";
pub const DEFAULT_MAX_NODES: u64 = 50_000;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FillSlot {
    pub id: String,
    pub length: usize,
    #[serde(default)]
    pub pattern: Option<String>,
    #[serde(default)]
    pub importance: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FillIntersection {
    pub slot_id: String,
    pub position: usize,
    pub other_slot_id: String,
    pub other_position: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FillCandidate {
    pub word: String,
    pub score: f64,
    #[serde(default)]
    pub quality_score: Option<f64>,
    pub lexeme_id: String,
    #[serde(default)]
    pub sense_id: Option<String>,
    pub source_ids: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FillRequest {
    pub slots: Vec<FillSlot>,
    pub intersections: Vec<FillIntersection>,
    pub candidates: Vec<FillCandidate>,
    #[serde(default)]
    pub locked_words: HashMap<String, String>,
    #[serde(default)]
    pub seed: Option<i64>,
    #[serde(default)]
    pub max_nodes: Option<u64>,
    #[serde(default)]
    pub minimum_assignment_score: Option<f64>,
    #[serde(default)]
    pub poor_entry_floor: Option<f64>,
    #[serde(default)]
    pub poor_entry_limit: Option<usize>,
    #[serde(default)]
    pub excluded_words: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FillProgress {
    #[serde(rename = "type")]
    pub kind: String,
    pub nodes: u64,
    pub assigned: usize,
    pub open_slots: usize,
    pub best_score: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FillSolution {
    pub assignments: HashMap<String, FillCandidate>,
    pub score: f64,
    pub nodes: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum FillFailureCode {
    Unsatisfiable,
    Cancelled,
    ResourceLimit,
    InvalidRequest,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum FillTermination {
    Exhausted,
    Satisfied,
    Cancelled,
    NodeLimit,
    Unsatisfiable,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FillFailure {
    pub code: FillFailureCode,
    pub message: String,
    pub nodes: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FillResult {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub solution: Option<FillSolution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure: Option<FillFailure>,
    pub termination: FillTermination,
    pub termination_reason: FillTermination,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proven_optimal: Option<bool>,
    pub nodes_explored: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub best_bound: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gap: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
struct PositionKey {
    length: usize,
    position: usize,
    letter: u8,
}

#[derive(Clone, Debug)]
struct IndexedCandidate {
    candidate: FillCandidate,
    normalized_word: String,
    index: usize,
}

#[derive(Clone, Debug)]
struct LengthClass {
    global_by_local: Vec<usize>,
    local_by_global: HashMap<usize, usize>,
    words: usize,
}

#[derive(Clone, Debug)]
struct IndexedIntersection {
    left: usize,
    left_position: usize,
    right: usize,
    right_position: usize,
}

#[derive(Clone, Debug)]
struct IndexedRequest {
    slots: Vec<FillSlot>,
    intersections_by_slot: Vec<Vec<IndexedIntersection>>,
    candidates: Vec<IndexedCandidate>,
    length_classes: HashMap<usize, LengthClass>,
    position_bits: HashMap<PositionKey, Vec<u32>>,
    candidate_index_by_word: HashMap<String, usize>,
    score_by_index: Vec<f64>,
    quality_score_by_index: Vec<f64>,
    best_score_by_length: HashMap<usize, f64>,
}

#[derive(Clone, Debug)]
struct TrailEntry {
    slot_index: usize,
    word_index: usize,
    previous: u32,
}

#[derive(Clone, Debug)]
struct SearchState {
    domains: Vec<Vec<u32>>,
    sizes: Vec<usize>,
    assignments: Vec<Option<usize>>,
    trail: Vec<TrailEntry>,
    nodes: u64,
    score: f64,
    poor_entries: usize,
    cancelled: bool,
    over_budget: bool,
    satisfied: bool,
    best: Option<FillSolution>,
    best_score: f64,
}

#[derive(Clone, Debug)]
struct SearchFrame {
    slot_index: usize,
    next_word_index: usize,
    remaining_bits: u32,
    trail_base: usize,
    score_before: f64,
    poor_before: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub enum StepResult {
    Running(FillProgress),
    Finished(FillResult),
}

/// A deterministic, resumable search. Each call to `step` may enter at most
/// `node_budget` additional search states and never calls into its host.
pub struct FillSolver {
    index: IndexedRequest,
    request: FillRequest,
    state: SearchState,
    stack: Vec<SearchFrame>,
    enter_next: bool,
    restore_pending: bool,
    started: bool,
    done: bool,
}

impl FillSolver {
    /// Build and initially propagate a request. Invalid/empty requests are
    /// returned as typed results rather than panics.
    pub fn new(request: FillRequest) -> Result<Self, Box<FillResult>> {
        let index = match create_index(&request) {
            Ok(index) => index,
            Err(failure) => {
                return Err(Box::new(failure_result(
                    failure,
                    FillTermination::Unsatisfiable,
                )));
            }
        };
        let state = match build_initial_state(&index, &request) {
            Ok(state) => state,
            Err(failure) => {
                return Err(Box::new(failure_result(
                    failure,
                    FillTermination::Unsatisfiable,
                )));
            }
        };
        Ok(Self {
            index,
            request,
            state,
            stack: Vec::new(),
            enter_next: true,
            restore_pending: false,
            started: false,
            done: false,
        })
    }

    pub fn cancel(&mut self) {
        self.state.cancelled = true;
    }

    pub fn is_done(&self) -> bool {
        self.done
    }

    pub fn step(&mut self, node_budget: u64) -> StepResult {
        if self.done {
            return StepResult::Finished(self.result());
        }
        let budget = node_budget.max(1);
        let step_end = self.state.nodes.saturating_add(budget);

        loop {
            if self.state.cancelled {
                self.done = true;
                return StepResult::Finished(self.result());
            }
            if self.state.nodes >= self.request.max_nodes.unwrap_or(DEFAULT_MAX_NODES) {
                self.state.over_budget = true;
                self.done = true;
                return StepResult::Finished(self.result());
            }
            if self.state.nodes >= step_end {
                return StepResult::Running(self.progress());
            }

            if self.restore_pending {
                self.restore_child();
                self.restore_pending = false;
            }

            if self.enter_next {
                self.started = true;
                self.state.nodes += 1;
                if self.state.best.is_some()
                    && self.state.score + remaining_score_upper_bound(&self.index, &self.state)
                        <= self.state.best_score
                {
                    self.restore_pending = true;
                    self.enter_next = false;
                    continue;
                }
                let slot_index = select_slot(&self.index, &self.state);
                if slot_index < 0 {
                    self.record_leaf();
                    self.enter_next = false;
                    if self.state.satisfied {
                        self.done = true;
                        return StepResult::Finished(self.result());
                    }
                    self.restore_pending = true;
                    continue;
                }
                self.stack.push(SearchFrame {
                    slot_index: slot_index as usize,
                    next_word_index: 0,
                    remaining_bits: 0,
                    trail_base: self.state.trail.len(),
                    score_before: self.state.score,
                    poor_before: self.state.poor_entries,
                });
                self.enter_next = false;
            }

            let Some(frame_index) = self.stack.len().checked_sub(1) else {
                if self.started {
                    self.done = true;
                    return StepResult::Finished(self.result());
                }
                continue;
            };

            let candidate_index =
                match next_candidate(&self.index, &self.state, &mut self.stack[frame_index]) {
                    Some(candidate_index) => candidate_index,
                    None => {
                        let frame = match self.stack.pop() {
                            Some(frame) => frame,
                            None => continue,
                        };
                        self.restore_frame(&frame);
                        if self.stack.is_empty() {
                            self.done = true;
                            return StepResult::Finished(self.result());
                        }
                        continue;
                    }
                };

            let frame = self.stack[frame_index].clone();
            if self.try_candidate(&frame, candidate_index) {
                self.enter_next = true;
            } else {
                self.restore_frame(&frame);
            }
        }
    }

    pub fn finish(&mut self) -> FillResult {
        while !self.done {
            let _ = self.step(DEFAULT_MAX_NODES);
        }
        self.result()
    }

    fn try_candidate(&mut self, frame: &SearchFrame, candidate_index: usize) -> bool {
        let slot_index = frame.slot_index;
        let slot_length = match self.index.slots.get(slot_index) {
            Some(slot) => slot.length,
            None => return false,
        };
        let class = match self.index.length_classes.get(&slot_length) {
            Some(class) => class,
            None => return false,
        };
        let local_index = match class.local_by_global.get(&candidate_index) {
            Some(local_index) => *local_index,
            None => return false,
        };
        let word_index = local_index / 32;
        let bit = 1u32 << (local_index % 32);
        self.state.assignments[slot_index] = Some(candidate_index);
        if let Some(domain) = self.state.domains.get(slot_index).cloned() {
            for (index, current) in domain.iter().copied().enumerate() {
                let keep = if index == word_index { bit } else { 0 };
                remove_word_bits(&mut self.state, slot_index, index, current & !keep);
            }
        }

        let mut seeds = vec![slot_index];
        let mut viable = true;
        for other in 0..self.index.slots.len() {
            if other == slot_index {
                continue;
            }
            if self.index.slots[other].length != slot_length {
                continue;
            }
            let changed = remove_single_bit(&mut self.state, other, local_index);
            if changed && self.state.assignments[other].is_none() {
                seeds.push(other);
            }
            if self.state.sizes[other] == 0 {
                viable = false;
                break;
            }
        }
        if viable {
            viable = propagate_from(&self.index, &mut self.state, &seeds);
        }
        if !viable {
            return false;
        }

        let is_poor = self
            .request
            .poor_entry_floor
            .is_some_and(|floor| self.index.quality_score_by_index[candidate_index] < floor);
        if self
            .request
            .poor_entry_limit
            .is_some_and(|limit| self.state.poor_entries + if is_poor { 1 } else { 0 } > limit)
        {
            return false;
        }
        self.state.score += self.index.score_by_index[candidate_index];
        self.state.poor_entries += if is_poor { 1 } else { 0 };
        true
    }

    fn restore_child(&mut self) {
        let Some(frame) = self.stack.last().cloned() else {
            return;
        };
        self.restore_frame(&frame);
    }

    fn restore_frame(&mut self, frame: &SearchFrame) {
        self.state.assignments[frame.slot_index] = None;
        self.state.score = frame.score_before;
        self.state.poor_entries = frame.poor_before;
        undo_trail(&mut self.state, frame.trail_base);
    }

    fn record_leaf(&mut self) {
        let minimum = self
            .request
            .minimum_assignment_score
            .unwrap_or(f64::NEG_INFINITY);
        if self.state.score < minimum {
            return;
        }
        let mut assignments = HashMap::new();
        for (slot_index, assignment) in self.state.assignments.iter().enumerate() {
            let Some(candidate_index) = assignment else {
                return;
            };
            let Some(slot) = self.index.slots.get(slot_index) else {
                return;
            };
            let Some(candidate) = self.index.candidates.get(*candidate_index) else {
                return;
            };
            assignments.insert(slot.id.clone(), candidate.candidate.clone());
        }
        if self.state.best.is_none() || self.state.score > self.state.best_score {
            self.state.best_score = self.state.score;
            self.state.best = Some(FillSolution {
                assignments,
                score: self.state.score,
                nodes: self.state.nodes,
            });
        }
        if self.request.minimum_assignment_score.is_some() {
            self.state.satisfied = true;
        }
    }

    fn progress(&self) -> FillProgress {
        let assigned = self
            .state
            .assignments
            .iter()
            .filter(|value| value.is_some())
            .count();
        FillProgress {
            kind: "progress".to_string(),
            nodes: self.state.nodes,
            assigned,
            open_slots: self.index.slots.len().saturating_sub(assigned),
            best_score: self.state.best_score,
        }
    }

    fn result(&self) -> FillResult {
        if let Some(solution) = self.state.best.clone() {
            let termination = if self.state.cancelled {
                FillTermination::Cancelled
            } else if self.state.over_budget {
                FillTermination::NodeLimit
            } else if self.state.satisfied {
                FillTermination::Satisfied
            } else {
                FillTermination::Exhausted
            };
            let bound = if matches!(
                termination,
                FillTermination::Exhausted | FillTermination::Satisfied
            ) {
                solution.score
            } else {
                Some(self.state.score + remaining_score_upper_bound(&self.index, &self.state))
                    .filter(|value| value.is_finite())
                    .unwrap_or(solution.score)
            };
            return FillResult {
                status: "solved".to_string(),
                solution: Some(solution.clone()),
                failure: None,
                termination: termination.clone(),
                termination_reason: termination.clone(),
                proven_optimal: Some(termination == FillTermination::Exhausted),
                nodes_explored: self.state.nodes,
                best_bound: Some(bound),
                gap: Some((bound - solution.score).max(0.0)),
            };
        }
        let termination = if self.state.cancelled {
            FillTermination::Cancelled
        } else if self.state.over_budget {
            FillTermination::NodeLimit
        } else {
            FillTermination::Unsatisfiable
        };
        let failure = if self.state.cancelled {
            FillFailure {
                code: FillFailureCode::Cancelled,
                message: "Fill search cancelled".to_string(),
                nodes: self.state.nodes,
            }
        } else if self.state.over_budget {
            FillFailure {
                code: FillFailureCode::ResourceLimit,
                message: "Fill search reached its node budget".to_string(),
                nodes: self.state.nodes,
            }
        } else {
            FillFailure {
                code: FillFailureCode::Unsatisfiable,
                message: "No valid fill satisfies the constraints".to_string(),
                nodes: self.state.nodes,
            }
        };
        FillResult {
            status: "failed".to_string(),
            solution: None,
            failure: Some(failure),
            termination: termination.clone(),
            termination_reason: termination,
            proven_optimal: None,
            nodes_explored: self.state.nodes,
            best_bound: None,
            gap: None,
        }
    }
}

pub fn solve_fill(request: FillRequest) -> FillResult {
    match FillSolver::new(request) {
        Ok(mut solver) => solver.finish(),
        Err(result) => *result,
    }
}

fn failure_result(failure: FillFailure, termination: FillTermination) -> FillResult {
    FillResult {
        status: "failed".to_string(),
        solution: None,
        failure: Some(failure),
        termination: termination.clone(),
        termination_reason: termination,
        proven_optimal: None,
        nodes_explored: 0,
        best_bound: None,
        gap: None,
    }
}

fn invalid(message: impl Into<String>) -> FillFailure {
    FillFailure {
        code: FillFailureCode::InvalidRequest,
        message: message.into(),
        nodes: 0,
    }
}

fn unsatisfiable(message: impl Into<String>) -> FillFailure {
    FillFailure {
        code: FillFailureCode::Unsatisfiable,
        message: message.into(),
        nodes: 0,
    }
}

fn normalize_word(value: &str) -> Option<String> {
    let normalized = value.trim().to_ascii_uppercase();
    if normalized.is_empty() || !normalized.bytes().all(|byte| byte.is_ascii_uppercase()) {
        return None;
    }
    Some(normalized)
}

fn seeded_tie_break(seed: i64, value: &str) -> u32 {
    let mut hash = (seed as u32) ^ 0x9e37_79b9;
    for byte in value.bytes() {
        hash ^= u32::from(byte);
        hash = hash.wrapping_mul(16_777_619);
    }
    hash
}

fn create_index(request: &FillRequest) -> Result<IndexedRequest, FillFailure> {
    let mut slot_index_by_id = HashMap::new();
    for (index, slot) in request.slots.iter().enumerate() {
        if slot.id.is_empty()
            || slot.length == 0
            || slot.pattern.as_ref().is_some_and(|pattern| {
                pattern.len() != slot.length
                    || !pattern
                        .bytes()
                        .all(|byte| byte == b'.' || byte.is_ascii_uppercase())
            })
            || slot_index_by_id.insert(slot.id.clone(), index).is_some()
        {
            return Err(invalid(format!("Invalid fill slot: {}", slot.id)));
        }
    }
    if request.slots.is_empty() {
        return Err(invalid("Fill request has no slots"));
    }

    for (slot_id, word) in &request.locked_words {
        let Some(slot_index) = slot_index_by_id.get(slot_id) else {
            return Err(invalid(format!("Lock references unknown slot: {slot_id}")));
        };
        let Some(normalized) = normalize_word(word) else {
            return Err(invalid(format!("Lock for slot {slot_id} is not a word")));
        };
        if normalized.len() != request.slots[*slot_index].length {
            return Err(invalid(format!(
                "Lock for slot {slot_id} is not a {}-letter word",
                request.slots[*slot_index].length
            )));
        }
    }

    let excluded: std::collections::HashSet<String> = request
        .excluded_words
        .iter()
        .map(|word| word.trim().to_ascii_uppercase())
        .collect();
    let mut candidates = Vec::new();
    let mut candidate_index_by_word = HashMap::new();
    let mut register = |candidate: FillCandidate| {
        let Some(normalized_word) = normalize_word(&candidate.word) else {
            return;
        };
        if excluded.contains(&normalized_word)
            || !candidate.score.is_finite()
            || candidate
                .quality_score
                .is_some_and(|value| !value.is_finite())
            || candidate.lexeme_id.is_empty()
            || candidate.source_ids.is_empty()
            || candidate.source_ids.iter().any(String::is_empty)
            || candidate_index_by_word.contains_key(&normalized_word)
        {
            return;
        }
        let index = candidates.len();
        candidate_index_by_word.insert(normalized_word.clone(), index);
        candidates.push(IndexedCandidate {
            candidate,
            normalized_word,
            index,
        });
    };
    for candidate in request.candidates.iter().cloned() {
        register(candidate);
    }
    for (slot_id, word) in &request.locked_words {
        register(FillCandidate {
            word: word.clone(),
            score: 1.0,
            quality_score: None,
            lexeme_id: format!("lock:{slot_id}:{}", word.trim().to_ascii_uppercase()),
            sense_id: None,
            source_ids: vec![format!("theme-lock:{slot_id}")],
            tags: Vec::new(),
        });
    }
    if candidates.is_empty() {
        return Err(unsatisfiable("No eligible candidates remain"));
    }

    let seed = request.seed.unwrap_or(0);
    candidates.sort_by(|left, right| {
        right
            .candidate
            .score
            .partial_cmp(&left.candidate.score)
            .unwrap_or(Ordering::Equal)
            .then_with(|| {
                seeded_tie_break(seed, &left.normalized_word)
                    .cmp(&seeded_tie_break(seed, &right.normalized_word))
            })
            .then_with(|| left.normalized_word.cmp(&right.normalized_word))
    });
    candidate_index_by_word.clear();
    for (index, candidate) in candidates.iter_mut().enumerate() {
        candidate.index = index;
        candidate_index_by_word.insert(candidate.normalized_word.clone(), index);
    }

    let mut length_classes = HashMap::new();
    let mut global_by_length: HashMap<usize, Vec<usize>> = HashMap::new();
    for candidate in &candidates {
        global_by_length
            .entry(candidate.normalized_word.len())
            .or_default()
            .push(candidate.index);
    }
    for (length, mut global_by_local) in global_by_length {
        global_by_local.sort_unstable();
        let local_by_global = global_by_local
            .iter()
            .enumerate()
            .map(|(local, global)| (*global, local))
            .collect::<HashMap<_, _>>();
        length_classes.insert(
            length,
            LengthClass {
                words: global_by_local.len().div_ceil(32),
                global_by_local,
                local_by_global,
            },
        );
    }
    for slot in &request.slots {
        if !length_classes.contains_key(&slot.length) {
            return Err(unsatisfiable(format!(
                "No candidates of length {} for slot {}",
                slot.length, slot.id
            )));
        }
    }

    let mut position_bits = HashMap::new();
    for candidate in &candidates {
        let Some(class) = length_classes.get(&candidate.normalized_word.len()) else {
            return Err(invalid("Candidate length index is inconsistent"));
        };
        let Some(local_index) = class.local_by_global.get(&candidate.index) else {
            return Err(invalid("Candidate local index is inconsistent"));
        };
        for (position, letter) in candidate.normalized_word.bytes().enumerate() {
            let key = PositionKey {
                length: candidate.normalized_word.len(),
                position,
                letter,
            };
            let bits = position_bits
                .entry(key)
                .or_insert_with(|| vec![0; class.words]);
            if let Some(word) = bits.get_mut(*local_index / 32) {
                *word |= 1u32 << (*local_index % 32);
            }
        }
    }

    let mut intersections_by_slot = vec![Vec::new(); request.slots.len()];
    for intersection in &request.intersections {
        let Some(&left) = slot_index_by_id.get(&intersection.slot_id) else {
            return Err(invalid("Intersection references an unknown slot"));
        };
        let Some(&right) = slot_index_by_id.get(&intersection.other_slot_id) else {
            return Err(invalid("Intersection references an unknown slot"));
        };
        if left == right
            || intersection.position >= request.slots[left].length
            || intersection.other_position >= request.slots[right].length
        {
            return Err(invalid("Intersection references an invalid slot position"));
        }
        let indexed = IndexedIntersection {
            left,
            left_position: intersection.position,
            right,
            right_position: intersection.other_position,
        };
        intersections_by_slot[left].push(indexed.clone());
        intersections_by_slot[right].push(indexed);
    }

    let mut score_by_index = vec![0.0; candidates.len()];
    let mut quality_score_by_index = vec![0.0; candidates.len()];
    let mut best_score_by_length = HashMap::new();
    for candidate in &candidates {
        score_by_index[candidate.index] = candidate.candidate.score;
        quality_score_by_index[candidate.index] = candidate
            .candidate
            .quality_score
            .unwrap_or(candidate.candidate.score);
        best_score_by_length
            .entry(candidate.normalized_word.len())
            .and_modify(|best: &mut f64| *best = best.max(candidate.candidate.score))
            .or_insert(candidate.candidate.score);
    }
    Ok(IndexedRequest {
        slots: request.slots.clone(),
        intersections_by_slot,
        candidates,
        length_classes,
        position_bits,
        candidate_index_by_word,
        score_by_index,
        quality_score_by_index,
        best_score_by_length,
    })
}

fn build_initial_state(
    index: &IndexedRequest,
    request: &FillRequest,
) -> Result<SearchState, FillFailure> {
    let mut domains = Vec::new();
    for slot in &request.slots {
        let Some(class) = index.length_classes.get(&slot.length) else {
            return Err(unsatisfiable(format!("No candidates for slot {}", slot.id)));
        };
        let mut domain = vec![0; class.words];
        if let Some(lock_word) = request.locked_words.get(&slot.id) {
            let Some(normalized) = normalize_word(lock_word) else {
                return Err(invalid(format!("Invalid lock for slot {}", slot.id)));
            };
            let Some(&global) = index.candidate_index_by_word.get(&normalized) else {
                return Err(unsatisfiable(format!(
                    "Lock for slot {} has no candidate",
                    slot.id
                )));
            };
            let Some(&local) = class.local_by_global.get(&global) else {
                return Err(unsatisfiable(format!(
                    "Lock for slot {} has no candidate",
                    slot.id
                )));
            };
            domain[local / 32] |= 1u32 << (local % 32);
        } else {
            for (local, global) in class.global_by_local.iter().enumerate() {
                let Some(candidate) = index.candidates.get(*global) else {
                    continue;
                };
                let matches_pattern = slot.pattern.as_ref().is_none_or(|pattern| {
                    pattern.bytes().enumerate().all(|(position, letter)| {
                        letter == b'.'
                            || candidate.normalized_word.as_bytes().get(position) == Some(&letter)
                    })
                });
                if matches_pattern {
                    domain[local / 32] |= 1u32 << (local % 32);
                }
            }
        }
        domains.push(domain);
    }
    let sizes: Vec<usize> = domains
        .iter()
        .map(|domain| domain.iter().map(|word| word.count_ones() as usize).sum())
        .collect();
    if sizes.contains(&0) {
        return Err(unsatisfiable("Initial slot pattern has an empty domain"));
    }
    let mut state = SearchState {
        domains,
        sizes,
        assignments: vec![None; request.slots.len()],
        trail: Vec::new(),
        nodes: 0,
        score: 0.0,
        poor_entries: 0,
        cancelled: false,
        over_budget: false,
        satisfied: false,
        best: None,
        best_score: f64::NEG_INFINITY,
    };
    let seeds = (0..request.slots.len()).collect::<Vec<_>>();
    if !propagate_from(index, &mut state, &seeds) {
        return Err(unsatisfiable(
            "Initial crossing constraints have no solution",
        ));
    }
    Ok(state)
}

fn next_candidate(
    index: &IndexedRequest,
    state: &SearchState,
    frame: &mut SearchFrame,
) -> Option<usize> {
    let domain = state.domains.get(frame.slot_index)?;
    while frame.remaining_bits == 0 {
        if frame.next_word_index >= domain.len() {
            return None;
        }
        frame.remaining_bits = domain[frame.next_word_index];
        frame.next_word_index += 1;
    }
    let local_offset = frame.remaining_bits.trailing_zeros() as usize;
    frame.remaining_bits &= frame.remaining_bits - 1;
    let local_index = (frame.next_word_index - 1) * 32 + local_offset;
    let class = index
        .length_classes
        .get(&index.slots[frame.slot_index].length)?;
    class.global_by_local.get(local_index).copied()
}

fn compatible_bits(
    index: &IndexedRequest,
    source_length: usize,
    target_length: usize,
    target_position: usize,
    source_position: usize,
    source: &[u32],
) -> Vec<u32> {
    let Some(target_class) = index.length_classes.get(&target_length) else {
        return Vec::new();
    };
    let mut result = vec![0; target_class.words];
    for letter in b'A'..=b'Z' {
        let source_key = PositionKey {
            length: source_length,
            position: source_position,
            letter,
        };
        let Some(source_bits) = index.position_bits.get(&source_key) else {
            continue;
        };
        if !source
            .iter()
            .zip(source_bits)
            .any(|(left, right)| left & right != 0)
        {
            continue;
        }
        let target_key = PositionKey {
            length: target_length,
            position: target_position,
            letter,
        };
        let Some(allowed) = index.position_bits.get(&target_key) else {
            continue;
        };
        for (destination, source) in result.iter_mut().zip(allowed) {
            *destination |= *source;
        }
    }
    result
}

fn propagate_from(index: &IndexedRequest, state: &mut SearchState, seeds: &[usize]) -> bool {
    let mut queued = vec![false; index.slots.len()];
    let mut queue = VecDeque::new();
    for seed in seeds {
        if *seed < queued.len() && !queued[*seed] {
            queued[*seed] = true;
            queue.push_back(*seed);
        }
    }
    while let Some(slot_index) = queue.pop_front() {
        queued[slot_index] = false;
        if state.sizes[slot_index] == 0 {
            return false;
        }
        let slot = &index.slots[slot_index];
        for intersection in &index.intersections_by_slot[slot_index] {
            let is_left = intersection.left == slot_index;
            let other = if is_left {
                intersection.right
            } else {
                intersection.left
            };
            if state.assignments[other].is_some() {
                continue;
            }
            let source_position = if is_left {
                intersection.left_position
            } else {
                intersection.right_position
            };
            let target_position = if is_left {
                intersection.right_position
            } else {
                intersection.left_position
            };
            let allowed = compatible_bits(
                index,
                slot.length,
                index.slots[other].length,
                target_position,
                source_position,
                &state.domains[slot_index],
            );
            let current = state.domains[other].clone();
            let mut changed = false;
            for (word_index, current_word) in current.iter().copied().enumerate() {
                let allowed_word = allowed.get(word_index).copied().unwrap_or(0);
                let removed = current_word & !allowed_word;
                if removed != 0 {
                    remove_word_bits(state, other, word_index, removed);
                    changed = true;
                }
            }
            if state.sizes[other] == 0 {
                return false;
            }
            if changed && !queued[other] {
                queued[other] = true;
                queue.push_back(other);
            }
        }
    }
    true
}

fn pressure_of(index: &IndexedRequest, slot_index: usize) -> usize {
    index.intersections_by_slot[slot_index].len()
}

fn select_slot(index: &IndexedRequest, state: &SearchState) -> isize {
    let mut best: Option<usize> = None;
    for slot_index in 0..index.slots.len() {
        if state.assignments[slot_index].is_some() {
            continue;
        }
        let replace = best.is_none_or(|current| {
            state.sizes[slot_index] < state.sizes[current]
                || (state.sizes[slot_index] == state.sizes[current]
                    && pressure_of(index, slot_index) > pressure_of(index, current))
        });
        if replace {
            best = Some(slot_index);
            if state.sizes[slot_index] == 1 {
                break;
            }
        }
    }
    best.map_or(-1, |value| value as isize)
}

fn remaining_score_upper_bound(index: &IndexedRequest, state: &SearchState) -> f64 {
    let mut bound = 0.0;
    for (slot_index, slot) in index.slots.iter().enumerate() {
        if state.assignments[slot_index].is_some() {
            continue;
        }
        let Some(best) = index.best_score_by_length.get(&slot.length) else {
            return f64::NEG_INFINITY;
        };
        bound += best;
    }
    bound
}

fn remove_word_bits(state: &mut SearchState, slot_index: usize, word_index: usize, removed: u32) {
    let Some(domain_word) = state
        .domains
        .get_mut(slot_index)
        .and_then(|domain| domain.get_mut(word_index))
    else {
        return;
    };
    let previous = *domain_word;
    let next = previous & !removed;
    if next == previous {
        return;
    }
    *domain_word = next;
    state.sizes[slot_index] =
        state.sizes[slot_index].saturating_sub((previous ^ next).count_ones() as usize);
    state.trail.push(TrailEntry {
        slot_index,
        word_index,
        previous,
    });
}

fn remove_single_bit(state: &mut SearchState, slot_index: usize, local_index: usize) -> bool {
    let before = state.sizes.get(slot_index).copied().unwrap_or(0);
    remove_word_bits(
        state,
        slot_index,
        local_index / 32,
        1u32 << (local_index % 32),
    );
    state.sizes.get(slot_index).copied().unwrap_or(0) != before
}

fn undo_trail(state: &mut SearchState, base: usize) {
    while state.trail.len() > base {
        let Some(entry) = state.trail.pop() else {
            break;
        };
        let Some(current) = state
            .domains
            .get_mut(entry.slot_index)
            .and_then(|domain| domain.get_mut(entry.word_index))
        else {
            continue;
        };
        let changed = (*current ^ entry.previous).count_ones() as usize;
        *current = entry.previous;
        state.sizes[entry.slot_index] += changed;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(word: &str, score: f64) -> FillCandidate {
        FillCandidate {
            word: word.to_string(),
            score,
            quality_score: None,
            lexeme_id: format!("lexeme-{word}"),
            sense_id: None,
            source_ids: vec!["fixture".to_string()],
            tags: Vec::new(),
        }
    }

    fn crossing_request() -> FillRequest {
        FillRequest {
            slots: vec![
                FillSlot {
                    id: "across".to_string(),
                    length: 3,
                    pattern: Some("C..".to_string()),
                    importance: Some(1.0),
                },
                FillSlot {
                    id: "down".to_string(),
                    length: 3,
                    pattern: Some("..T".to_string()),
                    importance: Some(1.0),
                },
            ],
            intersections: vec![FillIntersection {
                slot_id: "across".to_string(),
                position: 2,
                other_slot_id: "down".to_string(),
                other_position: 2,
            }],
            candidates: vec![
                candidate("CAT", 3.0),
                candidate("COT", 1.0),
                candidate("EAT", 2.0),
                candidate("OAT", 0.5),
            ],
            locked_words: HashMap::new(),
            seed: Some(11),
            max_nodes: None,
            minimum_assignment_score: None,
            poor_entry_floor: None,
            poor_entry_limit: None,
            excluded_words: Vec::new(),
        }
    }

    #[test]
    fn finds_highest_scoring_crossing_fill() {
        let result = solve_fill(crossing_request());
        assert_eq!(result.status, "solved");
        assert_eq!(
            result
                .solution
                .as_ref()
                .and_then(|solution| solution.assignments.get("across"))
                .map(|candidate| candidate.word.as_str()),
            Some("CAT")
        );
        assert_eq!(
            result
                .solution
                .as_ref()
                .and_then(|solution| solution.assignments.get("down"))
                .map(|candidate| candidate.word.as_str()),
            Some("EAT")
        );
        assert_eq!(
            result.solution.as_ref().map(|solution| solution.score),
            Some(5.0)
        );
        assert_eq!(result.termination, FillTermination::Exhausted);
        assert_eq!(result.proven_optimal, Some(true));
    }

    #[test]
    fn enforces_patterns_uniqueness_and_exclusions() {
        let mut request = crossing_request();
        request.excluded_words = vec!["CAT".to_string()];
        let result = solve_fill(request);
        assert_eq!(result.status, "solved");
        let words = result
            .solution
            .unwrap()
            .assignments
            .into_values()
            .map(|candidate| candidate.word)
            .collect::<Vec<_>>();
        assert!(!words.iter().any(|word| word.eq_ignore_ascii_case("CAT")));
    }

    #[test]
    fn node_budget_is_exact_and_resumable() {
        let mut request = crossing_request();
        request.max_nodes = Some(2);
        let mut solver = FillSolver::new(request).unwrap();
        assert!(matches!(solver.step(1), StepResult::Running(_)));
        assert!(matches!(solver.step(1), StepResult::Finished(_)));
        let result = solver.finish();
        assert_eq!(result.nodes_explored, 2);
        assert_eq!(result.termination, FillTermination::NodeLimit);
    }

    #[test]
    fn malformed_input_is_typed() {
        let mut request = crossing_request();
        request.slots.clear();
        let result = solve_fill(request);
        assert_eq!(
            result.failure.as_ref().map(|failure| &failure.code),
            Some(&FillFailureCode::InvalidRequest)
        );
        assert_eq!(result.termination, FillTermination::Unsatisfiable);
    }

    #[test]
    fn cancellation_is_not_a_proof() {
        let mut solver = FillSolver::new(crossing_request()).unwrap();
        solver.cancel();
        let result = match solver.step(32) {
            StepResult::Finished(result) => result,
            StepResult::Running(_) => panic!("cancelled solver did not finish"),
        };
        assert_eq!(result.termination, FillTermination::Cancelled);
        assert_eq!(result.proven_optimal, None);
    }

    #[test]
    fn wire_shape_uses_the_typescript_camel_case_contract() {
        let request = crossing_request();
        let encoded = serde_json::to_value(&request).unwrap();
        assert!(encoded.get("lockedWords").is_some());
        assert!(encoded.get("maxNodes").is_some());
        assert!(encoded.get("minimumAssignmentScore").is_some());
        assert!(encoded["intersections"][0].get("slotId").is_some());

        let result = solve_fill(request);
        let encoded = serde_json::to_value(result).unwrap();
        assert!(encoded.get("terminationReason").is_some());
        assert!(encoded.get("nodesExplored").is_some());
        assert!(encoded.get("bestBound").is_some());
    }
}
