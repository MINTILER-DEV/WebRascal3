use anyhow::{Result, anyhow};
use oxc::{allocator::Allocator, parser::Parser, span::SourceType};
use transform::Transformer;

pub mod cfg;
pub mod changes;
pub mod rewrite;
pub mod visitor;

use cfg::{Config, Flags, UrlRewriter};
use changes::JsChange;
use visitor::JsVisitor;

pub type OxcDiagnostic = String;

pub struct Rewriter<E: UrlRewriter> {
    cfg: Config,
    url: E,
}

#[derive(Debug)]
pub struct RewriteResult {
    pub js: Vec<u8>,
    pub sourcemap: Vec<u8>,
    pub errors: Vec<OxcDiagnostic>,
    pub flags: Flags,
}

impl<E: UrlRewriter> Rewriter<E> {
    pub fn new(cfg: Config, url: E) -> Self {
        Self { cfg, url }
    }

    pub fn config(&self) -> &Config {
        &self.cfg
    }

    pub fn rewrite(&self, js: &str, mut flags: Flags) -> Result<RewriteResult> {
        if flags.base.is_empty() {
            flags.base = "about:blank".to_string();
        }

        let alloc = Allocator::default();
        let source_type = SourceType::default().with_module(flags.is_module);
        let parser = Parser::new(&alloc, js, source_type);
        let parsed = parser.parse();

        let errors = parsed
            .errors
            .into_iter()
            .map(|e| format!("{e:?}"))
            .collect::<Vec<_>>();

        let visitor = JsVisitor::new(js, &self.cfg, &flags, &self.url);
        let rewrites = visitor.run();

        let mut transformer: Transformer<'_, '_, JsChange> = Transformer::default();
        for rewrite in rewrites {
            transformer.extend(rewrite.into_inner(&self.cfg));
        }

        let out = transformer.perform(js, &self.cfg);

        Ok(RewriteResult {
            js: out.output,
            sourcemap: out.sourcemap,
            errors,
            flags,
        })
    }

    pub fn rewrite_bytes(&self, js: &[u8], flags: Flags) -> Result<RewriteResult> {
        let text = std::str::from_utf8(js).map_err(|e| anyhow!("input js is not utf-8: {e}"))?;
        self.rewrite(text, flags)
    }
}