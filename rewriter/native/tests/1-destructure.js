let target = { location: 1, top: 2, parent: 3 };
({ location } = target);
check(location);

let arr = ["x", "y"];
([location] = arr);
check(location);

for ({ location } of [{ location: "a" }]) {
  check(location);
}

function f({ location: inner, ...rest }) {
  check(inner);
  check(rest.top);
}
f({ location: "ok", top: "ok" });

try {
  throw { location: "err" };
} catch ({ location: caught }) {
  check(caught);
}