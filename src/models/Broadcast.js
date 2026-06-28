const { Schema, model } = require('mongoose');

const BroadcastSchema = new Schema({
  adminId: Number,
  target: { type: String, enum: ['all', 'active', 'product'], default: 'all' },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
  text: String,
  sent: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'running', 'done', 'cancelled'], default: 'pending' },
}, { timestamps: true });

module.exports = model('Broadcast', BroadcastSchema);
