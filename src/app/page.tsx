"use client";

import Image from "next/image";
import { useRef, useState, useEffect } from "react";

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
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [qrCodeData, setQrCodeData] = useState<string>("");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentTimeout, setPaymentTimeout] = useState(0);

  // Auto start camera on mount
  useEffect(() => {
    startCamera();
  }, []);

  // -------- Camera Control ----------
  const startCamera = async () => {
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
    } catch (err: any) {
      console.error("Camera error:", err);
      setError("Cannot access camera: " + err.message);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setIsActive(false);
    }
  };

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
          // เริ่ม countdown 30 วินาที
          startPaymentTimeout();
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
    if ((window as any).pollInterval) {
      clearInterval((window as any).pollInterval);
    }
    // หยุด timeout
    if ((window as any).timeoutInterval) {
      clearInterval((window as any).timeoutInterval);
    }
  };

  // เริ่ม countdown 30 วินาที
  const startPaymentTimeout = () => {
    setPaymentTimeout(30);
    
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
    (window as any).timeoutInterval = interval;
  };

  const handlePaymentTimeout = () => {
    console.log('⏰ Payment timeout - returning to payment screen');
    setQrCodeData("");
    setPaymentMethod("");
    setPaymentTimeout(0);
    
    // หยุดการตรวจสอบสถานะ
    if ((window as any).pollInterval) {
      clearInterval((window as any).pollInterval);
    }
    if ((window as any).timeoutInterval) {
      clearInterval((window as any).timeoutInterval);
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
        } else {
          console.log('⏳ Payment still pending, continuing to poll...');
        }
        // สำหรับ 'pending' จะ continue polling
      } catch (error) {
        console.error('Payment status check failed:', error);
      }
    }, 2000); // เช็คทุก 2 วินาที
    
    // เก็บ interval reference
    (window as any).pollInterval = interval;
  };

  const handlePaymentSuccess = () => {
    console.log('💰 Payment successful! Starting photo session...');
    setPaymentSuccess(true);
    setQrCodeData("");
    setPaymentTimeout(0);
    setShowPayment(false);
    
    // หยุด timers
    if ((window as any).pollInterval) {
      clearInterval((window as any).pollInterval);
    }
    if ((window as any).timeoutInterval) {
      clearInterval((window as any).timeoutInterval);
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
    </div>
  );
}
// Backend Auto Print Function
const autoPrint = async (dataURL: string) => {
  const printId = Date.now();
  try {
    console.log(`🖨️ autoPrint called! ID: ${printId} - Using browser printing directly...`);
    
    // ใช้ browser printing โดยตรงแทนการเรียก backend
    await browserPrint(dataURL);
    
  } catch (error) {
    console.error('❌ Print error:', error);
    console.log('🔄 Attempting browser fallback...');
    browserPrint(dataURL);
  }
};

// Fallback browser printing function
const browserPrint = (dataURL: string) => {
  return new Promise((resolve, reject) => {
    console.log('🌐 browserPrint called! - Silent printing mode');
    
    try {
      // ใช้วิธี silent printing โดยไม่เปิด print dialog
      console.log('🖨️ Attempting silent print...');
      
      // สร้าง temporary image element ที่ซ่อนไว้
      const tempImg = document.createElement('img');
      tempImg.src = dataURL;
      tempImg.style.position = 'fixed';
      tempImg.style.top = '0';
      tempImg.style.left = '0';
      tempImg.style.width = '100%';
      tempImg.style.height = '100%';
      tempImg.style.objectFit = 'contain';
      tempImg.style.zIndex = '9999';
      tempImg.style.background = 'white';
      tempImg.style.opacity = '0'; // ซ่อนรูปไว้
      
      document.body.appendChild(tempImg);
      
      // รอให้รูปโหลดเสร็จแล้วพิมพ์ทันที
      tempImg.onload = () => {
        console.log('✅ Image loaded, printing silently...');
        
        // ลองใช้วิธีพิมพ์แบบ silent
        try {
          // วิธีที่ 1: ใช้ print() โดยตรง
          window.print();
          console.log('✅ Silent print initiated');
          
          // ลบ element หลังพิมพ์เสร็จ
          setTimeout(() => {
            document.body.removeChild(tempImg);
            console.log('✅ Image element cleaned up');
            resolve(true);
          }, 3000);
          
        } catch (printError) {
          console.log('⚠️ Silent print failed, trying alternative method...');
          
          // วิธีที่ 2: ใช้ iframe สำหรับพิมพ์
          const printFrame = document.createElement('iframe');
          printFrame.style.position = 'fixed';
          printFrame.style.top = '0';
          printFrame.style.left = '0';
          printFrame.style.width = '0';
          printFrame.style.height = '0';
          printFrame.style.border = 'none';
          
          document.body.appendChild(printFrame);
          
          printFrame.onload = () => {
            try {
              printFrame.contentWindow?.document.write(`
                <html>
                  <head>
                    <title>Print Photo</title>
                    <style>
                      @page { size: A4 portrait; margin: 0; }
                      body { margin: 0; padding: 0; }
                      img { width: 100%; height: auto; display: block; }
                    </style>
                  </head>
                  <body>
                    <img src="${dataURL}" />
                  </body>
                </html>
              `);
              
              printFrame.contentWindow?.document.close();
              
              // พิมพ์ทันที
              setTimeout(() => {
                printFrame.contentWindow?.print();
                console.log('✅ Iframe print completed');
                
                // ลบ elements
                setTimeout(() => {
                  document.body.removeChild(printFrame);
                  document.body.removeChild(tempImg);
                  console.log('✅ All elements cleaned up');
                  resolve(true);
                }, 2000);
              }, 500);
              
            } catch (iframeError) {
              console.error('❌ Iframe print error:', iframeError);
              document.body.removeChild(printFrame);
              document.body.removeChild(tempImg);
              reject(iframeError);
            }
          };
          
          printFrame.src = 'about:blank';
        }
      };
      
      tempImg.onerror = (error) => {
        console.error('❌ Image load error:', error);
        document.body.removeChild(tempImg);
        reject(error);
      };
      
    } catch (error) {
      console.error('❌ Browser print error:', error);
      reject(error);
    }
  });
};

