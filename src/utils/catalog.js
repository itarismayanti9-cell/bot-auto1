// Pure helper: build product catalog caption + numbered keyboard layout.
// items: [{ _id, name, price, stock }]
const { rupiah } = require('./ui');

function buildCatalog(items, page = 0, perPage = 10) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  page = Math.min(Math.max(0, page), pages - 1);
  const start = page * perPage;
  const slice = items.slice(start, start + perPage);

  let caption;
  if (!total) {
    caption = `📦 <b>DAFTAR PRODUK</b>\n\n<i>Belum ada produk tersedia.</i>`;
  } else {
    const lines = slice.map((p, i) =>
      `<b>${start + i + 1}.</b> ${p.name}\n   💰 ${rupiah(p.price)}  ·  📦 Stock ${p.stock}`
    );
    caption = `📦 <b>DAFTAR PRODUK</b>\n\n${lines.join('\n\n')}\n\n<i>Pilih dengan menekan nomor di bawah.</i>`;
  }

  // Number buttons, 5 per row
  const rows = [];
  for (let i = 0; i < slice.length; i += 5) {
    rows.push(slice.slice(i, i + 5).map((p, j) => ({
      text: String(start + i + j + 1),
      data: `p:${p._id}`,
    })));
  }

  if (pages > 1) {
    rows.push([
      page > 0
        ? { text: '⬅️', data: `ps:${page - 1}` }
        : { text: '·',  data: 'noop' },
      { text: `${page + 1}/${pages}`, data: 'noop' },
      page < pages - 1
        ? { text: '➡️', data: `ps:${page + 1}` }
        : { text: '·',  data: 'noop' },
    ]);
  }

  return { caption, rows, page, pages, total };
}

module.exports = { buildCatalog };
