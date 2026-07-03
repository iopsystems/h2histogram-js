import { describe, expect, test } from 'vitest';
import {
  Bucket,
  Config,
  CumulativeHistogram,
  H2Encoding,
  Histogram,
  SparseHistogram,
  encode32,
} from './index.js';

// The canonical-compatible layer mirrors the iopsystems `histogram` crate and
// its Python/Go ports. JS numbers are 64-bit floats, so we cap `maxValuePower`
// at 53 rather than 64, but the bucketing below the maximum is identical.
//
// The value_to_index / index_to_bound assertions below are taken verbatim from
// the Rust crate's `src/config.rs` unit tests. They are independent of
// `max_value_power` (except for the final bucket), so with grouping_power=7 we
// get byte-for-byte identical bucketing to the canonical crate.

describe('Config', () => {
  test('total buckets', () => {
    expect(new Config(7, 53).totalBuckets).toBe(6016);
    // A canonical Config is exactly H2Encoding with a = 0.
    expect(new Config(7, 53).totalBuckets).toBe(new H2Encoding({ a: 0, b: 7, n: 53 }).numBins());
    expect(new Config(3, 53).totalBuckets).toBe(new H2Encoding({ a: 0, b: 3, n: 53 }).numBins());
  });

  test('valueToIndex matches the Rust crate', () => {
    const c = new Config(7, 53);
    expect(c.valueToIndex(0)).toBe(0);
    expect(c.valueToIndex(1)).toBe(1);
    expect(c.valueToIndex(256)).toBe(256);
    expect(c.valueToIndex(257)).toBe(256);
    expect(c.valueToIndex(258)).toBe(257);
    expect(c.valueToIndex(512)).toBe(384);
    expect(c.valueToIndex(515)).toBe(384);
    expect(c.valueToIndex(516)).toBe(385);
    expect(c.valueToIndex(1024)).toBe(512);
    expect(c.valueToIndex(1031)).toBe(512);
    expect(c.valueToIndex(1032)).toBe(513);
  });

  test('valueToIndex agrees with encode32 (a=0)', () => {
    const c = new Config(7, 53);
    for (const v of [0, 1, 255, 256, 257, 1000, 65535, 65536, 1 << 20, (1 << 30) - 1]) {
      expect(c.valueToIndex(v)).toBe(encode32(v, 0, 7));
    }
  });

  test('index to bounds match the Rust crate', () => {
    const c = new Config(7, 53);
    expect(c.indexToLowerBound(0)).toBe(0);
    expect(c.indexToLowerBound(1)).toBe(1);
    expect(c.indexToLowerBound(256)).toBe(256);
    expect(c.indexToLowerBound(384)).toBe(512);
    expect(c.indexToLowerBound(512)).toBe(1024);

    expect(c.indexToUpperBound(0)).toBe(0);
    expect(c.indexToUpperBound(1)).toBe(1);
    expect(c.indexToUpperBound(256)).toBe(257);
    expect(c.indexToUpperBound(384)).toBe(515);
    expect(c.indexToUpperBound(512)).toBe(1031);

    expect(c.indexToRange(256)).toEqual([256, 257]);
    // The last bucket's upper bound is the configured maximum.
    expect(c.indexToUpperBound(c.totalBuckets - 1)).toBe(2 ** 53 - 1);
  });

  test('roundtrip value -> index -> range contains the value', () => {
    const c = new Config(7, 53);
    for (const value of [0, 1, 5, 127, 128, 255, 256, 257, 999, 1_000_000, 2 ** 40 + 7, 2 ** 52 + 3]) {
      const idx = c.valueToIndex(value);
      const [lo, hi] = c.indexToRange(idx);
      expect(lo <= value && value <= hi).toBe(true);
    }
  });

  test('error', () => {
    expect(new Config(7, 53).error()).toBeCloseTo(100 / 128, 12);
    expect(new Config(3, 4).error()).toBe(0);
  });

  test('invalid params', () => {
    expect(() => new Config(7, 54)).toThrow(); // exceeds JS 53-bit limit
    expect(() => new Config(53, 53)).toThrow(); // grouping >= max
    expect(() => new Config(10, 5)).toThrow();
  });

  test('fromTotalBuckets', () => {
    const c = Config.fromTotalBuckets(6016, 53);
    expect(c.groupingPower).toBe(7);
    expect(c.maxValuePower).toBe(53);
    expect(() => Config.fromTotalBuckets(6017, 53)).toThrow();
  });
});

