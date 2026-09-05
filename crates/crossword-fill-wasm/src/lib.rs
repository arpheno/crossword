//! Thin browser ABI for the pure crossword-fill-core crate.
//!
//! The JS side receives ordinary objects for the spike. Calls are coarse: a
//! `step` performs a bounded number of search states, so the TypeScript worker
//! can observe cancellation between calls without a per-node callback.

use crossword_fill_core::{CONTRACT_VERSION, FillRequest, FillResult, FillSolver, StepResult};
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
#[serde(tag = "state", rename_all = "lowercase")]
enum WasmStep {
    Running {
        progress: crossword_fill_core::FillProgress,
    },
    Finished {
        result: FillResult,
    },
}

#[wasm_bindgen(js_name = contractVersion)]
pub fn contract_version() -> String {
    CONTRACT_VERSION.to_string()
}

#[wasm_bindgen]
pub struct Engine {
    contract: String,
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new(contract: String) -> Result<Engine, JsValue> {
        if contract != CONTRACT_VERSION {
            return Err(JsValue::from_str("Unsupported fill contract version"));
        }
        Ok(Engine { contract })
    }

    #[wasm_bindgen(js_name = contractVersion)]
    pub fn contract_version(&self) -> String {
        self.contract.clone()
    }

    #[wasm_bindgen(js_name = startSolve)]
    pub fn start_solve(&self, request: JsValue) -> Result<Solve, JsValue> {
        let request: FillRequest = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&format!("Invalid fill request: {error}")))?;
        let solver = match FillSolver::new(request) {
            Ok(solver) => solver,
            Err(result) => return Err(serialize(&*result)?),
        };
        Ok(Solve {
            solver: Some(solver),
        })
    }

    #[wasm_bindgen(js_name = dropEngine)]
    pub fn drop_engine(&mut self) {
        // The spike engine retains no external resources. The explicit method
        // keeps lifecycle ownership symmetrical with the solve handle.
    }
}

#[wasm_bindgen]
pub struct Solve {
    solver: Option<FillSolver>,
}

#[wasm_bindgen]
impl Solve {
    pub fn step(&mut self, node_budget: u32) -> Result<JsValue, JsValue> {
        let Some(solver) = self.solver.as_mut() else {
            return Err(JsValue::from_str("Solve handle has been dropped"));
        };
        let result = match solver.step(u64::from(node_budget)) {
            StepResult::Running(progress) => WasmStep::Running { progress },
            StepResult::Finished(result) => WasmStep::Finished { result },
        };
        serialize(&result)
    }

    pub fn cancel(&mut self) -> Result<(), JsValue> {
        let Some(solver) = self.solver.as_mut() else {
            return Err(JsValue::from_str("Solve handle has been dropped"));
        };
        solver.cancel();
        Ok(())
    }

    #[wasm_bindgen(js_name = takeResult)]
    pub fn take_result(&mut self) -> Result<JsValue, JsValue> {
        let Some(solver) = self.solver.as_mut() else {
            return Err(JsValue::from_str("Solve handle has been dropped"));
        };
        if !solver.is_done() {
            return Err(JsValue::from_str("Solve is still running"));
        }
        serialize(&solver.finish())
    }

    #[wasm_bindgen(js_name = dropSolve)]
    pub fn drop_solve(&mut self) {
        self.solver = None;
    }
}

fn serialize<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value)
        .map_err(|error| JsValue::from_str(&format!("Unable to encode fill result: {error}")))
}
