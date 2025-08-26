import { NextRequest, NextResponse } from 'next/server';

// Payment status types
type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'expired';

interface PaymentStatusData {
  status: PaymentStatus;
  timestamp: number;
  amount?: number;
  paymentMethod?: string;
  referenceId?: string;
  lastUpdated: number;
}

// In-memory store for payment status (in production, use database or Redis)
const paymentStatus = new Map<string, PaymentStatusData>();

// Cleanup old entries every 10 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const PAYMENT_EXPIRY = 30 * 60 * 1000; // 30 minutes

// Cleanup function
function cleanupOldEntries() {
  const now = Date.now();
  const cutoffTime = now - PAYMENT_EXPIRY;
  
  for (const [key, value] of paymentStatus.entries()) {
    if (value.lastUpdated < cutoffTime) {
      paymentStatus.delete(key);
      console.log(`Cleaned up expired payment: ${key}`);
    }
  }
}

// Set up periodic cleanup
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupOldEntries, CLEANUP_INTERVAL);
}

async function fetchBeamCharge(chargeId: string) {
  try {
    const BEAM_BASE_URL = process.env.BEAM_BASE_URL || (process.env.BEAM_ENV === 'playground' ? 'https://playground.api.beamcheckout.com' : 'https://api.beamcheckout.com');
    const url = `${BEAM_BASE_URL}/api/v1/charges/${encodeURIComponent(chargeId)}`;
    const BEAM_API_KEY = process.env.BEAM_API_KEY;
    const BEAM_MERCHANT_ID = process.env.BEAM_MERCHANT_ID;
    if (!BEAM_API_KEY || !BEAM_MERCHANT_ID) return null;
    const authString = `${BEAM_MERCHANT_ID}:${BEAM_API_KEY}`;
    const authHeader = Buffer.from(authString).toString('base64');
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Accept': 'application/json'
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch {
    return null;
  }
}

function mapBeamStatusToLocal(beamStatus?: string): PaymentStatus | 'unknown' {
  switch ((beamStatus || '').toUpperCase()) {
    case 'SUCCEEDED':
      return 'succeeded';
    case 'FAILED':
      return 'failed';
    case 'EXPIRED':
      return 'expired';
    case 'PENDING':
    case 'PROCESSING':
    default:
      return 'pending';
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chargeId = searchParams.get('chargeId');
    
    if (!chargeId) {
      return NextResponse.json({ 
        error: 'Missing required parameter',
        details: 'chargeId is required'
      }, { status: 400 });
    }

    // Validate chargeId format
    if (typeof chargeId !== 'string' || chargeId.trim().length === 0) {
      return NextResponse.json({ 
        error: 'Invalid chargeId',
        details: 'chargeId must be a non-empty string'
      }, { status: 400 });
    }

    let status = paymentStatus.get(chargeId);
    
    // If missing or still pending, try Beam fallback
    if (!status || status.status === 'pending') {
      const beam = await fetchBeamCharge(chargeId);
      if (beam && beam.status) {
        const mapped = mapBeamStatusToLocal(beam.status);
        const now = Date.now();
        if (mapped !== 'pending') {
          status = {
            status: mapped as PaymentStatus,
            timestamp: status?.timestamp || now,
            amount: beam.amount,
            paymentMethod: beam.paymentMethod?.type,
            referenceId: beam.referenceId,
            lastUpdated: now
          };
          paymentStatus.set(chargeId, status);
        }
      }
    }
    
    // Check if payment has expired
    if (status && (Date.now() - status.lastUpdated) > PAYMENT_EXPIRY) {
      paymentStatus.delete(chargeId);
      return NextResponse.json({
        chargeId,
        status: 'expired',
        timestamp: status.timestamp,
        message: 'Payment has expired'
      });
    }
    
    return NextResponse.json({
      chargeId,
      status: status?.status || 'pending',
      timestamp: status?.timestamp || null,
      amount: status?.amount || null,
      paymentMethod: status?.paymentMethod || null,
      referenceId: status?.referenceId || null,
      lastUpdated: status?.lastUpdated || null
    });
    
  } catch (error) {
    console.error('Payment status GET error:', error);
    return NextResponse.json({
      error: 'Failed to retrieve payment status',
      details: 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const { chargeId, status: newStatus, amount, paymentMethod, referenceId } = requestBody;
    
    // Validate required fields
    if (!chargeId) {
      return NextResponse.json({ 
        error: 'Missing required field',
        details: 'chargeId is required'
      }, { status: 400 });
    }

    if (!newStatus) {
      return NextResponse.json({ 
        error: 'Missing required field',
        details: 'status is required'
      }, { status: 400 });
    }

    // Validate chargeId
    if (typeof chargeId !== 'string' || chargeId.trim().length === 0) {
      return NextResponse.json({ 
        error: 'Invalid chargeId',
        details: 'chargeId must be a non-empty string'
      }, { status: 400 });
    }

    // Validate status
    const validStatuses: PaymentStatus[] = ['pending', 'succeeded', 'failed', 'expired'];
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json({ 
        error: 'Invalid status',
        details: `Status must be one of: ${validStatuses.join(', ')}`
      }, { status: 400 });
    }

    // Validate optional fields
    if (amount !== undefined && (typeof amount !== 'number' || amount < 0)) {
      return NextResponse.json({ 
        error: 'Invalid amount',
        details: 'Amount must be a positive number'
      }, { status: 400 });
    }

    if (paymentMethod !== undefined && typeof paymentMethod !== 'string') {
      return NextResponse.json({ 
        error: 'Invalid paymentMethod',
        details: 'Payment method must be a string'
      }, { status: 400 });
    }

    if (referenceId !== undefined && typeof referenceId !== 'string') {
      return NextResponse.json({ 
        error: 'Invalid referenceId',
        details: 'Reference ID must be a string'
      }, { status: 400 });
    }

    const now = Date.now();
    
    // Update or create payment status
    const existingStatus = paymentStatus.get(chargeId);
    const updatedStatus: PaymentStatusData = {
      status: newStatus,
      timestamp: existingStatus?.timestamp || now,
      amount: amount !== undefined ? amount : existingStatus?.amount,
      paymentMethod: paymentMethod !== undefined ? paymentMethod : existingStatus?.paymentMethod,
      referenceId: referenceId !== undefined ? referenceId : existingStatus?.referenceId,
      lastUpdated: now
    };

    paymentStatus.set(chargeId, updatedStatus);
    
    console.log(`Payment status updated: ${chargeId} -> ${newStatus}`, updatedStatus);
    
    return NextResponse.json({ 
      success: true,
      chargeId,
      status: newStatus,
      timestamp: updatedStatus.timestamp,
      lastUpdated: now
    });
    
  } catch (error) {
    console.error('Payment status POST error:', error);
    return NextResponse.json({
      error: 'Failed to update payment status',
      details: 'Internal server error'
    }, { status: 500 });
  }
}

// Add method to get all payment statuses (for debugging/admin purposes)
export async function PUT(request: NextRequest) {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ 
        error: 'Method not allowed in production',
        details: 'This endpoint is for development only'
      }, { status: 405 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    if (action === 'clear') {
      const count = paymentStatus.size;
      paymentStatus.clear();
      console.log(`Cleared ${count} payment statuses`);
      return NextResponse.json({ 
        success: true,
        message: `Cleared ${count} payment statuses`
      });
    }
    
    if (action === 'list') {
      const statuses = Array.from(paymentStatus.entries()).map(([chargeId, data]) => ({
        chargeId,
        ...data
      }));
      
      return NextResponse.json({
        success: true,
        count: statuses.length,
        statuses
      });
    }
    
    if (action === 'test-success') {
      // สำหรับทดสอบ - สร้าง payment status ใหม่
      const testChargeId = `test_${Date.now()}`;
      const now = Date.now();
      
      paymentStatus.set(testChargeId, {
        status: 'succeeded',
        timestamp: now,
        amount: 100,
        paymentMethod: 'promptpay',
        referenceId: 'test_payment',
        lastUpdated: now
      });
      
      console.log(`Created test payment status: ${testChargeId}`);
      
      return NextResponse.json({
        success: true,
        message: 'Test payment status created',
        chargeId: testChargeId,
        status: 'succeeded'
      });
    }
    
    return NextResponse.json({ 
      error: 'Invalid action',
      details: 'Supported actions: clear, list, test-success'
    }, { status: 400 });
    
  } catch (error) {
    console.error('Payment status PUT error:', error);
    return NextResponse.json({
      error: 'Failed to perform action',
      details: 'Internal server error'
    }, { status: 500 });
  }
}