import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('🔔 Webhook received at:', new Date().toISOString());
  
  try {
    const body = await request.json();
    console.log('Webhook payload:', JSON.stringify(body, null, 2));
    
    // ตรวจสอบ event type
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