describe('Histogram', () => {
  test('increment and total', () => {
    const h = new Histogram(7, 53);
    for (let i = 0; i <= 100; i++) h.increment(i);
    expect(h.totalCount()).toBe(101);
  });

  test('record with count', () => {
    const h = new Histogram(7, 53);
    h.record(100, 5);
    expect(h.totalCount()).toBe(5);
    expect(h.buckets[h.config.valueToIndex(100)]).toBe(5);
  });

  test('percentile exact in linear region', () => {
    const h = new Histogram(7, 53);
    for (let i = 1; i <= 100; i++) h.increment(i);
    expect(h.percentile(0.5)).toEqual(new Bucket(1, 50, 50));
    expect(h.percentile(1.0)).toEqual(new Bucket(1, 100, 100));
    expect(h.percentile(0.0)).toEqual(new Bucket(1, 1, 1));
  });

  test('percentile empty', () => {
    const h = new Histogram(7, 53);
    expect(h.percentile(0.5)).toBeNull();
    expect(h.percentiles([0.5, 0.9])).toBeNull();
  });

  test('percentiles preserve requested order', () => {
    const h = new Histogram(7, 53);
    for (let i = 0; i < 1000; i++) h.increment(i);
    const result = h.percentiles([0.9, 0.5, 0.99]) ?? [];
    expect(result.map(([p]) => p)).toEqual([0.9, 0.5, 0.99]);
  });

  test('percentile invalid', () => {
    const h = new Histogram(7, 53);
    h.increment(1);
    expect(() => h.percentile(1.5)).toThrow();
  });

  test('merge', () => {
    const a = new Histogram(7, 53);
    const b = new Histogram(7, 53);
    a.record(10, 3);
    b.record(10, 4);
    b.record(2000, 1);
    const merged = a.merge(b);
    expect(merged.totalCount()).toBe(8);
    expect(merged.buckets[merged.config.valueToIndex(10)]).toBe(7);
  });

  test('merge incompatible', () => {
    expect(() => new Histogram(7, 53).merge(new Histogram(6, 53))).toThrow();
  });

  test('subtract', () => {
    const a = new Histogram(7, 53);
    const b = new Histogram(7, 53);
    a.record(10, 5);
    b.record(10, 2);
    expect(a.subtract(b).totalCount()).toBe(3);
    expect(() => b.subtract(a)).toThrow();
  });

  test('fromBuckets roundtrip', () => {
    const h = new Histogram(3, 53);
    h.record(5, 2);
    h.record(1000, 7);
    const h2 = Histogram.fromBuckets(3, 53, h.buckets);
    expect(h.equals(h2)).toBe(true);
  });

  test('fromBuckets wrong length', () => {
    expect(() => Histogram.fromBuckets(7, 53, [0, 0, 0])).toThrow();
  });

  test('downsample', () => {
    const h = new Histogram(7, 53);
    for (let i = 0; i < 10000; i++) h.increment(i);
    const coarse = h.downsample(3);
    expect(coarse.config.groupingPower).toBe(3);
    expect(coarse.totalCount()).toBe(h.totalCount());
    expect(() => h.downsample(7)).toThrow();
  });

  test('recordMany matches loop', () => {
    const base = [0, 1, 2, 300, 255, 256, 1024, 1_000_000, 2 ** 50 + 3];
    const values = [];
    for (let i = 0; i < 111; i++) values.push(...base);
    const a = new Histogram(7, 53);
    for (const v of values) a.increment(v);
    const b = new Histogram(7, 53);
    b.recordMany(values);
    expect(a.equals(b)).toBe(true);
  });

  test('recordMany with counts', () => {
    const a = new Histogram(7, 53);
    a.recordMany([10, 20, 10], [2, 3, 5]);
    expect(a.totalCount()).toBe(10);
    expect(a.buckets[a.config.valueToIndex(10)]).toBe(7);
  });

  test('iterate buckets', () => {
    const h = new Histogram(3, 6);
    h.increment(0);
    const all = [...h];
    expect(all.length).toBe(h.config.totalBuckets);
    expect(all.every((b) => b instanceof Bucket)).toBe(true);
    const nonzero = h.nonzeroBuckets();
    expect(nonzero.length).toBe(1);
    expect(nonzero[0].count).toBe(1);
  });
});

