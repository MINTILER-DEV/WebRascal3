use js_sys::{Object, Uint8Array};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct JsRewriterOutput {
    js: Uint8Array,
    map: Uint8Array,
    rascaltag: String,
    errors: Array,
}

use js_sys::Array;

#[wasm_bindgen]
impl JsRewriterOutput {
    #[wasm_bindgen(constructor)]
    pub fn new(js: Uint8Array, map: Uint8Array, rascaltag: String, errors: Array) -> Self {
        Self {
            js,
            map,
            rascaltag,
            errors,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn js(&self) -> Uint8Array {
        self.js.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn map(&self) -> Uint8Array {
        self.map.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn rascaltag(&self) -> String {
        self.rascaltag.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn errors(&self) -> Array {
        self.errors.clone()
    }

    pub fn as_object(&self) -> Object {
        let o = Object::new();
        js_sys::Reflect::set(&o, &"js".into(), &self.js.clone().into()).ok();
        js_sys::Reflect::set(&o, &"map".into(), &self.map.clone().into()).ok();
        js_sys::Reflect::set(&o, &"rascaltag".into(), &self.rascaltag.clone().into()).ok();
        js_sys::Reflect::set(&o, &"errors".into(), &self.errors.clone().into()).ok();
        o
    }
}
