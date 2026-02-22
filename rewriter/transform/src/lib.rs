use oxc::span::Span;
use smallvec::SmallVec;

pub mod transform;

pub use transform::{
    Transform, TransformElement, TransformLL, TransformOutput, TransformRecord, TransformType,
};

#[derive(Debug)]
pub struct Transformer<'alloc, 'data, T: Transform<'data>> {
    pub alloc: Option<&'alloc oxc::allocator::Allocator>,
    inner: Vec<T>,
}

impl<'alloc, 'data, T: Transform<'data>> Default for Transformer<'alloc, 'data, T> {
    fn default() -> Self {
        Self {
            alloc: None,
            inner: Vec::new(),
        }
    }
}

impl<'alloc, 'data, T: Transform<'data>> Transformer<'alloc, 'data, T> {
    pub fn with_alloc(alloc: &'alloc oxc::allocator::Allocator) -> Self {
        Self {
            alloc: Some(alloc),
            inner: Vec::new(),
        }
    }

    pub fn add(&mut self, transform: T) {
        self.inner.push(transform);
    }

    pub fn extend<I>(&mut self, iter: I)
    where
        I: IntoIterator<Item = T>,
    {
        self.inner.extend(iter);
    }

    pub fn clear(&mut self) {
        self.inner.clear();
    }

    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    pub fn len(&self) -> usize {
        self.inner.len()
    }

    pub fn perform(
        &mut self,
        source: &'data str,
        data: &'data T::ToLowLevelData,
    ) -> TransformOutput {
        self.inner.sort();

        let mut out = Vec::with_capacity(source.len() + 128);
        let mut cursor: usize = 0;
        let mut offset: i32 = 0;
        let mut records = Vec::with_capacity(self.inner.len());

        for transform in self.inner.drain(..) {
            let span: Span = transform.span();
            let start = span.start as usize;
            let end = span.end as usize;
            if start < cursor || end < start || end > source.len() {
                continue;
            }

            out.extend_from_slice(&source.as_bytes()[cursor..start]);

            let ll = transform.into_low_level(data, offset);
            let output_pos = out.len() as u32;
            let mut rendered = Vec::new();
            for item in ll.change {
                match item {
                    TransformElement::Str(s) => rendered.extend_from_slice(s.as_bytes()),
                    TransformElement::U32(v) => rendered.extend_from_slice(v.to_string().as_bytes()),
                }
            }

            match ll.ty {
                TransformType::Insert => {
                    out.extend_from_slice(&rendered);
                    out.extend_from_slice(&source.as_bytes()[start..end]);
                    offset += rendered.len() as i32;
                    records.push(TransformRecord {
                        output_pos,
                        size: rendered.len() as u32,
                        ty: TransformType::Insert,
                        original: Vec::new(),
                    });
                }
                TransformType::Replace => {
                    let original = source.as_bytes()[start..end].to_vec();
                    out.extend_from_slice(&rendered);
                    let old_len = (end - start) as i32;
                    offset += rendered.len() as i32 - old_len;
                    records.push(TransformRecord {
                        output_pos,
                        size: rendered.len() as u32,
                        ty: TransformType::Replace,
                        original,
                    });
                }
            }

            cursor = end;
        }

        out.extend_from_slice(&source.as_bytes()[cursor..]);

        let mut map = Vec::with_capacity(8 + records.len() * 16);
        map.extend_from_slice(&(records.len() as u32).to_le_bytes());
        for record in &records {
            map.extend_from_slice(&record.output_pos.to_le_bytes());
            map.extend_from_slice(&record.size.to_le_bytes());
            map.push(record.ty as u8);
            if matches!(record.ty, TransformType::Replace) {
                map.extend_from_slice(&(record.original.len() as u32).to_le_bytes());
                map.extend_from_slice(&record.original);
            }
        }

        TransformOutput {
            output: out,
            sourcemap: map,
            records,
        }
    }
}