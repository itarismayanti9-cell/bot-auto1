const Stock = require('../models/Stock');
const { ACCOUNT_DELIM } = require('../utils/ui');

// Split text into account BLOCKS using a delimiter line.
// Accepted separators (a whole line consisting of):
//   - 4+ "=" characters       (e.g. ====================)
//   - 4+ "-" characters       (e.g. --------------------)
//   - "-----END ACCOUNT-----" variants
const BLOCK_SPLIT_RE = /\r?\n\s*(?:={4,}|-{3,}\s*END\s*ACCOUNT\s*-{3,}|-{4,})\s*\r?\n/i;

function parseAccountBlocks(text) {
  if (!text) return [];
  // If user sent a single block without any separator → treat as 1 account
  const blocks = String(text).split(BLOCK_SPLIT_RE).map(b => b.replace(/^\n+|\n+$/g, '').trim());
  return blocks.filter(Boolean);
}

async function countAvailable(productId) {
  return Stock.countDocuments({ productId, status: 'available' });
}

// FIFO reservation per account-block (each Stock doc = 1 account)
async function reserveStock(productId, quantity, userId, orderId) {
  const reserved = [];
  for (let i = 0; i < quantity; i++) {
    const item = await Stock.findOneAndUpdate(
      { productId, status: 'available' },
      { $set: { status: 'reserved', reservedBy: userId, reservedAt: new Date(), orderId } },
      { sort: { createdAt: 1 }, new: true }
    );
    if (!item) {
      if (reserved.length) {
        await Stock.updateMany(
          { _id: { $in: reserved.map(r => r._id) } },
          { $set: { status: 'available', reservedBy: null, reservedAt: null, orderId: null } }
        );
      }
      return null;
    }
    reserved.push(item);
  }
  return reserved;
}

async function releaseStock(orderId) {
  await Stock.updateMany(
    { orderId, status: 'reserved' },
    { $set: { status: 'available', reservedBy: null, reservedAt: null, orderId: null } }
  );
}

// Returns array of account-block strings (FIFO order), and DELETES the stock rows.
async function markSold(orderId) {
  const items = await Stock.find({ orderId, status: 'reserved' }).sort({ createdAt: 1 });
  if (items.length) {
    await Stock.deleteMany({ _id: { $in: items.map(i => i._id) } });
  }
  return items.map(i => i.content);
}

// addStock now parses by BLOCK delimiter, not by line.
// Accepts raw text (multi-line). Each block is preserved as-is.
async function addStock(productId, text) {
  const blocks = parseAccountBlocks(text);
  if (!blocks.length) return 0;
  const docs = blocks.map(content => ({ productId, content }));
  await Stock.insertMany(docs);
  return docs.length;
}

async function clearStock(productId) {
  const res = await Stock.deleteMany({ productId, status: 'available' });
  return res.deletedCount;
}

// Export: join available blocks with the canonical delimiter line
function serializeBlocks(blocks) {
  return blocks.join(`\n${ACCOUNT_DELIM}\n`);
}

module.exports = {
  parseAccountBlocks, serializeBlocks,
  countAvailable, reserveStock, releaseStock, markSold,
  addStock, clearStock,
  ACCOUNT_DELIM,
};
