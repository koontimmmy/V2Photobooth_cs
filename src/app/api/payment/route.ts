import { NextRequest, NextResponse } from 'next/server';

// Payment configuration
const PAYMENT_CONFIG = {
  MIN_AMOUNT: 100, // 1 บาท = 100 สตางค์
  MAX_AMOUNT: 1000000, // 10,000 บาท
  DEFAULT_AMOUNT: 100,
  QR_EXPIRY_MINUTES: 30,
  SUPPORTED_METHODS: ['promptpay', 'wechat'] as const
};

export async function POST(request: NextRequest) {
  console.log('💳 Payment API called at:', new Date().toISOString());
  
  try {
    // Validate request method
    if (request.method !== 'POST') {
      return NextResponse.json({ 
        error: 'Method not allowed',
        details: 'Only POST method is supported'
      }, { status: 405 });
    }

    // Parse and validate request body
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (error) {
      return NextResponse.json({ 
        error: 'Invalid JSON',
        details: 'Request body must be valid JSON'
      }, { status: 400 });
    }

    const { paymentMethod, amount = PAYMENT_CONFIG.DEFAULT_AMOUNT, referenceId } = requestBody;

    // Validate required fields
    if (!paymentMethod) {
      return NextResponse.json({ 
        error: 'Missing required field',
        details: 'paymentMethod is required'
      }, { status: 400 });
    }

    // Validate payment method
    if (!PAYMENT_CONFIG.SUPPORTED_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ 
        error: 'Invalid payment method',
        details: `Supported methods: ${PAYMENT_CONFIG.SUPPORTED_METHODS.join(', ')}`
      }, { status: 400 });
    }

    // Validate amount
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount < PAYMENT_CONFIG.MIN_AMOUNT || numericAmount > PAYMENT_CONFIG.MAX_AMOUNT) {
      return NextResponse.json({ 
        error: 'Invalid amount',
        details: `Amount must be between ${PAYMENT_CONFIG.MIN_AMOUNT} and ${PAYMENT_CONFIG.MAX_AMOUNT} satang`
      }, { status: 400 });
    }

    // Validate referenceId if provided
    if (referenceId && typeof referenceId !== 'string') {
      return NextResponse.json({ 
        error: 'Invalid referenceId',
        details: 'referenceId must be a string'
      }, { status: 400 });
    }

    console.log('Payment request validated:', { paymentMethod, amount: numericAmount, referenceId });

    // BeamCheckout API configuration
    const BEAM_BASE_URL = process.env.BEAM_BASE_URL || (process.env.BEAM_ENV === 'playground' ? 'https://playground.api.beamcheckout.com' : 'https://api.beamcheckout.com');
    const BEAM_API_URL = `${BEAM_BASE_URL}/api/v1/charges`;
    const BEAM_API_KEY = process.env.BEAM_API_KEY;
    const BEAM_MERCHANT_ID = process.env.BEAM_MERCHANT_ID;
    const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || request.headers.get('origin') || 'http://localhost:3000';
    
    if (!BEAM_API_KEY || !BEAM_MERCHANT_ID) {
      console.error('Missing BeamCheckout credentials');
      return NextResponse.json({ 
        error: 'Payment service not configured',
        details: 'Missing API credentials'
      }, { status: 500 });
    }
    
    // Create authentication header
    const authString = `${BEAM_MERCHANT_ID}:${BEAM_API_KEY}`;
    const authHeader = Buffer.from(authString).toString('base64');
    
    // Create payment method data based on selected method
    let paymentMethodData;
    
    if (paymentMethod === 'promptpay') {
      paymentMethodData = {
        paymentMethodType: 'QR_PROMPT_PAY',
        qrPromptPay: {
          expiresAt: new Date(Date.now() + PAYMENT_CONFIG.QR_EXPIRY_MINUTES * 60 * 1000).toISOString()
        }
      };
    } else if (paymentMethod === 'wechat') {
      paymentMethodData = {
        paymentMethodType: 'WECHAT_PAY',
        weChatPay: {}
      };
    }
    
    // Create charge request
    const chargeRequest = {
      amount: numericAmount,
      currency: 'THB',
      paymentMethod: paymentMethodData,
      referenceId: referenceId || `photobooth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      returnUrl: `${PUBLIC_BASE_URL}/payment-success`
    };
    
    console.log('Creating charge request:', JSON.stringify(chargeRequest, null, 2));
    
    // Call BeamCheckout API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await fetch(BEAM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`,
          'User-Agent': 'Photobooth-Payment-API/1.0'
        },
        body: JSON.stringify(chargeRequest),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log('Response status:', response.status);
      
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        return NextResponse.json({
          error: 'Invalid response from payment service',
          details: 'Payment service returned invalid JSON'
        }, { status: 502 });
      }
      
      console.log('BeamCheckout response:', JSON.stringify(result, null, 2));
      
      if (!response.ok) {
        console.error('Payment API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: result
        });
        
        // Handle specific error cases
        if (response.status === 401) {
          return NextResponse.json({
            error: 'Authentication failed',
            details: 'Invalid API credentials'
          }, { status: 401 });
        }
        
        if (response.status === 400) {
          return NextResponse.json({
            error: 'Invalid payment request',
            details: result.error || 'Payment service rejected the request'
          }, { status: 400 });
        }
        
        return NextResponse.json({
          error: 'Payment creation failed',
          details: result.error || 'Payment service error',
          status: response.status
        }, { status: response.status });
      }
      
      // Validate response data
      if (!result.chargeId) {
        console.error('Missing chargeId in response:', result);
        return NextResponse.json({
          error: 'Invalid response from payment service',
          details: 'Missing charge ID'
        }, { status: 502 });
      }
      
      // Initialize local pending status (best-effort)
      try {
        const origin = request.nextUrl?.origin || PUBLIC_BASE_URL;
        await fetch(`${origin}/api/payment-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chargeId: result.chargeId,
            status: 'pending',
            amount: numericAmount,
            paymentMethod,
            referenceId: chargeRequest.referenceId
          })
        }).catch(() => {});
      } catch (e) {
        console.warn('Failed to set initial pending status');
      }
      
      // Return success response
      return NextResponse.json({
        success: true,
        chargeId: result.chargeId,
        paymentMethod: paymentMethod,
        amount: numericAmount,
        qrCode: result.encodedImage?.imageBase64Encoded || null,
        qrExpiry: result.encodedImage?.expiry || null,
        redirectUrl: result.redirect?.redirectUrl || null,
        actionRequired: result.actionRequired,
        referenceId: chargeRequest.referenceId
      });
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('Payment API timeout');
        return NextResponse.json({
          error: 'Payment service timeout',
          details: 'Payment service took too long to respond'
        }, { status: 504 });
      }
      
      console.error('Payment API fetch error:', fetchError);
      return NextResponse.json({
        error: 'Payment service unavailable',
        details: 'Unable to connect to payment service'
      }, { status: 503 });
    }
    
  } catch (error) {
    console.error('Payment API unexpected error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: 'An unexpected error occurred'
    }, { status: 500 });
  }
}