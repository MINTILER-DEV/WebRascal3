use oxc::span::Span;

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
pub enum RewriteType {
    WrapFn { enclose: bool },
    SetRealmFn,
    ImportFn,
    MetaFn,
    RewriteProperty { ident: String },
    RebindProperty { ident: String, tempvar: bool },
    TempVar,
    WrapObjectAssignment {
        restids: Vec<String>,
        location_assigned: bool,
    },
    WrapProperty,
    RascalErr { ident: String },
    Rascalitize,
    Eval { inner: Span },
    Assignment {
        name: String,
        rhs_text: String,
        op: AssignmentOp,
    },
    ShorthandObj { name: String },
    SourceTag,
    CleanFunction {
        restids: Vec<String>,
        expression: bool,
        location_assigned: bool,
        wrap: bool,
    },
    CleanVariableDeclaration {
        restids: Vec<String>,
        location_assigned: bool,
    },
    Replace { text: String },
    Delete,
}

#[derive(Debug, Clone)]
pub struct Rewrite {
    pub span: Span,
    pub ty: RewriteType,
}

impl Rewrite {
    pub fn into_inner(self, cfg: &Config) -> Vec<JsChange> {
        use RewriteType as R;
        let mut out: Vec<JsChange> = Vec::new();
        match self.ty {
            R::WrapFn { enclose } => {
                let left = if enclose {
                    format!("({}(", cfg.wrapfn)
                } else {
                    format!("{}(", cfg.wrapfn)
                };
                let right = if enclose { "))" } else { ")" };
                out.push(JsChange::insert_left_owned(self.span, left));
                out.push(JsChange::insert_right(self.span, right.to_string()));
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
                let target = if tempvar {
                    cfg.templocid.clone()
                } else {
                    ident.clone()
                };
                out.push(JsChange::replace_owned(
                    self.span,
                    format!("{}{}: {}", cfg.wrappropertybase, ident, target),
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
                out.push(JsChange::insert_right(self.span, ")".to_string()));
            }
            R::WrapProperty => {
                out.push(JsChange::insert_left_owned(
                    self.span,
                    format!("{}(", cfg.wrappropertyfn),
                ));
                out.push(JsChange::insert_right(self.span, ")".to_string()));
            }
            R::RascalErr { ident } => {
                out.push(JsChange::rascal_err(self.span, format!("$rascalerr({ident});")));
            }
            R::Rascalitize => {
                out.push(JsChange::insert_left_owned(self.span, "$rascalitize(".to_string()));
                out.push(JsChange::insert_right(self.span, ")".to_string()));
            }
            R::Eval { inner } => {
                out.push(JsChange::insert_left_owned(
                    inner,
                    format!("{}(", cfg.rewritefn),
                ));
                out.push(JsChange::insert_right(inner, ")".to_string()));
            }
            R::Assignment {
                name,
                rhs_text,
                op: _,
            } => {
                out.push(JsChange::replace_owned(
                    self.span,
                    format!(
                        "((t)=>{}({},\"=\",t)||({}=t))({})",
                        cfg.trysetfn, name, name, rhs_text
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
                    out.push(JsChange::insert_right(self.span, ")".to_string()));
                } else if wrap {
                    out.push(JsChange::insert_left_owned(self.span, format!("{{{}", body)));
                    out.push(JsChange::insert_right(self.span, "}".to_string()));
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
            R::Replace { text } => out.push(JsChange::replace_owned(self.span, text)),
            R::Delete => out.push(JsChange::replace_owned(self.span, String::new())),
        }
        out
    }
}