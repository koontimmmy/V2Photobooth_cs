# 🚀 Local Development Guide

วิธีการรัน Photobooth บนเครื่อง local พร้อมระบบ payment จริงผ่าน ngrok

## 📋 Prerequisites

- Node.js (v18+)
- npm หรือ yarn
- ngrok (จะติดตั้งให้อัตโนมัติ)
- Beam API Key และ Merchant ID

## 🛠️ Quick Start

### วิธีที่ 1: ใช้ Script อัตโนมัติ (แนะนำ)

```bash
# รัน script เดียวจบ
./scripts/local-dev.sh
```

Script จะทำให้:
1. ✅ เริ่ม Next.js dev server (port 3000)
2. ✅ เริ่ม ngrok tunnel 
3. ✅ แสดง ngrok URL สำหรับใส่ใน Beam dashboard
4. ✅ อัพเดท .env.local อัตโนมัติ

### วิธีที่ 2: Manual Setup

#### 1. ติดตั้ง Dependencies
```bash
npm install
```

#### 2. ตั้งค่า Environment Variables
สร้างไฟล์ `.env.local`:
```env
BEAM_API_KEY=your-beam-api-key
BEAM_MERCHANT_ID=your-merchant-id
BEAM_WEBHOOK_SECRET=your-webhook-secret
PUBLIC_BASE_URL=http://localhost:3000
BEAM_BASE_URL=https://api.beamcheckout.com
NODE_ENV=development
```

#### 3. เริ่ม Development Server
```bash
# Terminal 1: เริ่ม Next.js
npm run dev

# Terminal 2: เริ่ม ngrok
ngrok http 3000
```

## 🔗 Webhook Setup

1. **เข้า Beam Dashboard**: https://portal.beamcheckout.com/
2. **ไปที่ Webhook Settings**
3. **ใส่ URL ต่อไปนี้**:
   - Main Webhook: `https://your-ngrok-id.ngrok-free.app/api/webhook`
   - Backup Webhook: `https://your-ngrok-id.ngrok-free.app/api/webhook/backup`

## 🧪 Testing Webhooks

### Test Webhook Endpoint
```bash
curl -X POST http://localhost:3000/api/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Monitor Webhook Traffic
- เปิด ngrok dashboard: http://localhost:4040
- ดู request/response real-time

## 📂 Project Structure

```
├── src/app/api/
│   ├── payment/route.ts          # Payment creation API
│   ├── payment-status/route.ts   # Payment status management
│   └── webhook/
│       ├── route.ts              # Main webhook
│       ├── backup/route.ts       # Backup webhook
│       └── test/route.ts         # Test webhook
├── scripts/
│   └── local-dev.sh             # Development script
├── .env.local                   # Local environment variables
└── LOCAL_DEVELOPMENT.md         # This file
```

## 🔧 Troubleshooting

### ngrok Issues
```bash
# ถ้า ngrok ไม่ทำงาน ลองติดตั้งใหม่
brew uninstall ngrok
brew install ngrok/ngrok/ngrok

# หรือใช้ npm
npm install -g ngrok
```

### Port Already in Use
```bash
# ดู process ที่ใช้ port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Webhook Verification Failed
1. ✅ ตรวจสอบ `BEAM_WEBHOOK_SECRET` ใน .env.local
2. ✅ ตรวจสอบ webhook URL ใน Beam dashboard
3. ✅ ดู logs ใน terminal และ ngrok dashboard

## 🎯 Payment Flow Testing

1. **เปิดเว็บ**: http://localhost:3000
2. **เลือก Payment Method**: PromptPay หรือ WeChat Pay
3. **สแกน QR Code** ด้วย app จริง
4. **จ่ายเงิน** (จำนวนจริงตาม test amount)
5. **รอ Webhook** จาก Beam
6. **ถ่ายรูป** เมื่อการชำระสำเร็จ

## 🚀 Deploy to Production

เมื่อ test เสร็จแล้ว สามารถ deploy ขึ้น Vercel:

```bash
# Deploy to Vercel
vercel --prod

# หรือ push ขึ้น GitHub (auto-deploy)
git add .
git commit -m "Ready for production"
git push origin main
```

## ⚠️ Important Notes

- **ngrok URL จะเปลี่ยน** ทุกครั้งที่รีสตาร์ท (ยกเว้น paid plan)
- **อย่าลืมอัพเดท webhook URL** ใน Beam dashboard
- **Payment จะเป็นเงินจริง** - ระวังใส่จำนวนสำหรับ test
- **Keep scripts running** - อย่าปิด terminal ที่รัน ngrok

## 📞 Need Help?

- Beam API Docs: https://beamcheckout.com/docs
- ngrok Docs: https://ngrok.com/docs
- Next.js Docs: https://nextjs.org/docs