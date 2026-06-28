# 🏪 Telegram Digital Store Bot

Premium Telegram Auto Order Bot untuk menjual produk digital (AWS, Digital Ocean, VPS, RDP, VCC, License Key, Akun Premium, dll).

## Stack
- Node.js 20+ (Telegraf 4)
- MongoDB Atlas (Mongoose)
- Render / Docker / PM2 ready

## Setup Lokal
```bash
cp .env.example .env
# isi BOT_TOKEN, MONGODB_URI, ADMIN_IDS
npm install
npm start
```

## Environment Variables (wajib di .env)
| Key | Wajib | Keterangan |
|---|---|---|
| `BOT_TOKEN` | ✅ | dari @BotFather |
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `ADMIN_IDS` | ✅ | Telegram User ID admin, pisahkan koma. Cth: `123456,789012` |
| `CHANNEL_ID` | ❌ | Dapat diatur via `/admin → Pengaturan Bot` |
| `TRIPAY_*` / `BINANCE_*` | ❌ | Dapat diatur via Admin Panel |

## Deploy ke Render
1. Push repo ke GitHub
2. Render Dashboard → New → Background Worker → Connect repo
3. Build: `npm install` | Start: `node src/index.js`
4. Set Environment Variables (`BOT_TOKEN`, `MONGODB_URI`, `ADMIN_IDS`)

## Akses Admin
Kirim `/admin` di chat bot. Hanya user ID yang ada di `ADMIN_IDS` yang diizinkan.

## Fitur Utama
- ✅ Wajib Join Channel (configurable)
- ✅ Inline Keyboard + Message Edit (Clean Chat)
- ✅ Produk dinamis tanpa hardcode
- ✅ Stock terpisah per produk + FIFO + Reservation
- ✅ Auto Delivery + Invoice unik
- ✅ Payment Gateway (Tripay/QRIS Manual/Bank/E-Wallet)
- ✅ Broadcast, User Management, Audit Log
- ✅ Realtime configuration via admin panel
- ✅ Anti double order/payment, rate limiter, transaction lock
