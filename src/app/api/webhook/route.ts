import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

// Webhook configuration
const WEBHOOK_CONFIG = {
  SIGNATURE_HEADER: 'x-beam-signature',
  TIMESTAMP_HEADER: 'x-beam-timestamp',
  TOLERANCE_SECONDS: 300, // 5 minutes tolerance for timestamp
  SUPPORTED_EVENTS: [
    'charge.succeeded',
    'charge.failed',
    'charge.expired',
    'payment_link.paid',
    'payment_link.expired'
  ] as const,
  // รองรับหลาย webhook endpoints
  WEBHOOK_ENDPOINTS: [
    '/api/webhook',           // Main webhook
    '/api/webhook/backup',    // Backup webhook
    '/api/webhook/staging'    // Staging webhook
  ] as const
};

type SupportedEvent = typeof WEBHOOK_CONFIG.SUPPORTED_EVENTS[number];

interface ChargePayload {
  chargeId?: string;
  amount?: number;
  paymentMethod?: { type?: string } | null;
  referenceId?: string;
}

interface PaymentLinkPayload {
  id?: string;
  chargeId?: string;
  amount?: number;
  paymentMethod?: { type?: string } | null;
  referenceId?: string;
}

function extractHexSignature(sigRaw: string): string {
  const raw = (sigRaw || '').trim();
  // Formats to support: "hex", "sha256=hex", "v1=hex", or comma-separated list
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
    // Heuristic: if base64-like, try decode
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

    // Check timestamp tolerance
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

    // Compute with ascii secret first
    const expectedHexAscii = makeExpectedHex(secret);
    // Optionally compute with base64-decoded secret if looks like base64
    const decoded = tryDecodeBase64(secret);
    const expectedHexB64 = decoded ? makeExpectedHex(decoded) : null;

    const receivedBuf = Buffer.from(extracted, 'hex');

    let expectedBuf = Buffer.from(expectedHexAscii, 'hex');
    if (receivedBuf.length === expectedBuf.length && crypto.timingSafeEqual(receivedBuf, expectedBuf)) {
      return { valid: true };
    }

    // Compare with base64-decoded expected if available
    if (expectedHexB64) {
      expectedBuf = Buffer.from(expectedHexB64, 'hex');
      if (receivedBuf.length === expectedBuf.length && crypto.timingSafeEqual(receivedBuf, expectedBuf)) {
        return { valid: true };
      }
    }

    return { valid: false, reason: 'mismatch' };
  } catch (error) {
    console.error('Signature verification error:', error);
    return { valid: false, reason: 'exception' };
  }
}

