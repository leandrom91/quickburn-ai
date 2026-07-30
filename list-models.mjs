import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

async function listModels() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    console.log('Available models:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error listing models:', e);
  }
}

listModels();
