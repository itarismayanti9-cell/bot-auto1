// Unit test: account-block parser & serializer (no DB calls)
const assert = require('assert');
const { parseAccountBlocks, serializeBlocks, ACCOUNT_DELIM } = require('../src/services/stockService');

function test(name, fn) {
  try { fn(); console.log('✅', name); }
  catch (e) { console.error('❌', name, '\n  ', e.message); process.exitCode = 1; }
}

// 1) Multi-line single account → 1 block
test('single account (no delimiter) = 1 block', () => {
  const text = `Email\nuser@example.com\nPassword\nSecret1!`;
  const blocks = parseAccountBlocks(text);
  assert.strictEqual(blocks.length, 1);
  assert.ok(blocks[0].includes('user@example.com'));
});

// 2) Three accounts split by ====
test('3 accounts separated by ==== = 3 blocks', () => {
  const text = [
    'email1\npass1\nkey1',
    '====================',
    'email2\npass2\nkey2',
    '====================',
    'email3\npass3\nkey3',
  ].join('\n');
  const blocks = parseAccountBlocks(text);
  assert.strictEqual(blocks.length, 3);
  assert.ok(blocks[0].startsWith('email1'));
  assert.ok(blocks[2].endsWith('key3'));
});

// 3) Multi-line each account (AWS example) → 2 blocks, content preserved
test('AWS-style multi-line blocks preserved', () => {
  const text = [
    'Email',
    'a@b.com',
    'Password',
    'Vareta1166@.',
    'Console',
    'XXXXXXX',
    'AccessKey',
    'AKIA...',
    'SecretKey',
    'wo/yY...',
    '====================',
    'Email',
    'c@d.com',
    'Password',
    'Pass2!',
  ].join('\n');
  const blocks = parseAccountBlocks(text);
  assert.strictEqual(blocks.length, 2);
  assert.ok(blocks[0].includes('Vareta1166@.'));
  assert.ok(blocks[0].includes('AKIA...'));
  assert.ok(blocks[1].includes('c@d.com'));
  // exact line structure preserved
  assert.ok(blocks[0].split('\n').length >= 10);
});

// 4) -----END ACCOUNT----- delimiter also works
test('alt delimiter -----END ACCOUNT-----', () => {
  const text = 'a\nb\n-----END ACCOUNT-----\nc\nd';
  const blocks = parseAccountBlocks(text);
  assert.strictEqual(blocks.length, 2);
});

// 5) Dash delimiter (----)
test('dash delimiter ---- works', () => {
  const text = 'a\nb\n--------------------\nc\nd';
  const blocks = parseAccountBlocks(text);
  assert.strictEqual(blocks.length, 2);
});

// 6) Empty/whitespace handled
test('empty input → 0 blocks', () => {
  assert.strictEqual(parseAccountBlocks('').length, 0);
  assert.strictEqual(parseAccountBlocks('   \n\n   ').length, 0);
});

// 7) Trailing delimiter → no empty block
test('trailing delimiter ignored', () => {
  const text = 'a\nb\n====================\nc\nd\n====================\n';
  const blocks = parseAccountBlocks(text);
  assert.strictEqual(blocks.length, 2);
});

// 8) Serializer round-trip
test('serialize → parse round-trip preserves blocks', () => {
  const original = ['e1\np1\nk1', 'e2\np2\nk2', 'e3\np3\nk3'];
  const serialized = serializeBlocks(original);
  assert.ok(serialized.includes(ACCOUNT_DELIM));
  const reparsed = parseAccountBlocks(serialized);
  assert.deepStrictEqual(reparsed, original);
});

// 9) Whitespace-only inside block kept as part of block (no trim of internals)
test('blank line INSIDE block does not split', () => {
  const text = 'email\n\npassword\n====================\nx';
  const blocks = parseAccountBlocks(text);
  assert.strictEqual(blocks.length, 2);
  assert.ok(blocks[0].includes('email'));
  assert.ok(blocks[0].includes('password'));
});

console.log('\nDone.');
