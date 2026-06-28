const { Schema, model } = require('mongoose');

const ProductSchema = new Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
  bannerFileId: String,
  bannerCaption: String,
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  sold: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = model('Product', ProductSchema);
