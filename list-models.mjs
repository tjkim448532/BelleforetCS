import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

const env = fs.readFileSync('.env.local', 'utf-8');
const key = env.match(/GEMINI_API_KEY="(.*)"/)[1];

async function list() {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
  const data = await response.json();
  data.models.forEach(m => console.log(m.name, m.supportedGenerationMethods));
}
list();
