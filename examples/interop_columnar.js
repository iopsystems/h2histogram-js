// Interop: load a histogram from columnar (index, count) data.
//
// Run with:  node examples/interop_columnar.js
//
// This is the shape Rezolus and the Rust/Python/Go implementations use for
// storage: a Config plus two parallel arrays of non-zero bucket indices and
// their counts. Because the bucketing is byte-for-byte identical across
// implementations, a snapshot produced elsewhere loads directly here.

import { Config, Histogram, SparseHistogram } from '../src/index.js';

// Rezolus records with grouping_power = 3. Use max_value_power = 53 (the JS max).
const config = new Config(3, 53);

// Pretend these came from a parquet column / another implementation.
// Build them here from a dense histogram so the example is self-contained.
const source = new Histogram(3, 53);
source.record(5, 10);
source.record(500, 42);
source.record(1_000_000, 7);
source.record(2 ** 40, 3);

const sparse = source.toSparse();
const bucketIndices = [...sparse.index];
const bucketCounts = [...sparse.count];
console.log('columnar form:');
console.log('  indices:', bucketIndices);
console.log('  counts :', bucketCounts);

// ...and load them back through the public columnar entry point.
const loaded = SparseHistogram.fromParts(config, bucketIndices, bucketCounts);
console.log('\nloaded total:', loaded.totalCount());

// Query it (via the dense or cumulative view).
const c = loaded.toCumulative();
const p99 = c.percentile(0.99);
console.log(`p99 ~ ${p99.start}..${p99.end}`);

// The index<->value mapping is exposed on Config, matching the Rust crate.
const idx = config.valueToIndex(1000);
const [lo, hi] = config.indexToRange(idx);
console.log(`\nvalue 1000 -> bucket ${idx} covering [${lo}, ${hi}] (total buckets: ${config.totalBuckets})`);
