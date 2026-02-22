use oxc::span::Span;
use smallvec::SmallVec;

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransformType {
    Insert = 0,
    Replace = 1,
}

#[derive(Debug, Clone)]
pub struct TransformLL<'a> {
    pub ty: TransformType,
    pub change: SmallVec<[TransformElement<'a>; 8]>,
}

#[derive(Debug, Clone)]
pub enum TransformElement<'a> {
    Str(&'a str),
    U32(u32),
}

pub trait Transform<'a>: Ord {
    type ToLowLevelData: 'a;
    fn span(&self) -> Span;
    fn into_low_level(self, data: &Self::ToLowLevelData, offset: i32) -> TransformLL<'a>;
}

#[derive(Debug, Clone)]
pub struct TransformRecord {
    pub output_pos: u32,
    pub size: u32,
    pub ty: TransformType,
    pub original: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct TransformOutput {
    pub output: Vec<u8>,
    pub sourcemap: Vec<u8>,
    pub records: Vec<TransformRecord>,
}