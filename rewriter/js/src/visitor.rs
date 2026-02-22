use oxc::span::Span;

use crate::{
    cfg::{Config, Flags, UrlRewriter},
    rewrite::{Rewrite, RewriteType},
};

pub const UNSAFE_GLOBALS: &[&str] = &["parent", "top", "location", "eval"];

#[derive(Debug)]
struct Token<'a> {
    text: &'a str,
    start: u32,
    end: u32,
    prev_non_ws: Option<char>,
    next_non_ws: Option<char>,
    prev_token: Option<&'a str>,
}

#[derive(Debug)]
pub struct JsVisitor<'alloc, 'data, E: UrlRewriter> {
    src: &'data str,
    cfg: &'data Config,
    flags: &'data Flags,
    _url: &'data E,
    rewrites: Vec<Rewrite<'alloc, 'data>>,
}

impl<'alloc, 'data, E: UrlRewriter> JsVisitor<'alloc, 'data, E> {
    pub fn new(src: &'data str, cfg: &'data Config, flags: &'data Flags, url: &'data E) -> Self {
        Self {
            src,
            cfg,
            flags,
            _url: url,
            rewrites: Vec::new(),
        }
    }

    pub fn run(mut self) -> Vec<Rewrite<'alloc, 'data>> {
        self.visit_identifier_reference();
        self.visit_member_expression();
        self.visit_import_expression();
        self.visit_meta_property();
        self.visit_debugger_statement();
        self.visit_function_body();
        self.rewrites
    }

    fn tokenize(&self) -> Vec<Token<'data>> {
        let bytes = self.src.as_bytes();
        let mut tokens = Vec::new();
        let mut i = 0usize;
        let mut prev_token: Option<&'data str> = None;

