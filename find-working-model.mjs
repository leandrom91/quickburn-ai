import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

async function findWorkingModel() {
  const models = [
    'gemini-1.5-flash-001',
    'gemini-1.5-flash-002',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro-001',
    'gemini-1.5-pro-002',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash-lite-preview-02-05',
    'gemini-2.5-flash',
    'antigravity-preview-05-2026',
    'gemini-3.1-flash-tts-preview'
  ];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hola' }] }] }),
      });
      const data = await res.json();
      console.log(`Model [${model}] -> Status: ${res.status}`);
      if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
        console.log(`✅ SUCCESS WITH [${model}]:`, data.candidates[0].content.parts[0].text);
      } else if (data.error) {
        console.log(`❌ ERROR WITH [${model}]:`, data.error.message);
      }
    } catch (e) {
      console.error(`Exception [${model}]:`, e.message);
    }
  }
}

findWorkingModel();
