import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log('Testing SDK with key:', apiKey);

const genAI = new GoogleGenerativeAI(apiKey);

async function testSdk() {
  const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];

  for (const m of models) {
    try {
      console.log(`\nTesting SDK with model: ${m}`);
      const model = genAI.getGenerativeModel({ model: m });
      const result = await model.generateContent('Hola! Di "Respuesta Dinámica 100% OK"');
      console.log(`✅ SDK SUCCESS with ${m}:`, result.response.text());
      return;
    } catch (err) {
      console.error(`❌ SDK Error with ${m}:`, err.message);
    }
  }
}

testSdk();
