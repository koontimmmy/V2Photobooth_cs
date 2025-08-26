import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

// Test webhook configuration
const TEST_CONFIG = {
  SIGNATURE_HEADER: 'x-beam-signature',
  TIMESTAMP_HEADER: 'x-beam-timestamp',
  TOLERANCE_SECONDS: 300,
  TEST_SECRET: 'uLFsxnsSm6tey/PhR+dLYSip0ZtsjpmtS3CbXjqqKj4=' // Your test secret
};

// Verify webhook signature
function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): { isValid: boolean; details: unknown } {
  try {
    const now = Math.floor(Date.now() / 1000);
    const webhookTimestamp = parseInt(timestamp, 10);
    
    // Check timestamp tolerance
    const timeDiff = Math.abs(now - webhookTimestamp);
    const isTimestampValid = timeDiff <= TEST_CONFIG.TOLERANCE_SECONDS;
    
    // Create expected signature
    const expectedSignature = createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');
    
    // Compare signatures
    const isSignatureValid = signature === expectedSignature;
    
    return {
      isValid: isSignatureValid && isTimestampValid,
      details: {
        timestamp: {
          now,
          webhookTimestamp,
          timeDiff,
          tolerance: TEST_CONFIG.TOLERANCE_SECONDS,
          isValid: isTimestampValid
        },
        signature: {
          received: signature,
          expected: expectedSignature,
          isValid: isSignatureValid
        },
        payload: {
          length: payload.length,
          preview: payload.substring(0, 100) + (payload.length > 100 ? '...' : '')
        }
      }
    };
  } catch (error) {
    return {
      isValid: false,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    };
  }
}

export async function POST(request: NextRequest) {
  console.log('🧪 Test Webhook Signature Verification');
  
  try {
    const signature = request.headers.get(TEST_CONFIG.SIGNATURE_HEADER);
    const timestamp = request.headers.get(TEST_CONFIG.TIMESTAMP_HEADER);
    
    if (!signature || !timestamp) {
      return NextResponse.json({
        error: 'Missing headers',
        details: {
          signature: signature ? 'present' : 'missing',
          timestamp: timestamp ? 'present' : 'missing'
        },
        required: {
          signature: TEST_CONFIG.SIGNATURE_HEADER,
          timestamp: TEST_CONFIG.TIMESTAMP_HEADER
        }
      }, { status: 400 });
    }
    
    const payload = await request.text();
    const verification = verifyWebhookSignature(payload, signature, timestamp, TEST_CONFIG.TEST_SECRET);
    
    console.log('Webhook signature verification result:', verification);
    
    if (verification.isValid) {
      return NextResponse.json({
        success: true,
        message: 'Webhook signature verified successfully',
        verification: verification.details
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'Webhook signature verification failed',
        verification: verification.details
      }, { status: 401 });
    }
    
  } catch (error) {
    console.error('Test webhook error:', error);
    return NextResponse.json({
      error: 'Test webhook processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  
  if (action === 'generate') {
    // Generate test signature for testing
    const testPayload = JSON.stringify({
      type: 'charge.succeeded',
      data: {
        chargeId: 'test_charge_123',
        amount: 100,
        paymentMethod: { type: 'promptpay' },
        referenceId: 'test_ref_123'
      }
    });
    
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', TEST_CONFIG.TEST_SECRET)
      .update(`${timestamp}.${testPayload}`)
      .digest('hex');
    
    return NextResponse.json({
      testData: {
        payload: testPayload,
        timestamp,
        signature,
        headers: {
          'x-beam-signature': signature,
          'x-beam-timestamp': timestamp
        }
      },
      instructions: [
        'Use this data to test webhook signature verification',
        'Send POST request to /api/webhook/test with these headers and payload',
        'Or use the test endpoint below'
      ]
    });
  }
  
  return NextResponse.json({
    message: 'Webhook Test Endpoint',
    endpoints: {
      'POST /api/webhook/test': 'Test webhook signature verification',
      'GET /api/webhook/test?action=generate': 'Generate test webhook data'
    },
    testSecret: TEST_CONFIG.TEST_SECRET.substring(0, 20) + '...'
  });
}
