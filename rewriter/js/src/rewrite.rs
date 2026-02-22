use oxc::span::Span;
use smallvec::SmallVec;

use crate::{changes::JsChange, cfg::Config};

#[derive(Debug, Clone)]
pub enum AssignmentOp {
    Assign,
    AddAssign,
    SubAssign,
    MulAssign,
    DivAssign,
}

#[derive(Debug, Clone)]
pub enum RewriteType<'alloc, 'data> {
    WrapFn { enclose: bool },
    SetRealmFn,
    ImportFn,
    MetaFn,
    RewriteProperty {
        ident: &'data str,
    },
    RebindProperty {
        ident: &'data str,
        tempvar: bool,
    },
    TempVar,
    WrapObjectAssignment {
        restids: SmallVec<[&'data str; 4]>,
        location_assigned: bool,
    },
    WrapProperty,
    RascalErr {
        ident: &'data str,
    },
    Rascalitize,
    Eval {
        inner: Span,
    },
    Assignment {
        name: &'data str,
        rhs: Span,
        op: AssignmentOp,
    },
    ShorthandObj {
        name: &'data str,
    },
    SourceTag,
    CleanFunction {
        restids: SmallVec<[&'data str; 4]>,
        expression: bool,
        location_assigned: bool,
        wrap: bool,
    },
    CleanVariableDeclaration {
        restids: SmallVec<[&'data str; 4]>,
        location_assigned: bool,
    },
    Replace {
        text: &'alloc str,
    },
    Delete,
}

#[derive(Debug, Clone)]
pub struct Rewrite<'alloc, 'data> {
    pub span: Span,
    pub ty: RewriteType<'alloc, 'data>,
}

impl<'alloc, 'data> Rewrite<'alloc, 'data> {
    pub fn into_inner(self, cfg: &'data Config) -> SmallVec<[JsChange<'alloc, 'data>; 2]> {
        use RewriteType as R;
        let mut out: SmallVec<[JsChange<'alloc, 'data>; 2]> = SmallVec::new();
        match self.ty {
            R::WrapFn { enclose } => {
                let left = if enclose {
                    format!("({}(", cfg.wrapfn)
                } else {
                    format!("{}(", cfg.wrapfn)
                };
                let right = if enclose { "))" } else { ")" };
                out.push(JsChange::insert_left_owned(self.span, left));
                out.push(JsChange::insert_right(self.span, right));
            }
            R::SetRealmFn => {
                out.push(JsChange::replace_owned(
                    self.span,
                    format!("{}({{}}).postMessage", cfg.setrealmfn),
                ));
            }
            R::ImportFn => {
                out.push(JsChange::replace_owned(
                    self.span,
                    format!("{}(\"{}\",", cfg.importfn, cfg.prefix),
                ));
            }
            R::MetaFn => {
                out.push(JsChange::replace_owned(
                    self.span,
                    format!("{}(import.meta, \"{}\")", cfg.metafn, cfg.prefix),
                ));
            }
            R::RewriteProperty { ident } => {
                out.push(JsChange::replace_owned(
                    self.span,
                    format!("{}{}", cfg.wrappropertybase, ident),
                ));
            }
            R::RebindProperty { ident, tempvar } => {
                let target = if tempvar { cfg.templocid.as_str() } else { ident };
                out.push(JsChange::replace_owned(
                    self.span,
                    format!("{}: {}", format!("{}{}", cfg.wrappropertybase, ident), target),
                ));
            }
            R::TempVar => {
                out.push(JsChange::replace_owned(self.span, cfg.templocid.clone()));
            }
            R::WrapObjectAssignment {
                restids,
                location_assigned,
            } => {
                let rest = restids
                    .iter()
                    .map(|id| format!("{}({})", cfg.cleanrestfn, id))
                    .collect::<Vec<_>>()
                    .join(", ");
                let loc = if location_assigned {
                    format!(", {}(location, \"=\", t)||(location=t)", cfg.trysetfn)
                } else {
                    String::new()
                };
                let prefix = format!("((t)=>({}{}))(", rest, loc);
                out.push(JsChange::insert_left_owned(self.span, prefix));
                out.push(JsChange::insert_right(self.span, ")"));
            }
            R::WrapProperty => {
                out.push(JsChange::insert_left_owned(
                    self.span,
                    format!("{}(", cfg.wrappropertyfn),
                ));
                out.push(JsChange::insert_right(self.span, ")"));
            }
            R::RascalErr { ident } => {
                out.push(JsChange::insert_left_owned(
                    self.span,
                    format!("$rascalerr({});", ident),
                ));
            }
            R::Rascalitize => {
                out.push(JsChange::insert_left_owned(self.span, "$rascalitize(".to_string()));
                out.push(JsChange::insert_right(self.span, ")"));
            }
            R::Eval { inner } => {
                out.push(JsChange::insert_left_owned(
                    inner,
                    format!("{}(", cfg.rewritefn),
                ));
                out.push(JsChange::insert_right(inner, ")"));
            }
            R::Assignment { name, rhs, op: _ } => {
                out.push(JsChange::replace_owned(
                    self.span,
                    format!(
                        "((t)=>{}({},\"=\",t)||({}=t))({})",
                        cfg.trysetfn, name, name, rhs.start
                    ),
                ));
            }
            R::ShorthandObj { name } => {
                out.push(JsChange::replace_owned(
                    self.span,
                    format!("{}: {}({})", name, cfg.wrapfn, name),
                ));
            }
            R::SourceTag => {
                out.push(JsChange::insert_left_owned(
                    self.span,
                    format!("/*rascaltag {} {}*/", self.span.start, cfg.prefix),
                ));
            }
            R::CleanFunction {
                restids,
                expression,
                location_assigned,
                wrap,
            } => {
                let mut body = String::new();
                for id in restids {
                    body.push_str(&format!("{}({});", cfg.cleanrestfn, id));
                }
                if location_assigned {
                    body.push_str(&format!(
                        "{}(location,\"=\",{})||(location={});",
                        cfg.trysetfn, cfg.templocid, cfg.templocid
                    ));
                }
                if expression {
                    out.push(JsChange::insert_left_owned(self.span, format!("({},", body)));
                    out.push(JsChange::insert_right(self.span, ")"));
                } else if wrap {
                    out.push(JsChange::insert_left_owned(self.span, format!("{{{}", body)));
                    out.push(JsChange::insert_right(self.span, "}"));
                } else {
                    out.push(JsChange::insert_left_owned(self.span, format!(";{}", body)));
                }
            }
            R::CleanVariableDeclaration {
                restids,
                location_assigned,
            } => {
                let mut suffix = String::new();
                for id in restids {
                    suffix.push_str(&format!("{}({}),", cfg.cleanrestfn, id));
                }
                if location_assigned {
                    suffix.push_str(&format!(
                        "{}(location,\"=\",{})||(location={}),",
                        cfg.trysetfn, cfg.templocid, cfg.templocid
                    ));
                }
                out.push(JsChange::insert_right_owned(
                    self.span,
                    format!(", {} = ({}, 0)", cfg.tempunusedid, suffix),
                ));
            }
            R::Replace { text } => out.push(JsChange::replace(self.span, text)),
            R::Delete => out.push(JsChange::replace(self.span, "")),
        }
        out
    }
}