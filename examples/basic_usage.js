// Basic usage: record a distribution of latencies and query percentiles.
//
// Run with:  node examples/basic_usage.js
//
// (Examples import from the local source; when using the published package,
// import from 'h2-histogram' instead.)

import { Histogram } from '../src/index.js';

// grouping_power = 7 -> ~0.78% relative error; max_value_power = 30 -> values
// up to 2^30 - 1 (~1e9), plenty for microsecond latencies.
const h = new Histogram(7, 30);

// Record 10k synthetic latency samples (in microseconds) from a couple of
// deterministic modes, so the output is stable across runs.
for (let i = 0; i < 8000; i++) {
  // a tight cluster around ~500us
  h.increment(400 + (i % 200));
}
for (let i = 0; i < 2000; i++) {
  // a heavier tail around ~50ms
  h.increment(40000 + (i % 20000));
}

console.log('total samples:', h.totalCount());

for (const q of [0.5, 0.9, 0.99, 1.0]) {
  const b = h.percentile(q);
  console.log(
    `p${(q * 100).toFixed(0).padStart(3)}: ` +
      `[${b.start}, ${b.end}] us  (midpoint ~${Math.round(b.midpoint)} us, width ${b.width})`
  );
}

// You can also fetch several percentiles at once (input order preserved).
const [[, median], [, tail]] = h.percentiles([0.5, 0.999]);
console.log(`\nmedian ~${Math.round(median.midpoint)} us, p99.9 ~${Math.round(tail.midpoint)} us`);

// Weighted recording and bulk recording.
const h2 = new Histogram(7, 30);
h2.record(1000, 5); // 5 observations of 1000
h2.recordMany([10, 20, 30, 1000]); // one each
console.log('\nh2 total:', h2.totalCount(), '(expected 9)');