        while i < bytes.len() {
            let c = bytes[i] as char;
            if c == '"' || c == '\'' || c == '`' {
                let quote = c;
                i += 1;
                while i < bytes.len() {
                    let ch = bytes[i] as char;
                    if ch == '\\' {
                        i += 2;
                        continue;
                    }
                    if ch == quote {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
                continue;
            }

            if c == '/' && i + 1 < bytes.len() && bytes[i + 1] as char == '/' {
                i += 2;
                while i < bytes.len() && bytes[i] as char != '\n' {
                    i += 1;
                }
                continue;
            }

            if c == '/' && i + 1 < bytes.len() && bytes[i + 1] as char == '*' {
                i += 2;
                while i + 1 < bytes.len() {
                    if bytes[i] as char == '*' && bytes[i + 1] as char == '/' {
                        i += 2;
                        break;
                    }
                    i += 1;
                }
                continue;
            }

            if is_ident_start(c) {
                let start = i;
                i += 1;
                while i < bytes.len() && is_ident_continue(bytes[i] as char) {
                    i += 1;
                }
                let end = i;
                let text = &self.src[start..end];
                let prev_non_ws = find_prev_non_ws(self.src, start);
                let next_non_ws = find_next_non_ws(self.src, end);
                tokens.push(Token {
                    text,
                    start: start as u32,
                    end: end as u32,
                    prev_non_ws,
                    next_non_ws,
                    prev_token,
                });
                prev_token = Some(text);
                continue;
            }

            if !c.is_whitespace() {
                prev_token = None;
            }

            i += 1;
        }

        tokens
    }

    pub fn visit_identifier_reference(&mut self) {
        for tok in self.tokenize() {
            if !UNSAFE_GLOBALS.contains(&tok.text) {
                continue;
            }
            let is_decl_context = matches!(tok.prev_token, Some("function" | "var" | "let" | "const" | "catch" | "class"));
            if is_decl_context {
                continue;
            }
            if tok.prev_non_ws == Some('.') {
                continue;
            }
            if tok.next_non_ws == Some(':') {
                continue;
            }

            self.rewrites.push(Rewrite {
                span: Span::new(tok.start, tok.end),
                ty: RewriteType::WrapFn { enclose: false },
            });
        }
    }

    pub fn visit_member_expression(&mut self) {
        for tok in self.tokenize() {
            if tok.prev_non_ws != Some('.') {
                continue;
            }
            if UNSAFE_GLOBALS.contains(&tok.text) {
                self.rewrites.push(Rewrite {
                    span: Span::new(tok.start, tok.end),
                    ty: RewriteType::RewriteProperty { ident: tok.text },
                });
            } else if tok.text == "postMessage" {
                self.rewrites.push(Rewrite {
                    span: Span::new(tok.start, tok.end),
                    ty: RewriteType::SetRealmFn,
                });
            }
        }

        // Best-effort computed member rewriting.
        let mut i = 0usize;
        let bytes = self.src.as_bytes();
        while i < bytes.len() {
            if bytes[i] as char == '[' {
                let start = i + 1;
                let mut depth = 1usize;
                i += 1;
                while i < bytes.len() && depth > 0 {
                    let ch = bytes[i] as char;
                    if ch == '[' {
                        depth += 1;
                    } else if ch == ']' {
                        depth -= 1;
                    }
                    i += 1;
                }
                if depth == 0 {
                    let end = i.saturating_sub(1);
                    if start < end {
                        self.rewrites.push(Rewrite {
                            span: Span::new(start as u32, end as u32),
                            ty: RewriteType::WrapProperty,
                        });
                    }
                }
                continue;
            }
            i += 1;
        }
    }

    pub fn visit_import_expression(&mut self) {
        for tok in self.tokenize() {
            if tok.text == "import" && tok.next_non_ws == Some('(') {
                self.rewrites.push(Rewrite {
                    span: Span::new(tok.start, tok.end),
                    ty: RewriteType::ImportFn,
                });
            }
        }
    }

    pub fn visit_meta_property(&mut self) {
        let mut from = 0usize;
        while let Some(rel) = self.src[from..].find("import.meta") {
            let start = from + rel;
            let end = start + "import.meta".len();
            self.rewrites.push(Rewrite {
                span: Span::new(start as u32, end as u32),
                ty: RewriteType::MetaFn,
            });
            from = end;
        }
    }

    pub fn visit_debugger_statement(&mut self) {
        let mut from = 0usize;
        while let Some(rel) = self.src[from..].find("debugger") {
            let start = from + rel;
            let mut end = start + "debugger".len();
            while end < self.src.len() {
                let c = self.src.as_bytes()[end] as char;
                if c == ';' {
                    end += 1;
                    break;
                }
                if !c.is_whitespace() {
                    break;
                }
                end += 1;
            }
            self.rewrites.push(Rewrite {
                span: Span::new(start as u32, end as u32),
                ty: RewriteType::Delete,
            });
            from = end;
        }
    }

    pub fn visit_function_body(&mut self) {
        if self.flags.do_sourcemaps {
            self.rewrites.push(Rewrite {
                span: Span::new(0, 0),
                ty: RewriteType::SourceTag,
            });
        }
    }

    pub fn rewrite_url(&mut self, start: u32, end: u32, text: &'alloc str, module: bool) {
        let _ = module;
        self.rewrites.push(Rewrite {
            span: Span::new(start, end),
            ty: RewriteType::Replace { text },
        });
    }

    #[allow(dead_code)]
    pub fn visit_assignment_expression(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_variable_declaration(&mut self) {}
    #[allow(dead_code)]
    pub fn recurse_binding_pattern(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_function(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_arrow_function_expression(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_call_expression(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_unary_expression(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_update_expression(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_import_declaration(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_export_all_declaration(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_export_named_declaration(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_try_statement(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_for_of_statement(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_for_in_statement(&mut self) {}
    #[allow(dead_code)]
    pub fn visit_for_statement(&mut self) {}
    #[allow(dead_code)]
    pub fn handle_for_of_in(&mut self) {}

    #[allow(dead_code)]
    pub fn config(&self) -> &Config {
        self.cfg
    }
}

fn is_ident_start(c: char) -> bool {
    c == '_' || c == '$' || c.is_ascii_alphabetic()
}

fn is_ident_continue(c: char) -> bool {
    is_ident_start(c) || c.is_ascii_digit()
}

fn find_prev_non_ws(src: &str, mut idx: usize) -> Option<char> {
    while idx > 0 {
        idx -= 1;
        let ch = src.as_bytes()[idx] as char;
        if !ch.is_whitespace() {
            return Some(ch);
        }
    }
    None
}

fn find_next_non_ws(src: &str, mut idx: usize) -> Option<char> {
    while idx < src.len() {
        let ch = src.as_bytes()[idx] as char;
        if !ch.is_whitespace() {
            return Some(ch);
        }
        idx += 1;
    }
    None
}