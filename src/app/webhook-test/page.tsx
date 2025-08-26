"use client";

import { useState } from 'react';

export default function WebhookTestPage() {
  const [testData, setTestData] = useState<any>(null);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generateTestData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/webhook/test?action=generate');
      const data = await response.json();
      setTestData(data.testData);
      setVerificationResult(null);
    } catch (error) {
      console.error('Failed to generate test data:', error);
    } finally {
      setLoading(false);
    }
  };

  const testWebhook = async () => {
    if (!testData) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/webhook/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-beam-signature': testData.signature,
          'x-beam-timestamp': testData.timestamp
        },
        body: testData.payload
      });
      
      const result = await response.json();
      setVerificationResult(result);
    } catch (error) {
      console.error('Failed to test webhook:', error);
      setVerificationResult({
        error: 'Request failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  const testMainWebhook = async () => {
    if (!testData) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-beam-signature': testData.signature,
          'x-beam-timestamp': testData.timestamp
        },
        body: testData.payload
      });
      
      const result = await response.json();
      setVerificationResult({
        endpoint: 'Main Webhook',
        status: response.status,
        result
      });
    } catch (error) {
      console.error('Failed to test main webhook:', error);
      setVerificationResult({
        endpoint: 'Main Webhook',
        error: 'Request failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  const testBackupWebhook = async () => {
    if (!testData) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/webhook/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-beam-signature': testData.signature,
          'x-beam-timestamp': testData.timestamp
        },
        body: testData.payload
      });
      
      const result = await response.json();
      setVerificationResult({
        endpoint: 'Backup Webhook',
        status: response.status,
        result
      });
    } catch (error) {
      console.error('Failed to test backup webhook:', error);
      setVerificationResult({
        endpoint: 'Backup Webhook',
        error: 'Request failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">🧪 Webhook Testing Dashboard</h1>
        
        {/* Generate Test Data */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">1. Generate Test Data</h2>
          <button
            onClick={generateTestData}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Generating...' : 'Generate Test Webhook Data'}
          </button>
        </div>

        {/* Test Data Display */}
        {testData && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">2. Test Data Generated</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-700">Headers:</h3>
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                  {JSON.stringify(testData.headers, null, 2)}
                </pre>
              </div>
              <div>
                <h3 className="font-medium text-gray-700">Payload:</h3>
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                  {testData.payload}
                </pre>
              </div>
              <div>
                <h3 className="font-medium text-gray-700">Timestamp:</h3>
                <code className="bg-gray-100 px-2 py-1 rounded">{testData.timestamp}</code>
              </div>
              <div>
                <h3 className="font-medium text-gray-700">Signature:</h3>
                <code className="bg-gray-100 px-2 py-1 rounded text-xs break-all">
                  {testData.signature}
                </code>
              </div>
            </div>
          </div>
        )}

        {/* Test Buttons */}
        {testData && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">3. Test Webhook Endpoints</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={testWebhook}
                disabled={loading}
                className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              >
                Test Signature Verification
              </button>
              <button
                onClick={testMainWebhook}
                disabled={loading}
                className="bg-purple-600 text-white px-4 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
              >
                Test Main Webhook
              </button>
              <button
                onClick={testBackupWebhook}
                disabled={loading}
                className="bg-orange-600 text-white px-4 py-3 rounded-lg hover:bg-orange-700 disabled:bg-gray-400"
              >
                Test Backup Webhook
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {verificationResult && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">4. Test Results</h2>
            <div className="bg-gray-100 p-4 rounded">
              <pre className="text-sm overflow-x-auto">
                {JSON.stringify(verificationResult, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 rounded-lg p-6 mt-6">
          <h2 className="text-xl font-semibold text-blue-900 mb-4">📚 How to Use</h2>
          <ol className="list-decimal list-inside space-y-2 text-blue-800">
            <li>Click "Generate Test Webhook Data" to create test data</li>
            <li>Use the generated data to test different webhook endpoints</li>
            <li>Check the results to verify signature verification works</li>
            <li>Use this data to test with external tools like Postman or curl</li>
          </ol>
          
          <div className="mt-4 p-4 bg-blue-100 rounded">
            <h3 className="font-semibold text-blue-900 mb-2">🔧 External Testing with curl:</h3>
            {testData && (
              <pre className="text-sm text-blue-800 overflow-x-auto">
{`curl -X POST ${window.location.origin}/api/webhook/test \\
  -H "Content-Type: application/json" \\
  -H "x-beam-signature: ${testData.signature}" \\
  -H "x-beam-timestamp: ${testData.timestamp}" \\
  -d '${testData.payload}'`}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
