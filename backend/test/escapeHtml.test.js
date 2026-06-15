const { test } = require('node:test');
const assert = require('node:assert');
const { escapeHtml } = require('../utils/escapeHtml');

test('escapes HTML-special characters', () => {
  assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
  assert.strictEqual(escapeHtml('a & b'), 'a &amp; b');
  assert.strictEqual(escapeHtml('"quoted"'), '&quot;quoted&quot;');
  assert.strictEqual(escapeHtml("O'Brien"), 'O&#39;Brien');
});

test('neutralizes an injection payload', () => {
  const out = escapeHtml('<img src=x onerror=alert(1)>');
  assert.ok(!out.includes('<img'), 'tag opener must be escaped');
  assert.ok(!out.includes('>'), 'tag closer must be escaped');
});

test('handles null / undefined / numbers safely', () => {
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
  assert.strictEqual(escapeHtml(12345), '12345');
});
