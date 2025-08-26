import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('💳 Payment API called at:', new Date().toISOString());
  
  try {
    const { paymentMethod } = await request.json();
    console.log('Payment method requested:', paymentMethod);
    
    // BeamCheckout API configuration
    const BEAM_API_URL = 'https://api.beamcheckout.com/api/v1/charges';
    const BEAM_API_KEY = process.env.BEAM_API_KEY;
    const BEAM_MERCHANT_ID = process.env.BEAM_MERCHANT_ID;
    
    if (!BEAM_API_KEY || !BEAM_MERCHANT_ID) {
      return NextResponse.json({ 
        error: 'Payment service not configured',
        details: 'Missing API credentials'
      }, { status: 500 });
    }
    
    // ลองวิธี 1: Merchant ID เป็น username, API Key เป็น password
    const authString = `${BEAM_MERCHANT_ID}:${BEAM_API_KEY}`;
    const authHeader = Buffer.from(authString).toString('base64');
    
    console.log('Auth Method: Merchant ID as username, API Key as password');
    console.log('Username (Merchant ID):', BEAM_MERCHANT_ID);
    console.log('Password (API Key):', BEAM_API_KEY.substring(0, 10) + '...');
    console.log('Auth string:', `${BEAM_MERCHANT_ID}:${BEAM_API_KEY.substring(0, 10)}...`);
    console.log('Auth header:', authHeader);
    
    // สร้าง payment request ตาม method ที่เลือก
    let paymentMethodData;
    
    if (paymentMethod === 'promptpay') {
      paymentMethodData = {
        paymentMethodType: 'QR_PROMPT_PAY',
        qrPromptPay: {
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 นาที
        }
      };
    } else if (paymentMethod === 'wechat') {
      paymentMethodData = {
        paymentMethodType: 'WECHAT_PAY',
        weChatPay: {}
      };
    } else {
      return NextResponse.json({ 
        error: 'Invalid payment method',
        details: 'Supported methods: promptpay, wechat'
      }, { status: 400 });
    }
    
    // สร้าง charge request
    const chargeRequest = {
      amount: 100, // 1 บาท = 100 สตางค์
      currency: 'THB',
      paymentMethod: paymentMethodData,
      referenceId: `photobooth_${Date.now()}`,
      returnUrl: `${request.headers.get('origin')}/payment-success`
    };
    
    console.log('Creating charge request:', JSON.stringify(chargeRequest, null, 2));
    
    // เรียก BeamCheckout API
    console.log('Attempting API call to:', BEAM_API_URL);
    console.log('Request headers:', {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${authHeader}`
    });
    
    const response = await fetch(BEAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authHeader}`
      },
      body: JSON.stringify(chargeRequest)
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const result = await response.json();
    console.log('BeamCheckout response body:', JSON.stringify(result, null, 2));
    
    if (!response.ok) {
      console.error('API Error Details:', {
        status: response.status,
        statusText: response.statusText,
        body: result
      });
      
      return NextResponse.json({
        error: 'Payment creation failed',
        details: result,
        status: response.status,
        statusText: response.statusText
      }, { status: response.status });
    }
    
    // ส่งข้อมูล QR Code กลับไป
    return NextResponse.json({
      success: true,
      chargeId: result.chargeId,
      paymentMethod: paymentMethod,
      qrCode: result.encodedImage?.imageBase64Encoded || null,
      qrExpiry: result.encodedImage?.expiry || null,
      redirectUrl: result.redirect?.redirectUrl || null,
      actionRequired: result.actionRequired
    });
    
  } catch (error) {
    console.error('Payment API error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}