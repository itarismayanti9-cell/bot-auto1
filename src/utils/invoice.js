const { customAlphabet } = require('nanoid');
const nano = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', 5);

function generateInvoice() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `INV-${ymd}-${nano()}`;
}

module.exports = { generateInvoice };
