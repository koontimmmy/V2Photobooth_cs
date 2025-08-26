import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

// Backup webhook configuration
const WEBHOOK_CONFIG = {
  SIGNATURE_HEADER: 'x-beam-signature',
  TIMESTAMP_HEADER: 'x-beam-timestamp',
  TOLERANCE_SECONDS: 300,
  SUPPORTED_EVENTS: [
    'charge.succeeded',
    'charge.failed',
    'charge.expired',
    'payment_link.paid',
    'payment_link.expired'
  ] as const
};

function extractHexSignature(sigRaw: string): string {
  const raw = (sigRaw || '').trim();
  const parts = raw.split(',');
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (v && (k.toLowerCase() === 'sha256' || k.toLowerCase() === 'v1')) {
      return v.trim();
    }
  }
  return raw;
}

function isValidHex64(str: string): boolean {
  return /^[a-f0-9]{64}$/i.test(str);
}

function tryDecodeBase64(input: string): Buffer | null {
  try {
    if (/^[A-Za-z0-9+/=]+$/.test(input) && input.length % 4 === 0) {
      const buf = Buffer.from(input, 'base64');
      return buf.length ? buf : null;
    }
    return null;
  } catch {
    return null;
  }
}

// Verify webhook signature
function verifyWebhookSignature(
  payload: string,
  signatureRaw: string,
  timestamp: string,
  secret: string
): { valid: boolean; reason?: string } {
  try {
    const extracted = extractHexSignature(signatureRaw);
    if (!isValidHex64(extracted)) {
      return { valid: false, reason: 'invalid_signature_format' };
    }

    const now = Math.floor(Date.now() / 1000);
    const webhookTimestamp = parseInt(timestamp, 10);
    if (!Number.isFinite(webhookTimestamp)) {
      return { valid: false, reason: 'invalid_timestamp' };
    }
    if (Math.abs(now - webhookTimestamp) > WEBHOOK_CONFIG.TOLERANCE_SECONDS) {
      return { valid: false, reason: 'timestamp_out_of_tolerance' };
    }

    const makeExpectedHex = (key: Buffer | string) => createHmac('sha256', key)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    const expectedHexAscii = makeExpectedHex(secret);
    const decoded = tryDecodeBase64(secret);
    const expectedHexB64 = decoded ? makeExpectedHex(decoded) : null;

    const receivedBuf = Buffer.from(extracted, 'hex');

    let expectedBuf = Buffer.from(expectedHexAscii, 'hex');
    if (receivedBuf.length === expectedBuf.length && crypto.timingSafeEqual(receivedBuf, expectedBuf)) {
      return { valid: true };
    }

    if (expectedHexB64) {
      expectedBuf = Buffer.from(expectedHexB64, 'hex');
      if (receivedBuf.length === expectedBuf.length && crypto.timingSafeEqual(receivedBuf, expectedBuf)) {
        return { valid: true };
      }
    }

    return { valid: false, reason: 'mismatch' };
  } catch (error) {
    console.error('Backup webhook signature verification error:', error);
    return { valid: false, reason: 'exception' };
  }
}

