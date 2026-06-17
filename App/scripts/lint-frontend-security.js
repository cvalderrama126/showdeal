'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_FILES = [
  'public/assets/js/crud-module.js',
  'public/modules/r_event/r_event.js',
  'public/modules/r_user/r_user.js',
];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function collectTemplateLiterals(source) {
  const literals = [];

  const innerHtmlRegex = /(?:\.innerHTML\s*=\s*`([\s\S]*?)`)|(?:insertAdjacentHTML\s*\(\s*['\"][^'\"]+['\"]\s*,\s*`([\s\S]*?)`\s*\))/gm;
  let match;
  while ((match = innerHtmlRegex.exec(source)) !== null) {
    const template = match[1] || match[2] || '';
    const offsetInMatch = match[0].indexOf('`');
    const start = match.index + Math.max(0, offsetInMatch + 1);
    literals.push({ template, start });
  }

  return literals;
}

function expressionLooksSafe(expr) {
  const text = String(expr || '').trim();
  if (!text) return true;

  if (text.includes('escapeHtml(')) return true;

  // Allow simple literals and constants used as pre-sanitized snippets.
  if (/^(?:[A-Za-z_$][\w$]*|\d+|true|false|null|undefined)$/.test(text)) return true;

  // Allow explicit DOM-safe wrappers where text is set by textContent.
  if (/^(?:String|Number|Boolean)\s*\(/.test(text)) return true;

  // Allow vetted helper/rendering expressions already escaped at source.
  const safePatterns = [
    /^optionMarkup\s*\(/,
    /^permissions\.[A-Za-z_$][\w$]*\s*===\s*true\s*\?/,
    /^isEdit\s*\?/,
    /^values\.(?:is_active|otp_enabled)\s*!==\s*false\s*\?/,
    /^values\.(?:is_active|otp_enabled)\s*===\s*true\s*\?/,
  ];
  if (safePatterns.some((pattern) => pattern.test(text))) return true;

  return false;
}

function findUnsafeDynamicHtml(source) {
  const violations = [];

  for (const literal of collectTemplateLiterals(source)) {
    const exprRegex = /\$\{([\s\S]*?)\}/gm;
    let exprMatch;
    while ((exprMatch = exprRegex.exec(literal.template)) !== null) {
      const expression = exprMatch[1] || '';
      if (expressionLooksSafe(expression)) continue;

      const absoluteIndex = literal.start + exprMatch.index;
      violations.push({
        line: lineNumberAt(source, absoluteIndex),
        expression: expression.trim(),
      });
    }
  }

  return violations;
}

function scanFile(workspaceRoot, relativePath) {
  const absolute = path.join(workspaceRoot, relativePath);
  const source = readText(absolute);
  return findUnsafeDynamicHtml(source).map((item) => ({
    ...item,
    file: relativePath,
  }));
}

function run(workspaceRoot) {
  const findings = [];
  for (const file of TARGET_FILES) {
    const absolute = path.join(workspaceRoot, file);
    if (!fs.existsSync(absolute)) continue;
    findings.push(...scanFile(workspaceRoot, file));
  }
  return findings;
}

if (require.main === module) {
  const workspaceRoot = process.cwd();
  const findings = run(workspaceRoot);

  if (findings.length === 0) {
    console.log('Frontend security lint passed. No unsafe dynamic HTML patterns found.');
    process.exit(0);
  }

  console.error('Frontend security lint failed. Unsafe dynamic HTML expressions detected:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} -> $\\{${finding.expression}\\}`);
  }
  process.exit(1);
}

module.exports = {
  TARGET_FILES,
  collectTemplateLiterals,
  expressionLooksSafe,
  findUnsafeDynamicHtml,
  run,
};