// Update payment status
async function updatePaymentStatus(
  origin: string,
  chargeId: string,
  status: 'succeeded' | 'failed' | 'expired',
  additionalData?: Record<string, unknown>
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
      console.error('Failed to update payment status:', {
        chargeId,
        status,
        responseStatus: response.status,
        error: errorData
      });
      return false;
    }
    
    console.log(`Payment status updated successfully: ${chargeId} -> ${status}`);
    return true;
  } catch (error) {
    console.error('Error updating payment status:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  console.log('🔔 Webhook received at:', new Date().toISOString());
  
  try {
    // Get webhook signature and timestamp
    const signatureHeader = request.headers.get(WEBHOOK_CONFIG.SIGNATURE_HEADER) || '';
    const timestampHeader = request.headers.get(WEBHOOK_CONFIG.TIMESTAMP_HEADER) || '';
    
    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.BEAM_WEBHOOK_SECRET;
    if (webhookSecret && signatureHeader && timestampHeader) {
      const payload = await request.text();
      const verification = verifyWebhookSignature(payload, signatureHeader, timestampHeader, webhookSecret);
      
      if (!verification.valid) {
        console.error('Invalid webhook signature', verification);
        return NextResponse.json({ 
          error: 'Invalid signature',
          details: verification.reason || 'Webhook signature verification failed'
        }, { status: 401 });
      }
      
      // Parse payload after verification
      let body: unknown;
      try {
        body = JSON.parse(payload);
      } catch (parseError) {
        console.error('Failed to parse webhook payload:', parseError);
        return NextResponse.json({
          error: 'Invalid payload',
          details: 'Webhook payload is not valid JSON'
        }, { status: 400 });
      }
      
      console.log('Webhook payload verified:', JSON.stringify(body, null, 2));
      
      // Process webhook event
      return await processWebhookEvent(body, request);
    } else {
      // Fallback for development or when signature verification is not configured
      console.warn('Webhook signature verification skipped - missing secret or headers');
      
      let body: unknown;
      try {
        body = await request.json();
      } catch (parseError) {
        console.error('Failed to parse webhook payload:', parseError);
        return NextResponse.json({
          error: 'Invalid payload',
          details: 'Webhook payload is not valid JSON'
        }, { status: 400 });
      }
      
      console.log('Webhook payload (unverified):', JSON.stringify(body, null, 2));
      
      // Process webhook event
      return await processWebhookEvent(body, request);
    }
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({
      error: 'Webhook processing failed',
      details: 'Internal server error'
    }, { status: 500 });
  }
}

async function processWebhookEvent(body: unknown, request: NextRequest): Promise<NextResponse> {
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const eventType = (body as { type?: string }).type as SupportedEvent | undefined;
  const origin = request.nextUrl.origin;
  
  console.log('Processing webhook event:', eventType);
  
  // Validate event type
  if (!eventType || !WEBHOOK_CONFIG.SUPPORTED_EVENTS.includes(eventType)) {
    console.log('Unsupported webhook event:', eventType);
    return NextResponse.json({ 
      received: true,
      event: eventType,
      message: 'Event type not supported'
    });
  }
  
  try {
    switch (eventType) {
      case 'charge.succeeded':
        return await handleChargeSucceeded((body as { data?: ChargePayload }).data || {});
        
      case 'charge.failed':
        return await handleChargeFailed((body as { data?: ChargePayload }).data || {});
        
      case 'charge.expired':
        return await handleChargeExpired((body as { data?: ChargePayload }).data || {});
        
      case 'payment_link.paid':
        return await handlePaymentLinkPaid((body as { data?: PaymentLinkPayload }).data || {});
        
      case 'payment_link.expired':
        return await handlePaymentLinkExpired((body as { data?: PaymentLinkPayload }).data || {});
        
      default:
        console.log('Unhandled webhook event:', eventType);
        return NextResponse.json({ received: true });
    }
  } catch (error) {
    console.error(`Error processing ${eventType} event:`, error);
    return NextResponse.json({
      error: 'Event processing failed',
      details: 'Failed to process webhook event'
    }, { status: 500 });
  }
}

async function handleChargeSucceeded(charge: ChargePayload): Promise<NextResponse> {
  console.log('Payment succeeded for charge:', charge.chargeId);
  const origin = process.env.PUBLIC_BASE_URL || '';
  
  const success = await updatePaymentStatus(origin, String(charge.chargeId || ''), 'succeeded', {
    amount: charge.amount,
    paymentMethod: charge.paymentMethod?.type,
    referenceId: charge.referenceId
  });
  
  return NextResponse.json({ 
    received: true,
    event: 'charge.succeeded',
    chargeId: charge.chargeId,
    statusUpdated: success
  });
}

async function handleChargeFailed(charge: ChargePayload): Promise<NextResponse> {
  console.log('Payment failed for charge:', charge.chargeId);
  const origin = process.env.PUBLIC_BASE_URL || '';
  
  const success = await updatePaymentStatus(origin, String(charge.chargeId || ''), 'failed', {
    amount: charge.amount,
    paymentMethod: charge.paymentMethod?.type,
    referenceId: charge.referenceId
  });
  
  return NextResponse.json({ 
    received: true,
    event: 'charge.failed',
    chargeId: charge.chargeId,
    statusUpdated: success
  });
}

async function handleChargeExpired(charge: ChargePayload): Promise<NextResponse> {
  console.log('Payment expired for charge:', charge.chargeId);
  const origin = process.env.PUBLIC_BASE_URL || '';
  
  const success = await updatePaymentStatus(origin, String(charge.chargeId || ''), 'expired', {
    amount: charge.amount,
    paymentMethod: charge.paymentMethod?.type,
    referenceId: charge.referenceId
  });
  
  return NextResponse.json({ 
    received: true,
    event: 'charge.expired',
    chargeId: charge.chargeId,
    statusUpdated: success
  });
}

async function handlePaymentLinkPaid(paymentLink: PaymentLinkPayload): Promise<NextResponse> {
  console.log('Payment link paid:', paymentLink.id);
  const origin = process.env.PUBLIC_BASE_URL || '';
  
  const chargeId = paymentLink.chargeId || paymentLink.id || '';
  const success = await updatePaymentStatus(origin, String(chargeId), 'succeeded', {
    amount: paymentLink.amount,
    paymentMethod: paymentLink.paymentMethod?.type,
    referenceId: paymentLink.referenceId
  });
  
  return NextResponse.json({ 
    received: true,
    event: 'payment_link.paid',
    chargeId,
    statusUpdated: success
  });
}

async function handlePaymentLinkExpired(paymentLink: PaymentLinkPayload): Promise<NextResponse> {
  console.log('Payment link expired:', paymentLink.id);
  const origin = process.env.PUBLIC_BASE_URL || '';
  
  const chargeId = paymentLink.chargeId || paymentLink.id || '';
  const success = await updatePaymentStatus(origin, String(chargeId), 'expired', {
    amount: paymentLink.amount,
    paymentMethod: paymentLink.paymentMethod?.type,
    referenceId: paymentLink.referenceId
  });
  
  return NextResponse.json({ 
    received: true,
    event: 'payment_link.expired',
    chargeId,
    statusUpdated: success
  });
}