// Update payment status
async function updatePaymentStatus(
  origin: string,
  chargeId: string,
  status: 'succeeded' | 'failed' | 'expired',
  additionalData?: Record<string, any>
) {
  try {
    const response = await fetch(`${origin}/api/payment-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chargeId,
        status,
        ...additionalData
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Backup webhook failed to update payment status:', {
        chargeId,
        status,
        responseStatus: response.status,
        error: errorData
      });
      return false;
    }
    
    console.log(`Backup webhook: Payment status updated successfully: ${chargeId} -> ${status}`);
    return true;
  } catch (error) {
    console.error('Backup webhook error updating payment status:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  console.log('🔔 Backup Webhook received at:', new Date().toISOString());
  
  try {
    const signatureHeader = request.headers.get(WEBHOOK_CONFIG.SIGNATURE_HEADER) || '';
    const timestampHeader = request.headers.get(WEBHOOK_CONFIG.TIMESTAMP_HEADER) || '';
    
    const webhookSecret = process.env.BEAM_WEBHOOK_SECRET;
    if (webhookSecret && signatureHeader && timestampHeader) {
      const payload = await request.text();
      const verification = verifyWebhookSignature(payload, signatureHeader, timestampHeader, webhookSecret);
      
      if (!verification.valid) {
        console.error('Backup webhook: Invalid signature', verification);
        return NextResponse.json({ 
          error: 'Invalid signature',
          details: verification.reason || 'Backup webhook signature verification failed'
        }, { status: 401 });
      }
      
      let body;
      try {
        body = JSON.parse(payload);
      } catch (parseError) {
        console.error('Backup webhook: Failed to parse payload:', parseError);
        return NextResponse.json({
          error: 'Invalid payload',
          details: 'Backup webhook payload is not valid JSON'
        }, { status: 400 });
      }
      
      console.log('Backup webhook payload verified:', JSON.stringify(body, null, 2));
      
      // Process webhook event
      return await processWebhookEvent(body, request);
    } else {
      console.warn('Backup webhook: Signature verification skipped');
      
      let body;
      try {
        body = await request.json();
      } catch (parseError) {
        console.error('Backup webhook: Failed to parse payload:', parseError);
        return NextResponse.json({
          error: 'Invalid payload',
          details: 'Backup webhook payload is not valid JSON'
        }, { status: 400 });
      }
      
      console.log('Backup webhook payload (unverified):', JSON.stringify(body, null, 2));
      
      return await processWebhookEvent(body, request);
    }
    
  } catch (error) {
    console.error('Backup webhook processing error:', error);
    return NextResponse.json({
      error: 'Backup webhook processing failed',
      details: 'Internal server error'
    }, { status: 500 });
  }
}

async function processWebhookEvent(body: any, request: NextRequest): Promise<NextResponse> {
  const eventType = body.type;
  const origin = request.nextUrl.origin;
  
  console.log('Backup webhook processing event:', eventType);
  
  if (!WEBHOOK_CONFIG.SUPPORTED_EVENTS.includes(eventType)) {
    console.log('Backup webhook: Unsupported event:', eventType);
    return NextResponse.json({ 
      received: true,
      event: eventType,
      message: 'Event type not supported by backup webhook',
      endpoint: 'backup'
    });
  }
  
  try {
    switch (eventType) {
      case 'charge.succeeded':
        return await handleChargeSucceeded(body.data, origin);
        
      case 'charge.failed':
        return await handleChargeFailed(body.data, origin);
        
      case 'charge.expired':
        return await handleChargeExpired(body.data, origin);
        
      case 'payment_link.paid':
        return await handlePaymentLinkPaid(body.data, origin);
        
      case 'payment_link.expired':
        return await handlePaymentLinkExpired(body.data, origin);
        
      default:
        console.log('Backup webhook: Unhandled event:', eventType);
        return NextResponse.json({ received: true, endpoint: 'backup' });
    }
  } catch (error) {
    console.error(`Backup webhook error processing ${eventType}:`, error);
    return NextResponse.json({
      error: 'Event processing failed',
      details: 'Backup webhook failed to process event'
    }, { status: 500 });
  }
}

async function handleChargeSucceeded(charge: any, origin: string): Promise<NextResponse> {
  console.log('Backup webhook: Payment succeeded for charge:', charge.chargeId);
  
  const success = await updatePaymentStatus(origin, charge.chargeId, 'succeeded', {
    amount: charge.amount,
    paymentMethod: charge.paymentMethod?.type,
    referenceId: charge.referenceId
  });
  
  return NextResponse.json({ 
    received: true,
    event: 'charge.succeeded',
    chargeId: charge.chargeId,
    statusUpdated: success,
    endpoint: 'backup'
  });
}

async function handleChargeFailed(charge: any, origin: string): Promise<NextResponse> {
  console.log('Backup webhook: Payment failed for charge:', charge.chargeId);
  
  const success = await updatePaymentStatus(origin, charge.chargeId, 'failed', {
    amount: charge.amount,
    paymentMethod: charge.paymentMethod?.type,
    referenceId: charge.referenceId
  });
  
  return NextResponse.json({ 
    received: true,
    event: 'charge.failed',
    chargeId: charge.chargeId,
    statusUpdated: success,
    endpoint: 'backup'
  });
}

async function handleChargeExpired(charge: any, origin: string): Promise<NextResponse> {
  console.log('Backup webhook: Payment expired for charge:', charge.chargeId);
  
  const success = await updatePaymentStatus(origin, charge.chargeId, 'expired', {
    amount: charge.amount,
    paymentMethod: charge.paymentMethod?.type,
    referenceId: charge.referenceId
  });
  
  return NextResponse.json({ 
    received: true,
    event: 'charge.expired',
    chargeId: charge.chargeId,
    statusUpdated: success,
    endpoint: 'backup'
  });
}

async function handlePaymentLinkPaid(paymentLink: any, origin: string): Promise<NextResponse> {
  console.log('Backup webhook: Payment link paid:', paymentLink.id);
  
  const chargeId = paymentLink.chargeId || paymentLink.id;
  const success = await updatePaymentStatus(origin, chargeId, 'succeeded', {
    amount: paymentLink.amount,
    paymentMethod: paymentLink.paymentMethod?.type,
    referenceId: paymentLink.referenceId
  });
  
  return NextResponse.json({ 
    received: true,
    event: 'payment_link.paid',
    chargeId,
    statusUpdated: success,
    endpoint: 'backup'
  });
}

async function handlePaymentLinkExpired(paymentLink: any, origin: string): Promise<NextResponse> {
  console.log('Backup webhook: Payment link expired:', paymentLink.id);
  
  const chargeId = paymentLink.chargeId || paymentLink.id;
  const success = await updatePaymentStatus(origin, chargeId, 'expired', {
    amount: paymentLink.amount,
    paymentMethod: paymentLink.paymentMethod?.type,
    referenceId: paymentLink.referenceId
  });
  
  return NextResponse.json({ 
    received: true,
    event: 'payment_link.expired',
    chargeId,
    statusUpdated: success,
    endpoint: 'backup'
  });
}
