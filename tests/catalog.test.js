// Tests for catalog builder
const assert = require('assert');
const { buildCatalog } = require('../src/utils/catalog');

function test(name, fn) {
  try { fn(); console.log('✅', name); }
  catch (e) { console.error('❌', name, '\n  ', e.message); process.exitCode = 1; }
}

const mk = (n) => Array.from({ length: n }, (_, i) => ({
  _id: `id${i+1}`, name: `Produk ${i+1}`, price: 1000*(i+1), stock: 10+i,
}));

test('empty list shows placeholder, no number rows', () => {
  const { caption, rows, pages } = buildCatalog([], 0, 10);
  assert.ok(caption.includes('Belum ada produk'));
  assert.strictEqual(rows.length, 0);
  assert.strictEqual(pages, 1);
});

test('3 products → 1 row of 3 number buttons, no pagination', () => {
  const { rows, pages } = buildCatalog(mk(3));
  assert.strictEqual(pages, 1);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(rows[0].map(b => b.text), ['1','2','3']);
  assert.strictEqual(rows[0][0].data, 'p:id1');
});

test('6 products → 2 rows: [1..5] + [6]', () => {
  const { rows } = buildCatalog(mk(6));
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[0].map(b => b.text), ['1','2','3','4','5']);
  assert.deepStrictEqual(rows[1].map(b => b.text), ['6']);
});

test('10 products → 2 rows of 5, no pagination', () => {
  const { rows, pages } = buildCatalog(mk(10));
  assert.strictEqual(pages, 1);
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[0].map(b => b.text), ['1','2','3','4','5']);
  assert.deepStrictEqual(rows[1].map(b => b.text), ['6','7','8','9','10']);
});

test('11 products → page 1 has 1..10 + pagination row, page 2 has [11]', () => {
  const cat1 = buildCatalog(mk(11), 0);
  assert.strictEqual(cat1.pages, 2);
  // last row is pagination
  const pag = cat1.rows[cat1.rows.length - 1];
  assert.strictEqual(pag[0].data, 'noop');           // no prev on page 0
  assert.strictEqual(pag[1].text, '1/2');
  assert.strictEqual(pag[2].data, 'ps:1');           // next
  // number rows
  const numbers = cat1.rows.slice(0, -1).flat().map(b => b.text);
  assert.deepStrictEqual(numbers, ['1','2','3','4','5','6','7','8','9','10']);

  const cat2 = buildCatalog(mk(11), 1);
  const pag2 = cat2.rows[cat2.rows.length - 1];
  assert.strictEqual(pag2[0].data, 'ps:0');          // prev available
  assert.strictEqual(pag2[1].text, '2/2');
  assert.strictEqual(pag2[2].data, 'noop');          // no next on last page
  const numbers2 = cat2.rows.slice(0, -1).flat().map(b => b.text);
  assert.deepStrictEqual(numbers2, ['11']);
  assert.strictEqual(cat2.rows.slice(0,-1).flat()[0].data, `p:id11`);
});

test('numbering is sequential and 1-based across pages', () => {
  const cat = buildCatalog(mk(23), 1, 10);
  const nums = cat.rows.slice(0,-1).flat().map(b => Number(b.text));
  assert.deepStrictEqual(nums, [11,12,13,14,15,16,17,18,19,20]);
});

test('page out-of-range is clamped to last page', () => {
  const cat = buildCatalog(mk(5), 99, 10);
  assert.strictEqual(cat.page, 0);  // pages=1, clamped to 0
});

test('caption lists products with name/price/stock and number prefix', () => {
  const cat = buildCatalog(mk(3));
  assert.ok(cat.caption.includes('<b>1.</b> Produk 1'));
  assert.ok(cat.caption.includes('Rp1.000'));
  assert.ok(cat.caption.includes('Stock 10'));
  assert.ok(cat.caption.includes('<b>3.</b> Produk 3'));
});

test('callback data uses productId not number (number→id mapping correct)', () => {
  const cat = buildCatalog(mk(7), 0);
  // button "5" → product id5
  const btn5 = cat.rows.flat().find(b => b.text === '5');
  assert.strictEqual(btn5.data, 'p:id5');
});

test('dynamic add: 11 products after building catalog with 10 → page 2 appears', () => {
  const before = buildCatalog(mk(10));
  assert.strictEqual(before.pages, 1);
  const after = buildCatalog(mk(11));
  assert.strictEqual(after.pages, 2);
});

test('dynamic delete: removing item 4 → numbers stay 1..N contiguous (no gap)', () => {
  const items = mk(5);
  items.splice(3, 1); // remove index 3 (was nr 4)
  const cat = buildCatalog(items);
  const nums = cat.rows.flat().filter(b => b.data.startsWith('p:')).map(b => b.text);
  assert.deepStrictEqual(nums, ['1','2','3','4']);
  // verify item that used to be #5 is now #4
  const btn4 = cat.rows.flat().find(b => b.text === '4');
  assert.strictEqual(btn4.data, 'p:id5');
});

console.log('\nDone.');
