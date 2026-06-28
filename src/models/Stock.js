const { Schema, model } = require('mongoose');

// FIFO stock items per product
const StockSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  content: { type: String, required: true },
  status: { type: String, enum: ['available', 'reserved', 'sold'], default: 'available', index: true },
  reservedBy: { type: Number, default: null },
  reservedAt: Date,
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  soldAt: Date,
}, { timestamps: true });

StockSchema.index({ productId: 1, status: 1, createdAt: 1 });

module.exports = model('Stock', StockSchema);
