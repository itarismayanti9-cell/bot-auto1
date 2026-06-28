const { Schema, model } = require('mongoose');

const OrderSchema = new Schema({
  invoice: { type: String, unique: true, index: true, required: true },
  userId: { type: Number, required: true, index: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: String,
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: Number,
  total: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'paid', 'delivered', 'cancelled', 'expired', 'failed'], default: 'pending', index: true },
  paymentMethod: String,
  paymentRef: String,
  reservedStockIds: [{ type: Schema.Types.ObjectId, ref: 'Stock' }],
  deliveredContent: [String],
  expiresAt: Date,
  paidAt: Date,
  deliveredAt: Date,
}, { timestamps: true });

module.exports = model('Order', OrderSchema);
