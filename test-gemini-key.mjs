import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log('Testing GEMINI_API_KEY:', apiKey);

async function testGemini() {
  const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro'];

  for (const model of models) {
    console.log(`\n--- Testing model ${model} with query param key ---`);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hola, di solamente "OK TRABAJANDO"' }] }] }),
      });
      const text = await res.text();
      console.log(`Status: ${res.status}`);
      console.log(`Body: ${text.substring(0, 300)}`);
    } catch (e) {
      console.error('Fetch error:', e.message);
    }

    console.log(`\n--- Testing model ${model} with Bearer Header ---`);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hola, di solamente "OK TRABAJANDO"' }] }] }),
      });
      const text = await res.text();
      console.log(`Status: ${res.status}`);
      console.log(`Body: ${text.substring(0, 300)}`);
    } catch (e) {
      console.error('Fetch error:', e.message);
    }
  }
}

testGemini();
