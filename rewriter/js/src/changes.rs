use std::{borrow::Cow, cmp::Ordering};

use oxc::span::Span;
use smallvec::smallvec;
use transform::{Transform, TransformElement, TransformLL, TransformType};

use crate::cfg::Config;

#[derive(Debug, Clone)]
pub enum JsChangeType<'a> {
    InsertLeft(Cow<'a, str>),
    InsertRight(Cow<'a, str>),
    WrapFnRight(Cow<'a, str>),
    RascalErrFn(Cow<'a, str>),
    Replace(Cow<'a, str>),
}

#[derive(Debug, Clone)]
pub struct JsChange<'alloc, 'data> {
    pub span: Span,
    pub ty: JsChangeType<'alloc>,
    marker: std::marker::PhantomData<&'data ()>,
}

impl<'alloc, 'data> JsChange<'alloc, 'data> {
    pub fn insert_left(span: Span, text: &'alloc str) -> Self {
        Self {
            span: Span::new(span.start, span.start),
            ty: JsChangeType::InsertLeft(Cow::Borrowed(text)),
            marker: std::marker::PhantomData,
        }
    }

    pub fn insert_left_owned(span: Span, text: String) -> Self {
        Self {
            span: Span::new(span.start, span.start),
            ty: JsChangeType::InsertLeft(Cow::Owned(text)),
            marker: std::marker::PhantomData,
        }
    }

    pub fn insert_right(span: Span, text: &'alloc str) -> Self {
        Self {
            span: Span::new(span.end, span.end),
            ty: JsChangeType::WrapFnRight(Cow::Borrowed(text)),
            marker: std::marker::PhantomData,
        }
    }

    pub fn insert_right_owned(span: Span, text: String) -> Self {
        Self {
            span: Span::new(span.end, span.end),
            ty: JsChangeType::InsertRight(Cow::Owned(text)),
            marker: std::marker::PhantomData,
        }
    }

    pub fn rascal_err(span: Span, text: String) -> Self {
        Self {
            span: Span::new(span.start, span.start),
            ty: JsChangeType::RascalErrFn(Cow::Owned(text)),
            marker: std::marker::PhantomData,
        }
    }

    pub fn replace(span: Span, text: &'alloc str) -> Self {
        Self {
            span,
            ty: JsChangeType::Replace(Cow::Borrowed(text)),
            marker: std::marker::PhantomData,
        }
    }

    pub fn replace_owned(span: Span, text: String) -> Self {
        Self {
            span,
            ty: JsChangeType::Replace(Cow::Owned(text)),
            marker: std::marker::PhantomData,
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

impl<'alloc, 'data> Eq for JsChange<'alloc, 'data> {}

impl<'alloc, 'data> PartialEq for JsChange<'alloc, 'data> {
    fn eq(&self, other: &Self) -> bool {
        self.span == other.span && self.priority() == other.priority()
    }
}

impl<'alloc, 'data> Ord for JsChange<'alloc, 'data> {
    fn cmp(&self, other: &Self) -> Ordering {
        self.span
            .start
            .cmp(&other.span.start)
            .then(self.span.end.cmp(&other.span.end))
            .then(self.priority().cmp(&other.priority()))
    }
}

impl<'alloc, 'data> PartialOrd for JsChange<'alloc, 'data> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<'alloc, 'data> Transform<'alloc> for JsChange<'alloc, 'data> {
    type ToLowLevelData = Config;

    fn span(&self) -> Span {
        self.span
    }

    fn into_low_level(self, _data: &Self::ToLowLevelData, _offset: i32) -> TransformLL<'alloc> {
        match self.ty {
            JsChangeType::InsertLeft(text)
            | JsChangeType::InsertRight(text)
            | JsChangeType::WrapFnRight(text)
            | JsChangeType::RascalErrFn(text) => TransformLL {
                ty: TransformType::Insert,
                change: smallvec![TransformElement::Str(text.as_ref())],
            },
            JsChangeType::Replace(text) => TransformLL {
                ty: TransformType::Replace,
                change: smallvec![TransformElement::Str(text.as_ref())],
            },
        }
    }
}