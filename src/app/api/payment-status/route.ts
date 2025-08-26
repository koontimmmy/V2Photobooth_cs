import { NextRequest, NextResponse } from 'next/server';

// Store for tracking payment status (in production, use database or Redis)
const paymentStatus = new Map<string, { status: 'pending' | 'succeeded' | 'failed', timestamp: number }>();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chargeId = searchParams.get('chargeId');
  
  if (!chargeId) {
    return NextResponse.json({ error: 'chargeId required' }, { status: 400 });
  }
  
  const status = paymentStatus.get(chargeId);
  
  // Clean up old entries (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of paymentStatus.entries()) {
    if (value.timestamp < tenMinutesAgo) {
      paymentStatus.delete(key);
    }
  }
  
  return NextResponse.json({
    chargeId,
    status: status?.status || 'pending',
    timestamp: status?.timestamp || null
  });
}

export async function POST(request: NextRequest) {
  try {
    const { chargeId, status } = await request.json();
    
    if (!chargeId || !status) {
      return NextResponse.json({ error: 'chargeId and status required' }, { status: 400 });
    }
    
    paymentStatus.set(chargeId, {
      status,
      timestamp: Date.now()
    });
    
    console.log(`Payment status updated: ${chargeId} -> ${status}`);
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Payment status update error:', error);
    return NextResponse.json({
      error: 'Status update failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}