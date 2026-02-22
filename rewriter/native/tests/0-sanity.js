check(top);
check(location);
check(window.location);
check(top["loca" + "tion"]);

const x = eval("1 + 1");
check(x);