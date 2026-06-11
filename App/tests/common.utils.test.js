'use strict';

const {
  parseYmdDate,
  getLatestCredential,
  toBigIntOrNull,
  parseInteger,
  mergeAdditional,
} = require('../src/utils/common');

describe('utils/common', () => {
  describe('parseYmdDate', () => {
    it('parses a valid YYYY-MM-DD string into a UTC Date', () => {
      const d = parseYmdDate('2026-06-11');
      expect(d).toBeInstanceOf(Date);
      expect(d.toISOString()).toBe('2026-06-11T00:00:00.000Z');
    });

    it('returns null for non-string input', () => {
      expect(parseYmdDate(null)).toBeNull();
      expect(parseYmdDate(undefined)).toBeNull();
      expect(parseYmdDate(20260611)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseYmdDate('')).toBeNull();
    });

    it('returns null for an invalid date string', () => {
      expect(parseYmdDate('not-a-date')).toBeNull();
    });
  });

  describe('getLatestCredential', () => {
    it('returns null for empty or non-array input', () => {
      expect(getLatestCredential([])).toBeNull();
      expect(getLatestCredential(null)).toBeNull();
      expect(getLatestCredential('nope')).toBeNull();
    });

    it('returns the credential with the most recent created date', () => {
      const creds = [
        { id: 1, created: '2025-01-01' },
        { id: 2, created: '2026-03-15' },
        { id: 3, created: '2024-12-31' },
      ];
      expect(getLatestCredential(creds)).toEqual({ id: 2, created: '2026-03-15' });
    });

    it('falls back to the last item when no valid dates exist', () => {
      const creds = [
        { id: 1, created: 'bad' },
        { id: 2, created: null },
        { id: 3 },
      ];
      expect(getLatestCredential(creds)).toEqual({ id: 3 });
    });

    it('returns null when the fallback last item is not an object', () => {
      expect(getLatestCredential(['x', 'y'])).toBeNull();
    });
  });

  describe('toBigIntOrNull', () => {
    it('converts numeric strings to BigInt', () => {
      expect(toBigIntOrNull('42')).toBe(42n);
      expect(toBigIntOrNull(7)).toBe(7n);
    });

    it('returns null for non-numeric or empty values', () => {
      expect(toBigIntOrNull('abc')).toBeNull();
      expect(toBigIntOrNull('')).toBeNull();
      expect(toBigIntOrNull(null)).toBeNull();
      expect(toBigIntOrNull('1.5')).toBeNull();
    });
  });

  describe('parseInteger', () => {
    it('parses valid integers', () => {
      expect(parseInteger('10', 0)).toBe(10);
    });

    it('returns fallback for NaN', () => {
      expect(parseInteger('abc', 5)).toBe(5);
    });

    it('returns fallback when below min', () => {
      expect(parseInteger('-3', 1, { min: 0 })).toBe(1);
    });

    it('clamps to max', () => {
      expect(parseInteger('1000', 10, { max: 100 })).toBe(100);
    });

    it('uses fallback when value is undefined', () => {
      expect(parseInteger(undefined, 99)).toBe(99);
    });
  });

  describe('mergeAdditional', () => {
    it('merges two objects with patch taking precedence', () => {
      expect(mergeAdditional({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('handles non-object base and patch gracefully', () => {
      expect(mergeAdditional(null, { a: 1 })).toEqual({ a: 1 });
      expect(mergeAdditional({ a: 1 }, null)).toEqual({ a: 1 });
      expect(mergeAdditional(undefined, undefined)).toEqual({});
    });
  });
});
