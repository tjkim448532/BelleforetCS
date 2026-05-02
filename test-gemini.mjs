import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

const env = fs.readFileSync('.env.local', 'utf-8');
const key = env.match(/GEMINI_API_KEY=\"(.*)\"/)[1];
const genAI = new GoogleGenerativeAI(key);
const model = genAI.getGenerativeModel({ model: 'embedding-001' });

model.embedContent('Test').then(r => console.log('Success:', r.embedding.values.length)).catch(console.error);
