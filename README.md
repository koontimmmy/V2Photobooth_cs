# 📸 Photobooth Application

แอปพลิเคชัน Photobooth แบบ Touch Screen ที่รองรับการชำระเงินและพิมพ์รูปอัตโนมัติ พร้อมระบบ Camera และ Template สำหรับการถ่ายรูป

## 🌟 Features หลัก

### 📷 Camera System
- **Real-time Camera Preview** - แสดงภาพกล้องสดใส
- **Mirror Effect** - ภาพกล้องแบบกระจก (เหมาะสำหรับ selfie)
- **Grayscale Filter** - ฟิลเตอร์ขาวดำ
- **Countdown Timer** - นับถอยหลัง 5 วินาทีก่อนถ่ายรูป
- **Auto Capture** - ถ่ายรูปอัตโนมัติหลัง countdown

### 💳 Payment System
- **PromptPay Integration** - รองรับ PromptPay QR Code
- **WeChat Pay Support** - รองรับ WeChat Pay
- **BeamCheckout API** - ระบบชำระเงินผ่าน BeamCheckout
- **Real-time Payment Status** - ตรวจสอบสถานะการชำระเงินแบบเรียลไทม์
- **Payment Timeout** - หมดเวลาชำระเงิน 30 วินาที
- **Webhook Integration** - รับสถานะการชำระเงินผ่าน webhook

### 🖨️ Printing System
- **Auto Print** - พิมพ์รูปอัตโนมัติหลังถ่ายรูป
- **Multiple Print Methods**:
  - Backend Printing (lp command)
  - Browser Fallback Printing
- **A4 Output Format** - รูปภาพขนาด A4 (1080x1527)
- **Template Integration** - รวมรูปถ่ายเข้ากับเทมเพลตข่าว
- **EPSON L3250 Support** - รองรับเครื่องพิมพ์ EPSON L3250 Series

### 🎨 UI/UX
- **Touch-friendly Interface** - ปุ่มขนาดใหญ่เหมาะสำหรับสัมผัส
- **Responsive Design** - รองรับจอแนวตั้ง 1080x1920 pixels
- **Real-time Preview** - แสดงตัวอย่างผลลัพธ์
- **Status Indicators** - แสดงสถานะการทำงาน
- **Error Handling** - จัดการข้อผิดพลาดอย่างเหมาะสม

## 🚀 เทคโนโลยีที่ใช้

### Frontend
- **Next.js 15.5.0** - React framework with App Router
- **React 19.1.0** - UI library with latest features
- **TypeScript 5** - Type safety และ better development experience
- **Tailwind CSS 4** - Utility-first CSS framework

### Backend APIs
- **Next.js API Routes** - Server-side endpoints
- **BeamCheckout API** - Payment processing
- **File System APIs** - Image handling และ temp files
- **Child Process** - Print command execution

### Hardware Integration
- **Media Devices API** - เข้าถึงกล้อง
- **Canvas API** - การประมวลผลภาพ
- **Print APIs** - ระบบพิมพ์

## 📁 โครงสร้างไฟล์

```
ค่อยทำcursor/
├── src/
│   └── app/
│       ├── api/                    # API Routes
│       │   ├── payment/           # ระบบชำระเงิน
│       │   │   └── route.ts
│       │   ├── payment-status/    # ตรวจสอบสถานะการชำระ
│       │   │   └── route.ts  
│       │   ├── print/             # ระบบพิมพ์
│       │   │   └── route.ts
│       │   └── webhook/           # Webhook สำหรับ payment
│       │       └── route.ts
│       ├── globals.css            # Global styles
│       ├── layout.tsx             # Root layout
│       └── page.tsx               # Main application
├── public/                        # Static assets
│   ├── template-news.png          # เทมเพลตสำหรับรูปถ่าย
│   ├── icon-thaiqr.png           # ไอคอน QR Code
│   └── wechat-logo...webp        # โลโก้ WeChat
├── temp/                          # Temporary files สำหรับการพิมพ์
├── .env.local                     # Environment variables
├── package.json
└── README.md
```

## ⚙️ การติดตั้งและใช้งาน

### 1. การติดตั้ง Dependencies

```bash
# ติดตั้ง packages
npm install

# หรือ
yarn install
```

### 2. การตั้งค่า Environment Variables

สร้างไฟล์ `.env.local` และเพิ่มข้อมูลต่อไปนี้:

```env
# BeamCheckout API Configuration
BEAM_API_KEY=your_beam_api_key_here
BEAM_MERCHANT_ID=your_merchant_id_here
```

### 3. การติดตั้งเครื่องพิมพ์

