#[test]
fn rewrites_js_test_fixtures() {
    native::test_runner::run("tests").expect("native fixture tests should pass");
}
