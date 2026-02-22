use std::cmp::Ordering;

use oxc::span::Span;
use smallvec::smallvec;
use transform::{Transform, TransformElement, TransformLL, TransformType};

use crate::cfg::Config;

#[derive(Debug, Clone)]
pub enum JsChangeType {
    InsertLeft(String),
    InsertRight(String),
    WrapFnRight(String),
    RascalErrFn(String),
    Replace(String),
}

#[derive(Debug, Clone)]
pub struct JsChange {
    pub span: Span,
    pub ty: JsChangeType,
}

impl JsChange {
    pub fn insert_left_owned(span: Span, text: String) -> Self {
        Self {
            span: Span::new(span.start, span.start),
            ty: JsChangeType::InsertLeft(text),
        }
    }

    pub fn insert_right(span: Span, text: String) -> Self {
        Self {
            span: Span::new(span.end, span.end),
            ty: JsChangeType::WrapFnRight(text),
        }
    }

    pub fn insert_right_owned(span: Span, text: String) -> Self {
        Self {
            span: Span::new(span.end, span.end),
            ty: JsChangeType::InsertRight(text),
        }
    }

    pub fn rascal_err(span: Span, text: String) -> Self {
        Self {
            span: Span::new(span.start, span.start),
            ty: JsChangeType::RascalErrFn(text),
        }
    }

    pub fn replace_owned(span: Span, text: String) -> Self {
        Self {
            span,
            ty: JsChangeType::Replace(text),
        }
    }

    fn priority(&self) -> u8 {
        match self.ty {
            JsChangeType::RascalErrFn(_) => 0,
            JsChangeType::WrapFnRight(_) => 1,
            _ => 2,
        }
    }
}

impl Eq for JsChange {}

impl PartialEq for JsChange {
    fn eq(&self, other: &Self) -> bool {
        self.span == other.span && self.priority() == other.priority()
    }
}

impl Ord for JsChange {
    fn cmp(&self, other: &Self) -> Ordering {
        self.span
            .start
            .cmp(&other.span.start)
            .then(self.span.end.cmp(&other.span.end))
            .then(self.priority().cmp(&other.priority()))
    }
}

impl PartialOrd for JsChange {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<'a> Transform<'a> for JsChange {
    type ToLowLevelData = Config;

    fn span(&self) -> Span {
        self.span
    }

    fn into_low_level(self, _data: &Self::ToLowLevelData, _offset: i32) -> TransformLL<'a> {
        match self.ty {
            JsChangeType::InsertLeft(text)
            | JsChangeType::InsertRight(text)
            | JsChangeType::WrapFnRight(text)
            | JsChangeType::RascalErrFn(text) => TransformLL {
                ty: TransformType::Insert,
                change: smallvec![TransformElement::Owned(text)],
            },
            JsChangeType::Replace(text) => TransformLL {
                ty: TransformType::Replace,
                change: smallvec![TransformElement::Owned(text)],
            },
        }
    }
}