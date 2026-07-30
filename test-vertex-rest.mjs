import { execSync } from 'child_process';

async function testVertexRest() {
  try {
    const token = execSync('gcloud auth application-default print-access-token').toString().trim();
    console.log('Got ADC Token:', token.substring(0, 20) + '...');

    const projectId = 'quickburn-ai-dev';
    const location = 'us-central1';
    const model = 'gemini-1.5-flash';

    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Hola, di "VERTEX AI OPERACIONAL OK"' }] }],
      }),
    });

    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testVertexRest();
