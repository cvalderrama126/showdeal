'use strict';

const {
  findUnsafeDynamicHtml,
  expressionLooksSafe,
} = require('../scripts/lint-frontend-security');

describe('frontend-security-lint', () => {
  test('accepts escaped dynamic HTML expression', () => {
    expect(expressionLooksSafe('escapeHtml(row.name)')).toBe(true);

    const source = [
      'const host = document.getElementById("x");',
      'host.innerHTML = `<div>${escapeHtml(row.name)}</div>`;',
    ].join('\n');

    expect(findUnsafeDynamicHtml(source)).toEqual([]);
  });

  test('reports non-escaped dynamic HTML expression', () => {
    const source = [
      'const host = document.getElementById("x");',
      'host.innerHTML = `<div>${row.name}</div>`;',
    ].join('\n');

    const findings = findUnsafeDynamicHtml(source);
    expect(findings).toHaveLength(1);
    expect(findings[0].expression).toBe('row.name');
  });

  test('reports insertAdjacentHTML with non-escaped expression', () => {
    const source = [
      'const host = document.getElementById("x");',
      'host.insertAdjacentHTML("beforeend", `<span>${err.message}</span>`);',
    ].join('\n');

    const findings = findUnsafeDynamicHtml(source);
    expect(findings).toHaveLength(1);
    expect(findings[0].expression).toBe('err.message');
  });
});
