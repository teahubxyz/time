// Line diffs for the chair view and the patch download. Myers' O(ND) algorithm, then unified-diff hunks.

const lines = (s) => (s === "" ? [] : s.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n"));

// Edit script between two line arrays: [{op: " " | "-" | "+", line}].
export function diffLines(a, b) {
  const n = a.length, m = b.length, max = n + m;
  const v = new Int32Array(2 * max + 2), trace = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[max + k - 1] < v[max + k + 1]) ? v[max + k + 1] : v[max + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[max + k] = x;
      if (x >= n && y >= m) return backtrack(trace, a, b, max);
    }
  }
  return [];
}

function backtrack(trace, a, b, max) {
  const out = [];
  let x = a.length, y = b.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d], k = x - y;
    const prevK = k === -d || (k !== d && v[max + k - 1] < v[max + k + 1]) ? k + 1 : k - 1;
    const prevX = v[max + prevK], prevY = prevX - prevK;
    while (x > prevX && y > prevY) out.push({ op: " ", line: a[--x] }), y--;
    if (d > 0) out.push(x === prevX ? { op: "+", line: b[--y] } : { op: "-", line: a[--x] });
  }
  return out.reverse();
}

// Unified diff of one file. Returns {text, added, removed}; text is "" when nothing changed.
export function unified(path, before, after, context = 3) {
  const a = lines(before ?? ""), b = lines(after ?? "");
  const ops = diffLines(a, b);
  let added = 0, removed = 0;
  for (const o of ops) o.op === "+" ? added++ : o.op === "-" ? removed++ : 0;
  if (!added && !removed) return { text: "", added, removed };
  const hunks = [];
  let i = 0, ai = 0, bi = 0;
  while (i < ops.length) {
    if (ops[i].op === " ") { i++; ai++; bi++; continue; }
    const start = Math.max(0, i - context);
    let end = i, j = i;
    while (j < ops.length) {
      if (ops[j].op !== " ") { end = j; j++; continue; }
      let run = 0;
      while (j + run < ops.length && ops[j + run].op === " ") run++;
      if (j + run >= ops.length || run > 2 * context) break;
      j += run;
    }
    const stop = Math.min(ops.length, end + 1 + context);
    const lead = i - start;
    let aStart = ai - lead, bStart = bi - lead, aLen = 0, bLen = 0;
    const body = [];
    for (let t = start; t < stop; t++) {
      const o = ops[t];
      body.push(o.op + o.line);
      if (o.op !== "+") aLen++;
      if (o.op !== "-") bLen++;
    }
    for (let t = i; t < stop; t++) {
      if (ops[t].op !== "+") ai++;
      if (ops[t].op !== "-") bi++;
    }
    hunks.push(`@@ -${aLen ? aStart + 1 : aStart},${aLen} +${bLen ? bStart + 1 : bStart},${bLen} @@\n${body.join("\n")}`);
    i = stop;
  }
  const from = before == null ? "/dev/null" : `a/${path}`, to = after == null ? "/dev/null" : `b/${path}`;
  return { text: `--- ${from}\n+++ ${to}\n${hunks.join("\n")}\n`, added, removed };
}
