function f(location) {
  if (location !== 1) {
    throw new Error("shadowed parameter was rewritten");
  }
  return location;
}
check(f(1));