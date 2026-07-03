// Fast repeated quantile queries with CumulativeHistogram.
//
// Run with:  node examples/cumulative_quantiles.js
//
// A CumulativeHistogram (the Rust crate's CumulativeROHistogram) stores only
// non-zero buckets with cumulative counts, so quantiles are answered with a
// binary search and a midpoint-estimated mean is precomputed once.

import { Histogram } from '../src/index.js';

const h = new Histogram(5, 20); // coarser buckets keep the printout short

// A simple triangular-ish distribution over [1, 1000].
for (let v = 1; v <= 1000; v++) {
  h.record(v, v % 7); // varying weights
}

const c = h.toCumulative();

console.log('total observations:', c.totalCount());
console.log('midpoint-estimated mean:', c.mean().toFixed(1));

// O(log n) quantile queries — cheap to call many times.
for (const q of [0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
  const b = c.percentile(q);
  console.log(`  q=${q.toFixed(2)} -> value ~${Math.round(b.midpoint)} (bucket [${b.start}, ${b.end}])`);
}

// Each stored bucket also carries the fraction of data at/below it — handy for
// drawing a CDF / ECDF.
console.log('\nfirst few non-zero buckets with their quantile span:');
let shown = 0;
for (const [bucket, lo, hi] of c.iterWithQuantiles()) {
  console.log(
    `  [${bucket.start}, ${bucket.end}] count=${bucket.count}  quantiles ${lo.toFixed(3)}..${hi.toFixed(3)}`
  );
  if (++shown === 5) break;
}
