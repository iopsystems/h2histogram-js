The H2Histogram provides a histogram that is conceptually similar to
[HdrHistogram](http://hdrhistogram.org) but with base-2 buckets, which makes it
noticeably faster. This introduces small modifications to the configurable
options as well.

This module is a pure Javascript implementation of the algorithm, which is
described at [h2histogram.org](https://h2histogram.org).

H2Encoding encodes values from the integer range [0, 2^n) into base-2 logarithmic
bins with a controllable relative error bound.

The number of bins must be less than 2^32, and the largest encodable value must
be less than 2^53.

The histogram is designed to encode integer values only.

## Two APIs

This package ships two complementary surfaces:

1. **`H2Encoding` / `H2HistogramBuilder` / `H2Histogram`** — the original
   JavaScript-native API, parameterized by `{ a, b, n }`, where `a` sets the
   width (`2^a`) of the linear buckets on the low end.

2. **Canonical-compatible API** (`Config`, `Histogram`, `SparseHistogram`,
   `CumulativeHistogram`, `Bucket`) — mirrors the iopsystems
   [`histogram`](https://github.com/iopsystems/histogram) Rust crate (the
   canonical implementation) and its
   [Python](https://github.com/iopsystems/h2histogram-py) and
   [Go](https://github.com/iopsystems/h2histogram-go) ports, using
   `groupingPower` / `maxValuePower`.

The two are interchangeable: a canonical `Config(groupingPower, maxValuePower)`
is exactly `new H2Encoding({ a: 0, b: groupingPower, n: maxValuePower })` — the
canonical implementation always uses width-1 linear buckets — so the canonical
API reuses the same (property-tested) encoding under the hood and produces
**byte-for-byte identical bucketing** to the Rust crate. This means a histogram
recorded by Rezolus, or by the Python/Go implementations, can be loaded and
analyzed here (and vice versa).

### 53-bit values

JavaScript numbers are 64-bit floats, so unlike the Rust/Go implementations
(which support the full `u64` range up to `maxValuePower = 64`), this library
caps `maxValuePower` at **53** — values up to `2^53 - 1`. Below that limit the
bucketing is identical across all implementations.

## Canonical API quick start

```js
import { Histogram } from 'h2-histogram';

const h = new Histogram(7, 53); // groupingPower, maxValuePower (default 53)
h.increment(42);
h.record(1000, 5);              // value, count
h.recordMany([12, 15, 900]);    // bulk

h.totalCount();                 // 8

const p99 = h.percentile(0.99); // a Bucket, or null if empty
p99.range;                      // [lo, hi] inclusive
p99.midpoint;                   // midpoint estimate

// Combine / reduce
const coarse = h.downsample(4); // fewer buckets, higher error, same total count
const sparse = h.toSparse();    // columnar (index, count) form for storage
```

### Fast repeated quantile queries

For a snapshot you'll query many times, convert to a `CumulativeHistogram`
(the crate's `CumulativeROHistogram`). It stores non-zero buckets with
**cumulative** counts, so percentiles are answered with a binary search, and it
precomputes a midpoint-estimated `mean`:

```js
const c = h.toCumulative();      // read-only; also SparseHistogram#toCumulative()
c.percentile(0.99);              // O(log n) -> Bucket (individual count)
c.mean();                        // midpoint-estimated mean, computed once
c.bucketQuantileRange(0);        // [lower, upper] quantile fraction of a stored bucket
for (const [bucket, lo, hi] of c.iterWithQuantiles()) {
  // each non-zero bucket with its quantile span
}
```

### Interop with columnar (Rezolus) data

```js
import { Config, SparseHistogram, CumulativeHistogram } from 'h2-histogram';

const config = new Config(3, 53);                 // Rezolus-style config
const sparse = SparseHistogram.fromParts(config, bucketIndices, bucketCounts);
const cumulative = sparse.toCumulative();
cumulative.percentile(0.999);
```

## API overview

| Type | Purpose |
|------|---------|
| `Config` | Bucketing parameters; `valueToIndex`, `indexToRange`, `totalBuckets`, `error`, `fromTotalBuckets` |
| `Histogram` | Dense histogram; `increment`, `record`, `recordMany`, `percentile(s)`, `merge`, `subtract`, `downsample`, `toSparse`, `toCumulative`, `fromBuckets` |
| `SparseHistogram` | Columnar `(index, count)` form; `fromHistogram`, `fromParts`, `toDense`, `toCumulative` |
| `CumulativeHistogram` | Read-only cumulative form (crate's `CumulativeROHistogram`); binary-search `percentile(s)`, `mean`, `bucketQuantileRange`, `iterWithQuantiles` |
| `Bucket` | A bucket's `count` and inclusive `[start, end]` range, plus `midpoint`/`width` |
| `H2Encoding`, `H2HistogramBuilder`, `H2Histogram`, `encode32`, `decode32` | The original `{ a, b, n }` API (unchanged) |

## Examples

Runnable examples live in [`examples/`](examples):

- [`basic_usage.js`](examples/basic_usage.js) — record a distribution and query percentiles
- [`cumulative_quantiles.js`](examples/cumulative_quantiles.js) — fast repeated quantiles, mean, and per-bucket quantile spans via `CumulativeHistogram`
- [`interop_columnar.js`](examples/interop_columnar.js) — load a histogram from columnar `(index, count)` data (the Rezolus / cross-language storage form)

```bash
node examples/basic_usage.js
```

## Related implementations

The h2 histogram bucketing is implemented in several languages, all producing
byte-for-byte identical buckets so histograms interoperate across them:

- [**Rust**](https://github.com/iopsystems/histogram) — the canonical
  implementation (`histogram` crate)
- [**Python**](https://github.com/iopsystems/h2histogram-py)
- [**Go**](https://github.com/iopsystems/h2histogram-go)
- [**JavaScript**](https://github.com/iopsystems/h2histogram-js) — this
  repository (values up to `2^53 - 1`)
