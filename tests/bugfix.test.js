// Unit tests for bug fixes (iteration 2):
//   1) session.js must NOT call next() twice when downstream throws
//   2) migrate.dropStaleIndexes must drop only listed stale indexes
const assert = require('assert');
const path = require('path');

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => console.log('✅', name))
    .catch((e) => { console.error('❌', name, '\n  ', e.message); process.exitCode = 1; });
}

// ===== Test 1: session middleware doesn't double-call next() =====
async function testSessionNoDoubleNext() {
  // Mock mongoose User model used inside session middleware
  const sessionPath = path.resolve(__dirname, '../src/middleware/session.js');
  // require fresh
  delete require.cache[sessionPath];
  delete require.cache[require.resolve('../src/models/User')];

  // Stub the User model module before requiring session
  require.cache[require.resolve('../src/models/User')] = {
    exports: {
      findOne: async () => ({
        telegramId: 1, username: 'x', firstName: 'A', lastName: 'B',
        lastSeen: null, save: async () => {}, isModified: () => false,
      }),
      create: async () => ({ telegramId: 1, save: async () => {}, isModified: () => false }),
    },
  };
  // logger silent
  require.cache[require.resolve('../src/utils/logger')] = {
    exports: { info(){}, warn(){}, error(){}, debug(){} },
  };

  const session = require(sessionPath);

  let nextCalls = 0;
  const ctx = { from: { id: 1, username: 'x', first_name: 'A', last_name: 'B' }, state: {} };
  const next = async () => {
    nextCalls++;
    throw new Error('downstream boom (e.g. dup key)');
  };

  await session(ctx, next);
  assert.strictEqual(nextCalls, 1, `next() should be called exactly once, got ${nextCalls}`);
}

// ===== Test 2: dropStaleIndexes drops only stale indexes =====
async function testDropStaleIndexes() {
  const { dropStaleIndexes } = require('../src/migrate');

  const dropped = [];
  const fakeColl = {
    indexes: async () => ([
      { name: '_id_' },
      { name: 'invoiceNo_1' },       // stale → should drop
      { name: 'invoice_1' },         // current → keep
    ]),
    dropIndex: async (name) => { dropped.push(name); },
  };
  const fakeMongoose = {
    connection: {
      db: {
        collection: (name) => {
          assert.strictEqual(name, 'orders');
          return fakeColl;
        },
      },
    },
  };

  await dropStaleIndexes(fakeMongoose);
  assert.deepStrictEqual(dropped, ['invoiceNo_1'], `expected ['invoiceNo_1'], got ${JSON.stringify(dropped)}`);
}

// ===== Test 3: dropStaleIndexes is no-op if stale index absent =====
async function testDropStaleNoop() {
  const { dropStaleIndexes } = require('../src/migrate');
  const dropped = [];
  const fakeMongoose = {
    connection: {
      db: {
        collection: () => ({
          indexes: async () => ([{ name: '_id_' }, { name: 'invoice_1' }]),
          dropIndex: async (n) => { dropped.push(n); },
        }),
      },
    },
  };
  await dropStaleIndexes(fakeMongoose);
  assert.strictEqual(dropped.length, 0);
}

// ===== Test 4: session middleware completes normally (no throw downstream) =====
async function testSessionHappyPath() {
  const sessionPath = path.resolve(__dirname, '../src/middleware/session.js');
  delete require.cache[sessionPath];
  delete require.cache[require.resolve('../src/models/User')];
  require.cache[require.resolve('../src/models/User')] = {
    exports: {
      findOne: async () => ({
        telegramId: 2, username: 'y', firstName: 'X', lastName: 'Y',
        lastSeen: null, save: async () => {}, isModified: () => false,
      }),
      create: async () => ({}),
    },
  };
  require.cache[require.resolve('../src/utils/logger')] = {
    exports: { info(){}, warn(){}, error(){}, debug(){} },
  };
  const session = require(sessionPath);

  let calls = 0;
  await session({ from: { id: 2 }, state: {} }, async () => { calls++; });
  assert.strictEqual(calls, 1);
}

(async () => {
  await test('session: next() called exactly once when downstream throws', testSessionNoDoubleNext);
  await test('session: happy path calls next once', testSessionHappyPath);
  await test('migrate: drops stale invoiceNo_1 index', testDropStaleIndexes);
  await test('migrate: noop when no stale index present', testDropStaleNoop);
  console.log('\nDone.');
})();