describe('SparseHistogram', () => {
  test('roundtrip', () => {
    const h = new Histogram(7, 53);
    h.record(1, 1);
    h.record(500, 3);
    h.record(999999, 2);
    const sparse = h.toSparse();
    expect(sparse).toBeInstanceOf(SparseHistogram);
    expect(sparse.totalCount()).toBe(h.totalCount());
    expect(sparse.length).toBe(3);
    expect([...sparse.index]).toEqual([...sparse.index].sort((a, b) => a - b));
    expect(sparse.toDense().equals(h)).toBe(true);
  });

  test('fromParts validation', () => {
    const c = new Config(7, 53);
    expect(() => SparseHistogram.fromParts(c, [1, 2], [1])).toThrow();
    expect(() => SparseHistogram.fromParts(c, [2, 1], [1, 1])).toThrow();
    expect(() => SparseHistogram.fromParts(c, [999999999], [1])).toThrow();
  });
});

describe('CumulativeHistogram', () => {
  test('cumulative counts are prefix sums', () => {
    const h = new Histogram(7, 53);
    h.record(1, 2);
    h.record(500, 3);
    h.record(1_000_000, 5);
    const c = h.toCumulative();
    expect(c.totalCount()).toBe(10);
    expect(c.length).toBe(3);
    expect([...c.count]).toEqual([2, 5, 10]);
  });

  test('percentile matches dense', () => {
    const h = new Histogram(7, 53);
    for (let i = 1; i <= 1000; i++) h.increment(i);
    const c = h.toCumulative();
    for (const q of [0.0, 0.1, 0.5, 0.9, 0.99, 1.0]) {
      const dense = h.percentile(q);
      const cum = c.percentile(q);
      expect(cum?.range).toEqual(dense?.range);
    }
  });

  test('empty', () => {
    const c = new Histogram(7, 53).toCumulative();
    expect(c.isEmpty()).toBe(true);
    expect(c.percentile(0.5)).toBeNull();
    expect(c.mean()).toBeNull();
  });

  test('mean (exact in linear region)', () => {
    const h = new Histogram(7, 53);
    h.record(10, 1);
    h.record(20, 1);
    h.record(30, 1);
    expect(h.toCumulative().mean()).toBeCloseTo(20, 9);
  });

  test('fromParts validation', () => {
    const c = new Config(7, 53);
    expect(CumulativeHistogram.fromParts(c, [1, 256], [3, 8]).totalCount()).toBe(8);
    expect(() => CumulativeHistogram.fromParts(c, [1], [0])).toThrow();
    expect(() => CumulativeHistogram.fromParts(c, [1, 2], [5, 3])).toThrow();
  });

  test('bucketQuantileRange', () => {
    const h = new Histogram(7, 53);
    h.record(10, 2);
    h.record(20, 2);
    const c = h.toCumulative();
    expect(c.bucketQuantileRange(0)).toEqual([0, 0.5]);
    expect(c.bucketQuantileRange(1)).toEqual([0.5, 1.0]);
    expect(c.bucketQuantileRange(99)).toBeNull();
  });

  test('fromSparse roundtrip', () => {
    const h = new Histogram(7, 53);
    h.record(1, 1);
    h.record(500, 3);
    const c = h.toSparse().toCumulative();
    expect(c.totalCount()).toBe(4);
    expect(c.toDense().equals(h)).toBe(true);
  });
});
