"use client";

import { useRef, useState, useEffect, useCallback } from "react";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const isPrintingRef = useRef(false);

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string>("");
  const [countdown, setCountdown] = useState(0);
  const [showImage, setShowImage] = useState(false);
  const [capturedImageData, setCapturedImageData] = useState<string>("");
  const [isPrinting, setIsPrinting] = useState(false);
  
  // Payment states
  const [showPayment, setShowPayment] = useState(true);
  const [, setPaymentMethod] = useState<string>("");
  const [qrCodeData, setQrCodeData] = useState<string>("");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentTimeout, setPaymentTimeout] = useState(0);
  
  // Photo gallery states
  const [showGallery, setShowGallery] = useState(false);
  const [savedPhotos, setSavedPhotos] = useState<Array<{id: number, data: string, timestamp: number}>>([]);

  // Auto start camera on mount  
  const startCamera = useCallback(async () => {
    if (isActive) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsActive(true);
      }
    } catch (err: unknown) {
      console.error("Camera error:", err);
      setError("Cannot access camera: " + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }, [isActive]);

  useEffect(() => {
    startCamera();
    // โหลดรูปที่บันทึกไว้จาก local storage
    loadSavedPhotos(setSavedPhotos);
  }, [startCamera]);

  // -------- Camera Control ----------



  // -------- Countdown + Capture ----------
  const startCountdown = () => {
    if (isPrinting || countdown > 0) return; // ป้องกันการกดซ้ำ
    
    setCountdown(5);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          capturePhoto();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !captureCanvasRef.current) return;

    const canvas = captureCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ขนาด output (A4 1080x1527)
    canvas.width = 1080;
    canvas.height = 1527;

    // Function สำหรับวาดรูปและพิมพ์ (ใช้ครั้งเดียว)
    const drawAndPrint = () => {
      console.log('🎯 drawAndPrint called!');
      // วาดกล้องลงบน canvas (ตำแหน่งเดียวกับ preview)
      const videoWidth = 700;
      const videoHeight = 400;
      const videoX = (canvas.width - videoWidth) / 2;
      const videoY = 380; // ตรงกับ pt-[380px] ใน preview

      ctx.save();
      ctx.filter = "grayscale(100%)";
      ctx.scale(-1, 1); // mirror
      ctx.drawImage(
        videoRef.current as HTMLVideoElement,
        -videoX - videoWidth,
        videoY,
        videoWidth,
        videoHeight
      );
      ctx.restore();

      const dataURL = canvas.toDataURL("image/png");
      setCapturedImageData(dataURL);
      setShowImage(true);
      
      // บันทึกรูปลง local storage
      savePhotoToStorage(dataURL, savedPhotos, setSavedPhotos);
      
      // ป้องกันการพิมพ์ซ้ำด้วย useRef
      if (!isPrintingRef.current) {
        console.log('🔒 Setting print lock');
        isPrintingRef.current = true;
        setIsPrinting(true);
        autoPrint(dataURL);
      } else {
        console.log('🚫 Print already in progress, skipping');
      }
      
      // รีเซ็ตหลังจาก 5 วินาที และกลับสู่หน้าชำระเงิน
      setTimeout(() => {
        console.log('🔓 Releasing print lock and returning to payment screen');
        setShowImage(false);
        setCapturedImageData("");
        setCountdown(0);
        setIsPrinting(false);
        isPrintingRef.current = false;
        
        // กลับสู่หน้าชำระเงิน
        setShowPayment(true);
        setPaymentSuccess(false);
        setPaymentMethod("");
        setQrCodeData("");
      }, 5000);
    };

    // วาดพื้นหลัง template
    const bg = document.createElement('img');
    bg.crossOrigin = "anonymous";
    
    bg.onload = () => {
      console.log("Template loaded successfully!");
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
      drawAndPrint();
    };

    bg.onerror = () => {
      console.error("Failed to load template image");
      // วาดพื้นหลังสีขาวแทน
      ctx.fillStyle = '#f8f6f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawAndPrint();
    };

    bg.src = `${window.location.origin}/template-news.png`;
  };

  // -------- Payment Functions ----------
  const handlePayment = async (method: string) => {
    try {
      console.log(`💳 Starting payment with ${method}`);
      setPaymentMethod(method);
      
      const response = await fetch('/api/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentMethod: method }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        console.log('Payment created:', result);
        
        if (result.qrCode) {
          setQrCodeData(result.qrCode);
          // เริ่ม countdown ตามเวลาหมดอายุของ QR (fallback 120 วินาทีหากไม่มี)
          startPaymentTimeout(result.qrExpiry);
          // เริ่มตรวจสอบสถานะการชำระเงิน
          startPaymentPolling(result.chargeId);
        } else if (result.redirectUrl) {
          // สำหรับ WeChat อาจต้อง redirect
          window.open(result.redirectUrl, '_blank');
        }
      } else {
        console.error('Payment creation failed:', {
          error: result.error,
          details: result.details,
          status: result.status,
          statusText: result.statusText
        });
        setError(`Payment failed (${result.status}): ${JSON.stringify(result.details)}`);
      }
    } catch (error) {
      console.error('Network/Parse error:', error);
      setError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const cancelPayment = () => {
    setQrCodeData("");
    setPaymentMethod("");
    setPaymentTimeout(0);
    // หยุดการตรวจสอบสถานะ
    if ((window as { pollInterval?: NodeJS.Timeout }).pollInterval) {
      clearInterval((window as { pollInterval?: NodeJS.Timeout }).pollInterval);
    }
    // หยุด timeout
    if ((window as { timeoutInterval?: NodeJS.Timeout }).timeoutInterval) {
      clearInterval((window as { timeoutInterval?: NodeJS.Timeout }).timeoutInterval);
    }
  };

  // เริ่ม countdown 30 วินาที
  const startPaymentTimeout = (expiryISO?: string) => {
    if (expiryISO) {
      const expiryMs = new Date(expiryISO).getTime();
      const nowMs = Date.now();
      const remainingSec = Math.max(0, Math.floor((expiryMs - nowMs) / 1000));
      setPaymentTimeout(remainingSec || 120);
    } else {
      setPaymentTimeout(120);
    }
    
    const interval = setInterval(() => {
      setPaymentTimeout((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // หมดเวลา - กลับสู่หน้าชำระเงิน
          handlePaymentTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // เก็บ interval reference
    (window as { timeoutInterval?: NodeJS.Timeout }).timeoutInterval = interval;
  };

  const handlePaymentTimeout = () => {
    console.log('⏰ Payment timeout - returning to payment screen');
    setQrCodeData("");
    setPaymentMethod("");
    setPaymentTimeout(0);
    
    // หยุดการตรวจสอบสถานะ
    if ((window as { pollInterval?: NodeJS.Timeout }).pollInterval) {
      clearInterval((window as { pollInterval?: NodeJS.Timeout }).pollInterval);
    }
    if ((window as { timeoutInterval?: NodeJS.Timeout }).timeoutInterval) {
      clearInterval((window as { timeoutInterval?: NodeJS.Timeout }).timeoutInterval);
    }
  };

  // ตรวจสอบสถานะการชำระเงิน
  const startPaymentPolling = (chargeId: string) => {
    console.log('🔍 Starting payment polling for charge:', chargeId);
    
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/payment-status?chargeId=${chargeId}`);
        const result = await response.json();
        
        console.log('Payment status check result:', {
          chargeId,
          status: result.status,
          timestamp: result.timestamp,
          fullResponse: result
        });
        
        if (result.status === 'succeeded') {
          console.log('✅ Payment confirmed via polling!');
          handlePaymentSuccess();
          clearInterval(interval);
        } else if (result.status === 'failed') {
          console.log('❌ Payment failed');
          setError('Payment failed');
          cancelPayment();
          clearInterval(interval);
        } else if (result.status === 'expired') {
          console.log('⏰ Payment expired');
          setError('Payment expired');
          cancelPayment();
          clearInterval(interval);
        } else {
          console.log('⏳ Payment still pending, continuing to poll...');
        }
        // สำหรับ 'pending' จะ continue polling
      } catch (error) {
        console.error('Payment status check failed:', error);
        // ไม่หยุด polling เมื่อเกิด error เพราะอาจเป็น network issue ชั่วคราว
      }
    }, 3000); // เช็คทุก 3 วินาที (ลดความถี่ลง)
    
    // เก็บ interval reference
    (window as { pollInterval?: NodeJS.Timeout }).pollInterval = interval;
    
    // หยุด polling หลังจาก 5 นาที (100 ครั้ง)
    setTimeout(() => {
      if ((window as { pollInterval?: NodeJS.Timeout }).pollInterval === interval) {
        console.log('⏰ Payment polling timeout - stopping');
        clearInterval(interval);
        (window as { pollInterval?: NodeJS.Timeout }).pollInterval = undefined;
      }
    }, 5 * 60 * 1000);
  };

  const handlePaymentSuccess = () => {
    console.log('💰 Payment successful! Starting photo session...');
    setPaymentSuccess(true);
    setQrCodeData("");
    setPaymentTimeout(0);
    setShowPayment(false);
    
    // หยุด timers
    if ((window as { pollInterval?: NodeJS.Timeout }).pollInterval) {
      clearInterval((window as { pollInterval?: NodeJS.Timeout }).pollInterval);
    }
    if ((window as { timeoutInterval?: NodeJS.Timeout }).timeoutInterval) {
      clearInterval((window as { timeoutInterval?: NodeJS.Timeout }).timeoutInterval);
    }
    
    // เริ่มการถ่ายรูป
    setTimeout(() => {
      startCountdown();
    }, 1000);
  };

  // -------- Print ---------- (ไม่ใช้แล้ว เพราะมี autoPrint)

  return (
    <div className="w-[1080px] h-[1920px] mx-auto flex flex-col items-start bg-white relative ">
      {/* Canvas hidden */}
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* Template + Webcam */}
      <div
        ref={containerRef}
        className="relative w-[1080px] h-[1527px] border"
      >
        {/* Template (background) */}
        <div className="absolute inset-0 z-0">
          <img
            src="/template-news.png"
            alt="template"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Webcam overlay (อยู่เหนือ template) */}
        <div className="absolute inset-0 flex items-start justify-center z-10 pt-[380px]">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-[700px] h-[400px] object-cover rounded-lg border-4 border-white shadow-lg "
            style={{ transform: "scaleX(-1)", filter: "grayscale(100%)" }}
          />
        </div>

        {/* Countdown overlay */}
        {countdown > 0 && (
          <div className="absolute top-10 left-1/2 transform -translate-x-1/2 z-30">
            <div className="bg-red-600 rounded-full w-32 h-32 flex items-center justify-center shadow-2xl">
              <span className="text-white text-5xl font-bold">{countdown}</span>
            </div>
          </div>
        )}
      </div>

      {/* Payment or Photo Controls */}
      {showPayment && !paymentSuccess ? (
        // Payment Screen
        <div 
          className="w-full flex flex-col items-center space-y-8 py-12 px-8 flex-grow"
          style={{
            backgroundImage: "url('/old-grey-grainy-paper-background-texture_271293-3.avif')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            minHeight: 'calc(100vh - 1527px)' // เต็มส่วนที่เหลือข้างล่าง โดยไม่มี margin
          }}
        >
          <h2 className="text-5xl font-bold text-black mb-4">Payment 1 THB</h2>
          <p className="text-2xl text-gray-700 mb-8">Choose Payment Method</p>
          
          <div className="w-full flex justify-center space-x-8">
            <button
              onClick={() => handlePayment('promptpay')}
              className="px-16 py-8 bg-white text-black border-4 border-black rounded-xl font-bold text-3xl hover:bg-gray-100 flex items-center justify-center min-w-[280px] shadow-lg"
            >
              💳 PromptPay
            </button>
            <button
              onClick={() => handlePayment('wechat')}
              className="px-16 py-8 bg-white text-black border-4 border-black rounded-xl font-bold text-3xl hover:bg-gray-100 flex items-center justify-center min-w-[280px] shadow-lg"
            >
              <img 
                src="/wechat-logo-wechat-logo-transparent-wechat-icon-transparent-free-free-png.webp" 
                alt="WeChat" 
                className="w-8 h-8 mr-3"
              />
              WeChat Pay
            </button>
          </div>
          
          {/* Gallery Button - disabled */}
        </div>
      ) : !showPayment ? (
        // Photo Control
        <div className="mt-6 flex justify-center">
          <button
            onClick={startCountdown}
            disabled={!isActive || countdown > 0 || isPrinting}
            className="px-12 py-6 bg-blue-600 text-white rounded-lg font-bold text-2xl disabled:bg-gray-400"
          >
            {countdown > 0 ? `📸 ${countdown}` : "📸 ถ่ายรูป"}
          </button>
        </div>
      ) : null}

      {/* QR Code Display */}
      {qrCodeData && (
        <div className="absolute top-0 left-0 w-full h-[1527px] z-50 bg-white flex flex-col items-center justify-center">
          <h2 className="text-2xl font-bold mb-4">Scan QR Code to Pay</h2>
          <img 
            src={`data:image/png;base64,${qrCodeData}`}
            alt="QR Code Payment" 
            className="w-64 h-64 border-2 border-gray-300 mb-4"
          />
          <p className="text-lg text-gray-600 mb-2">Amount: 1 THB</p>
          
          {/* Countdown Timer */}
          <div className="mb-4 text-center">
            <div className={`text-2xl font-bold ${paymentTimeout <= 10 ? 'text-red-500' : 'text-blue-600'}`}>
              {Math.floor(paymentTimeout / 60)}:{(paymentTimeout % 60).toString().padStart(2, '0')}
            </div>
            <p className="text-sm text-gray-500">Time remaining</p>
          </div>
          
          <p className="text-sm text-gray-500 mb-6">Waiting for payment...</p>
          <div className="flex space-x-4">
            <button
              onClick={cancelPayment}
              className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                console.log('🧪 Manual payment success triggered');
                handlePaymentSuccess();
              }}
              className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
            >
              Test Success
            </button>
            <button
              onClick={async () => {
                try {
                  // ทดสอบสร้าง payment status ใหม่
                  const response = await fetch('/api/payment-status?action=test-success', {
                    method: 'PUT'
                  });
                  const result = await response.json();
                  
                  if (response.ok) {
                    console.log('✅ Test payment status created:', result);
                    // เริ่ม polling ด้วย chargeId ใหม่
                    startPaymentPolling(result.chargeId);
                    // แสดง QR code ใหม่
                    setQrCodeData('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
                  } else {
                    console.error('❌ Failed to create test payment status:', result);
                  }
                } catch (error) {
                  console.error('❌ Error creating test payment status:', error);
                }
              }}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Create Test Payment
            </button>
          </div>
        </div>
      )}

      {/* แสดงรูปที่ถ่ายเต็มจอ */}
      {showImage && capturedImageData && (
        <div className="absolute top-0 left-0 w-[1080px] h-[1527px] z-40">
          <img 
            src={capturedImageData} 
            alt="Captured Photo" 
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-6 py-3 rounded-full">
            <p className="text-center text-lg font-bold">📸 ถ่ายรูปสำเร็จ! กำลังพิมพ์...</p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-red-600 mt-4 text-center max-w-md">{error}</p>
      )}

      {/* Gallery Modal - disabled */}
    </div>
  );
}

// Backend Auto Print Function
const autoPrint = async (dataURL: string) => {
  const printId = Date.now();
  try {
    console.log(`🖨️ autoPrint called! ID: ${printId} - Using browser printing directly...`);
    
    // ใน production ใช้ browser printing เลย ไม่ต้องเรียก backend
    if (process.env.NODE_ENV === 'production' || window.location.hostname.includes('vercel.app')) {
      console.log('☁️ Production environment detected, using browser printing directly');
      await browserPrint(dataURL);
      return;
    }
    
    // ใน development ลองเรียก backend ก่อน
    console.log('💻 Development environment, trying backend print API...');
    const response = await fetch('/api/print', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageData: dataURL,
        printId: printId
      })
    });

    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('✅ Print API success:', result);
      console.log(`🖨️ Print job sent: ${result.message}`);
    } else {
      console.error('❌ Print API failed:', result);
      console.log('🔄 Falling back to browser printing...');
      await browserPrint(dataURL);
    }
    
  } catch (error) {
    console.error('❌ Print API error:', error);
    console.log('🔄 Attempting browser fallback...');
    await browserPrint(dataURL);
  }
};

  // Fallback browser printing function
  const browserPrint = (dataURL: string) => {
    return new Promise((resolve, reject) => {
      console.log('🌐 browserPrint called! - Silent printing mode');
      
      try {
        // ใช้วิธีสร้าง iframe ที่ซ่อนไว้สำหรับพิมพ์
        console.log('🖨️ Creating hidden print iframe...');
        
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.top = '0';
        printFrame.style.left = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = 'none';
        printFrame.style.overflow = 'hidden';
        
        document.body.appendChild(printFrame);
        
        printFrame.onload = () => {
          try {
            console.log('✅ Print iframe loaded, preparing content...');
            
            // สร้าง HTML content ที่เหมาะสมสำหรับการพิมพ์ A4
            const printContent = `
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Photobooth Print</title>
                  <style>
                    @page {
                      size: A4 portrait;
                      margin: 0;
                    }
                    
                    body {
                      margin: 0;
                      padding: 0;
                      width: 210mm;
                      height: 297mm;
                      background: white;
                      font-family: Arial, sans-serif;
                    }
                    
                    .print-container {
                      width: 100%;
                      height: 100%;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      position: relative;
                    }
                    
                    .photo {
                      max-width: 180mm;
                      max-height: 250mm;
                      object-fit: contain;
                      display: block;
                    }
                    
                    .photo-container {
                      width: 180mm;
                      height: 250mm;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      background: white;
                      border: 1px solid #ddd;
                    }
                    
                    @media print {
                      body { margin: 0; }
                      .photo-container { border: none; }
                    }
                  </style>
                </head>
                <body>
                  <div class="print-container">
                    <div class="photo-container">
                      <img src="${dataURL}" class="photo" alt="Photobooth Photo" />
                    </div>
                  </div>
                  <script>
                    console.log('Print content ready, starting print...');
                    
                    // รอให้รูปโหลดเสร็จแล้วพิมพ์
                    const img = document.querySelector('.photo');
                    img.onload = () => {
                      console.log('Image loaded, printing now...');
                      setTimeout(() => {
                        window.print();
                      }, 500);
                    };
                    
                    // ปิด iframe หลังพิมพ์เสร็จ
                    window.addEventListener('afterprint', () => {
                      console.log('Print completed');
                      setTimeout(() => {
                        window.close();
                      }, 1000);
                    });
                    
                    // Fallback: ปิดหลัง 5 วินาที
                    setTimeout(() => {
                      if (!window.closed) {
                        console.log('Fallback: closing iframe');
                        window.close();
                      }
                    }, 5000);
                  </script>
                </body>
              </html>
            `;
            
            printFrame.contentWindow?.document.write(printContent);
            printFrame.contentWindow?.document.close();
            
            console.log('✅ Print content written, waiting for image load...');
            
            // Resolve promise หลังจาก content พร้อม
            setTimeout(() => {
              console.log('✅ Print iframe ready');
              resolve(true);
            }, 1000);
            
          } catch (iframeError) {
            console.error('❌ Iframe content error:', iframeError);
            document.body.removeChild(printFrame);
            reject(iframeError);
          }
        };
        
        // เริ่มโหลด iframe
        printFrame.src = 'about:blank';
        
      } catch (error) {
        console.error('❌ Browser print error:', error);
        reject(error);
      }
    });
  };

// โหลดรูปที่บันทึกไว้จาก local storage
const loadSavedPhotos = (setSavedPhotos: React.Dispatch<React.SetStateAction<Array<{id: number, data: string, timestamp: number}>>>) => {
  try {
    const saved = localStorage.getItem('photobooth_photos');
    if (saved) {
      const photos = JSON.parse(saved);
      setSavedPhotos(photos);
      console.log('📸 Loaded saved photos:', photos.length);
    }
  } catch (error) {
    console.error('❌ Error loading saved photos:', error);
  }
};

// บันทึกรูปลง local storage
const savePhotoToStorage = (
  imageData: string, 
  savedPhotos: Array<{id: number, data: string, timestamp: number}>,
  setSavedPhotos: React.Dispatch<React.SetStateAction<Array<{id: number, data: string, timestamp: number}>>>
) => {
  try {
    const timestamp = Date.now();
    const photoData = {
      id: timestamp,
      data: imageData,
      timestamp: timestamp
    };
    
    // เพิ่มรูปใหม่เข้าไปใน array
    const updatedPhotos = [photoData, ...savedPhotos.slice(0, 9)]; // เก็บแค่ 10 รูปล่าสุด
    setSavedPhotos(updatedPhotos);
    
    // บันทึกลง local storage
    localStorage.setItem('photobooth_photos', JSON.stringify(updatedPhotos));
    
    console.log('💾 Photo saved to local storage, total photos:', updatedPhotos.length);
  } catch (error) {
    console.error('❌ Error saving photo:', error);
  }
};

