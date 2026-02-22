use std::{fs, path::Path};

use boa_engine::{Context, Source};
use walkdir::WalkDir;

use crate::rewriter::NativeRewriter;

const HARNESS: &str = r#"
(() => {
  globalThis.window = globalThis;
  globalThis.top = globalThis;
  globalThis.parent = globalThis;
  globalThis.eval = eval;
  let __location = "location";
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    get() { return __location; },
    set(v) { __location = v; }
  });

  globalThis.$webrascal$wrap = function(v) {
    if (v === globalThis || v === globalThis.top || v === globalThis.parent || v === "location") return "";
    return v;
  };

  globalThis.$webrascal$prop = function(prop) {
    if (["location", "top", "parent", "eval"].includes(prop)) return "$webrascal__" + prop;
    return prop;
  };

  globalThis.$webrascal$tryset = function(target, _op, _value) {
    return target === "location";
  };

  globalThis.$webrascal$setrealm = function(obj) { return obj; };
  globalThis.$webrascal$rewrite = function(js) { return js; };
  globalThis.$webrascal$meta = function(v) { return v; };
  globalThis.$webrascal$import = function() { return Promise.resolve({}); };
  globalThis.$webrascal$clean = function() {};

  Object.defineProperty(Object.prototype, "$webrascal__location", {
    configurable: true,
    get() { return ""; },
    set(_) { }
  });
  Object.defineProperty(Object.prototype, "$webrascal__top", {
    configurable: true,
    get() { return ""; },
    set(_) { }
  });
  Object.defineProperty(Object.prototype, "$webrascal__parent", {
    configurable: true,
    get() { return ""; },
    set(_) { }
  });
  Object.defineProperty(Object.prototype, "$webrascal__eval", {
    configurable: true,
    get() { return eval; },
    set(_) { }
  });

  globalThis.check = function(val) {
    if (val === globalThis || val === globalThis.top || val === "location") {
      throw new Error("unsafe value leaked");
    }
    return true;
  };
})();
"#;

pub fn run(dir: &str) -> anyhow::Result<()> {
    let mut runner = NativeRewriter::new();
    let root = Path::new(dir);
    if !root.exists() {
        anyhow::bail!("test dir not found: {}", root.display());
    }

    let mut passed = 0usize;
    let mut failed = 0usize;

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("js"))
    {
        let path = entry.path();
        let src = fs::read(path)?;
        let rewritten = runner.rewrite(
            &src,
            "https://example.com/".to_string(),
            path.display().to_string(),
            false,
        )?;

        let rewritten_text = String::from_utf8_lossy(&rewritten.js).to_string();
        let combined = format!("{}\n{}", HARNESS, rewritten_text);

        let mut context = Context::default();
        let result = context.eval(Source::from_bytes(combined.as_bytes()));
        match result {
            Ok(_) => {
                passed += 1;
                println!("PASS {}", path.display());
            }
            Err(err) => {
                failed += 1;
                eprintln!("FAIL {} => {err}", path.display());
            }
        }
    }

    if failed > 0 {
        anyhow::bail!("{} test files failed ({} passed)", failed, passed);
    }

    println!("all tests passed ({passed})");
    Ok(())
}