สำหรับ macOS:
```bash
# ตรวจสอบเครื่องพิมพ์ที่มี
lpstat -p

# ตั้งค่าเครื่องพิมพ์เป็น default
lpoptions -d EPSON_L3250_Series_2
```

### 4. การรัน Development Server

```bash
npm run dev
```

เปิดเว็บเบราว์เซอร์และไปที่ [http://localhost:3000](http://localhost:3000)

### 5. การสร้าง Production Build

```bash
npm run build
npm start
```

## 🔧 การใช้งาน

### 1. เริ่มต้นใช้งาน
1. เข้าแอปพลิเคชัน - กล้องจะเปิดอัตโนมัติ
2. เลือกวิธีการชำระเงิน (PromptPay หรือ WeChat Pay)
3. สแกน QR Code และชำระเงิน 1 บาท

### 2. การถ่ายรูป
1. หลังชำระเงินสำเร็จ - ระบบจะเริ่ม countdown อัตโนมัติ
2. นับถอยหลัง 5 วินาที
3. ถ่ายรูปและแสดงผลลัพธ์
4. พิมพ์รูปอัตโนมัติ

### 3. การทดสอบ (Development Mode)
- ใช้ปุ่ม **"Test Success"** เพื่อข้ามการชำระเงินจริง
- ทดสอบการถ่ายรูปและพิมพ์โดยตรง

## 🛠️ การแก้ไขปัญหา

### ปัญหากล้อง
```javascript
// ตรวจสอบ permissions
navigator.mediaDevices.getUserMedia({ video: true })
```

### ปัญหาการพิมพ์
```bash
# ตรวจสอบสถานะเครื่องพิมพ์
lpstat -p
lpq

# ทดสอบการพิมพ์
lp -d EPSON_L3250_Series_2 /path/to/test-image.png
```

### ปัญหาการชำระเงิน
- ตรวจสอบ API Keys ใน `.env.local`
- ดู Console logs สำหรับ payment status
- ใช้ "Test Success" button สำหรับการทดสอบ

## 📊 API Endpoints

### Payment APIs
- `POST /api/payment` - สร้าง payment charge
- `GET /api/payment-status?chargeId=xxx` - ตรวจสอบสถานะ
- `POST /api/webhook` - รับ webhook จาก BeamCheckout

### Utility APIs  
- `POST /api/print` - พิมพ์รูป

## 🎯 การ Customize

### การเปลี่ยนเทมเพลต
1. แทนที่ไฟล์ `public/template-news.png`
2. ปรับตำแหน่งกล้องใน `page.tsx` (line 92-94)

### การปรับแต่ง UI
- แก้ไข styles ใน `src/app/page.tsx`
- ใช้ Tailwind CSS classes
- ปรับขนาดหน้าจอใน container (1080x1920)

### การเพิ่ม Payment Methods
1. เพิ่ม button ใหม่ใน payment screen
2. อัพเดท `handlePayment` function
3. เพิ่ม payment method ใน API route

## 📱 Hardware Requirements

### Minimum Requirements
- **Camera**: กล้อง USB/Webcam รองรับ 1280x720
- **Screen**: จอ Touch Screen 1080x1920 (แนวตั้ง)
- **Printer**: เครื่องพิมพ์ที่รองรับ lp command (CUPS)
- **OS**: macOS, Windows, หรือ Linux

### Recommended Setup
- **กล้อง**: ความละเอียดสูง พร้อม auto-focus
- **เครื่องพิมพ์**: EPSON L3250 Series หรือเทียบเท่า
- **อินเทอร์เน็ต**: สำหรับ payment processing

## 🔒 Security Notes

- API Keys ต้องเก็บไว้ใน environment variables
- ไม่ commit `.env.local` เข้า git
- ใช้ HTTPS ใน production
- Validate input ทุกครั้งใน API routes

## 📞 Support & Issues

หากพบปัญหาการใช้งาน สามารถตรวจสอบได้จาก:
1. **Console Logs** - ดู browser developer tools
2. **Server Logs** - ดู terminal ที่รัน npm run dev
3. **Print Queue** - ใช้คำสั่ง `lpq` เพื่อตรวจสอบ

## 🚀 Production Deployment

### Environment Setup
1. ตั้งค่า environment variables ใน production
2. ติดตั้งเครื่องพิมพ์และ CUPS
3. เปิด port สำหรับ webhook (ถ้าจำเป็น)

### Performance Optimization
- ใช้ Next.js Image Optimization
- Enable gzip compression
- จำกัดขนาดไฟล์ temp images

---

**Version**: 1.0.0  
**Last Updated**: August 2025  
**Author**: Photobooth Team# V2Photobooth_cs
