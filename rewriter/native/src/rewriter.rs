use std::error::Error;

use js::{
    Rewriter as JsRewriter,
    cfg::{Config, Flags, StringBuilder, UrlRewriter},
};

pub struct NativeUrlRewriter;

impl UrlRewriter for NativeUrlRewriter {
    fn rewrite(
        &self,
        cfg: &Config,
        _flags: &Flags,
        url: &str,
        builder: &mut StringBuilder,
        _module: bool,
    ) -> Result<(), Box<dyn Error + Sync + Send>> {
        builder.push_str(&cfg.prefix);
        builder.push_str(url);
        Ok(())
    }
}

pub struct NativeRewriter {
    inner: JsRewriter<NativeUrlRewriter>,
}

impl Default for NativeRewriter {
    fn default() -> Self {
        Self::new()
    }
}

impl NativeRewriter {
    pub fn new() -> Self {
        Self {
            inner: JsRewriter::new(Config::default(), NativeUrlRewriter),
        }
    }

    pub fn rewrite(
        &mut self,
        js: &[u8],
        base: String,
        _url: String,
        module: bool,
    ) -> anyhow::Result<js::RewriteResult> {
        let flags = Flags {
            base,
            is_module: module,
            ..Flags::default()
        };
        self.inner.rewrite_bytes(js, flags)
    }
}
