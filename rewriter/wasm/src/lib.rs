mod error;
mod jsr;

use std::error::Error;

use js::{
    Rewriter as JsRewriter,
    cfg::{Config, Flags, StringBuilder, UrlRewriter},
};
use js_sys::{Array, Function, Object, Reflect, Uint8Array};
use wasm_bindgen::prelude::*;
use web_sys::Url;

use crate::error::WasmRewriterError;
pub use crate::jsr::JsRewriterOutput;

struct WasmUrlRewriter {
    webrascal: Object,
}

// This object only exists in the single-threaded wasm runtime.
unsafe impl Send for WasmUrlRewriter {}
unsafe impl Sync for WasmUrlRewriter {}

impl UrlRewriter for WasmUrlRewriter {
    fn rewrite(
        &self,
        cfg: &Config,
        flags: &Flags,
        url: &str,
        builder: &mut StringBuilder,
        _module: bool,
    ) -> Result<(), Box<dyn Error + Sync + Send>> {
        let resolved = Url::new_with_base(url, &flags.base)
            .map_err(|_| WasmRewriterError::Msg(format!("failed to resolve url: {url}")))?;

        let codec = Reflect::get(&self.webrascal, &JsValue::from_str("codec"))
            .map_err(|_| WasmRewriterError::Msg("webrascal.codec missing".into()))?;
        let encode = Reflect::get(&codec, &JsValue::from_str("encode"))
            .map_err(|_| WasmRewriterError::Msg("webrascal.codec.encode missing".into()))?;

        let encode_fn: Function = encode
            .dyn_into()
            .map_err(|_| WasmRewriterError::Msg("codec.encode is not a function".into()))?;

        let encoded = encode_fn
            .call1(&codec, &JsValue::from_str(&resolved.href()))
            .map_err(|_| WasmRewriterError::Msg("codec.encode call failed".into()))?;

        let encoded = encoded
            .as_string()
            .ok_or_else(|| WasmRewriterError::Msg("codec.encode did not return string".into()))?;

        builder.push_str(&cfg.prefix);
        builder.push_str(&encoded);
        Ok(())
    }
}

#[wasm_bindgen]
pub struct Rewriter {
    js: JsRewriter<WasmUrlRewriter>,
    webrascal: Object,
}

#[wasm_bindgen]
impl Rewriter {
    #[wasm_bindgen(constructor)]
    pub fn new(webrascal: Object) -> Result<Rewriter, JsValue> {
        let cfg = config_from_object(&webrascal).unwrap_or_default();
        Ok(Self {
            js: JsRewriter::new(
                cfg,
                WasmUrlRewriter {
                    webrascal: webrascal.clone(),
                },
            ),
            webrascal,
        })
    }

    pub fn rewrite_js(
        &mut self,
        js: String,
        base: String,
        url: String,
        module: bool,
    ) -> Result<JsRewriterOutput, JsValue> {
        self.rewrite_js_bytes(js.into_bytes(), base, url, module)
    }

    pub fn rewrite_js_bytes(
        &mut self,
        js: Vec<u8>,
        base: String,
        _url: String,
        module: bool,
    ) -> Result<JsRewriterOutput, JsValue> {
        let flags = Flags {
            base,
            is_module: module,
            sourcetag: random_tag(),
            ..Flags::default()
        };

        let rewritten = self
            .js
            .rewrite_bytes(&js, flags)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let js_out = Uint8Array::from(rewritten.js.as_slice());
        let map_out = Uint8Array::from(rewritten.sourcemap.as_slice());
        let errs = Array::new();
        for err in rewritten.errors {
            errs.push(&JsValue::from_str(&err));
        }

        Ok(JsRewriterOutput::new(
            js_out,
            map_out,
            rewritten.flags.sourcetag,
            errs,
        ))
    }

    #[wasm_bindgen(getter)]
    pub fn webrascal(&self) -> Object {
        self.webrascal.clone()
    }
}

fn config_from_object(webrascal: &Object) -> Option<Config> {
    let globals = Reflect::get(webrascal, &JsValue::from_str("globals")).ok()?;
    let prefix = Reflect::get(webrascal, &JsValue::from_str("prefix"))
        .ok()
        .and_then(|v| v.as_string())
        .unwrap_or_else(|| "/webrascal/".to_string());

    let mut cfg = Config {
        prefix,
        ..Config::default()
    };

    macro_rules! read_global {
        ($field:ident, $key:literal) => {
            if let Ok(v) = Reflect::get(&globals, &JsValue::from_str($key)) {
                if let Some(s) = v.as_string() {
                    cfg.$field = s;
                }
            }
        };
    }

    read_global!(wrapfn, "wrapfn");
    read_global!(wrappropertybase, "wrappropertybase");
    read_global!(wrappropertyfn, "wrappropertyfn");
    read_global!(cleanrestfn, "cleanrestfn");
    read_global!(importfn, "importfn");
    read_global!(rewritefn, "rewritefn");
    read_global!(setrealmfn, "setrealmfn");
    read_global!(metafn, "metafn");
    read_global!(pushsourcemapfn, "pushsourcemapfn");
    read_global!(trysetfn, "trysetfn");
    read_global!(templocid, "templocid");
    read_global!(tempunusedid, "tempunusedid");

    Some(cfg)
}

fn random_tag() -> String {
    let now = js_sys::Date::now() as u64;
    format!("tag-{now:x}")
}
