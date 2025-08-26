import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  console.log('🔔 Webhook received at:', new Date().toISOString());
  
  try {
    // Read raw body first (required for HMAC verification)
    const rawBody = await request.text();
    let body: any = {};
    
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      console.error('Invalid JSON payload');
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    
    console.log('Webhook payload:', JSON.stringify(body, null, 2));
    
    // Verify HMAC signature if secret is configured
    const secret = process.env.BEAM_WEBHOOK_HMAC;
    if (secret) {
      try {
        // Handle Base64 encoded key
        const key = /^[A-Za-z0-9+/]+={0,2}$/.test(secret) 
          ? Buffer.from(secret, 'base64') 
          : Buffer.from(secret);
        
        // Check for signature in various possible headers
        const sigHeader = 
          request.headers.get('x-beam-signature') ||
          request.headers.get('x-signature') ||
          request.headers.get('beam-signature') ||
          '';
        
        if (!sigHeader) {
          console.error('Missing signature header');
          return NextResponse.json({ error: 'Missing signature header' }, { status: 401 });
        }
        
        // Extract signature value (remove sha256= prefix if present)
        const received = sigHeader.replace(/^sha256=/i, '');
        
        // Calculate expected signature
        const expected = crypto
          .createHmac('sha256', key)
          .update(rawBody)
          .digest('hex');
        
        // Compare signatures using timing-safe comparison
        if (!crypto.timingSafeEqual(
          Buffer.from(received, 'hex'), 
          Buffer.from(expected, 'hex')
        )) {
          console.error('Invalid webhook signature');
          console.error('Received:', received);
          console.error('Expected:', expected);
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
        
        console.log('✅ Webhook signature verified successfully');
        
      } catch (signatureError) {
        console.error('Signature verification error:', signatureError);
        return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
      }
    } else {
      console.warn('⚠️ BEAM_WEBHOOK_HMAC not set; skipping signature verification');
    }
    
    // Process webhook events
    if (body.type === 'charge.succeeded') {
      const charge = body.data;
      console.log('Payment succeeded for charge:', charge.chargeId);
      
      // อัพเดทสถานะการชำระเงิน
      try {
        await fetch(`${request.nextUrl.origin}/api/payment-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chargeId: charge.chargeId,
            status: 'succeeded'
          })
        });
      } catch (error) {
        console.error('Failed to update payment status:', error);
      }
      
      return NextResponse.json({ 
        received: true,
        event: 'charge.succeeded',
        chargeId: charge.chargeId
      });
    }
    
    if (body.type === 'payment_link.paid') {
      const paymentLink = body.data;
      console.log('Payment link paid:', paymentLink);
      
      // อัพเดทสถานะการชำระเงิน
      try {
        await fetch(`${request.nextUrl.origin}/api/payment-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chargeId: paymentLink.chargeId || paymentLink.id,
            status: 'succeeded'
          })
        });
      } catch (error) {
        console.error('Failed to update payment status:', error);
      }
      
      return NextResponse.json({ 
        received: true,
        event: 'payment_link.paid'
      });
    }
    
    // Log other events but don't process them
    console.log('Unhandled webhook event:', body.type);
    return NextResponse.json({ received: true });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({
      error: 'Webhook processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}