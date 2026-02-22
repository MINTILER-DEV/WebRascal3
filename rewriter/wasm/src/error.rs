use thiserror::Error;
use wasm_bindgen::JsValue;

#[derive(Debug, Error)]
pub enum WasmRewriterError {
    #[error("{0}")]
    Msg(String),
}

impl From<anyhow::Error> for WasmRewriterError {
    fn from(value: anyhow::Error) -> Self {
        Self::Msg(value.to_string())
    }
}

impl From<WasmRewriterError> for JsValue {
    fn from(value: WasmRewriterError) -> Self {
        JsValue::from_str(&value.to_string())
    }
}