function fx(a = location) {
  return a;
}
check(fx());

const gx = (a = top) => a;
check(gx());