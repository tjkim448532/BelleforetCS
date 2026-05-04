import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

const env = fs.readFileSync('.env.local', 'utf-8');
const key = env.match(/GEMINI_API_KEY="(.*)"/)[1];
const genAI = new GoogleGenerativeAI(key);

async function test() {
  try {
    let model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    let res = await model.generateContent('hello');
    console.log('gemini-1.5-flash SUCCESS');
  } catch (e) {
    console.error('gemini-1.5-flash ERROR:', e.message);
  }

  try {
    let model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    let res = await model.generateContent('hello');
    console.log('gemini-1.5-flash-latest SUCCESS');
  } catch (e) {
    console.error('gemini-1.5-flash-latest ERROR:', e.message);
  }
}
test();
