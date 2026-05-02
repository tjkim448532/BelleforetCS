import fs from 'fs';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';

const env = fs.readFileSync('.env.local', 'utf-8');
const pKey = env.match(/PINECONE_API_KEY=\"(.*)\"/)[1];
const gKey = env.match(/GEMINI_API_KEY=\"(.*)\"/)[1];

const pc = new Pinecone({ apiKey: pKey });
const index = pc.index('belleforet-cs');
const genAI = new GoogleGenerativeAI(gKey);

async function test() {
  try {
    const q = '목장 언제까지 해?';
    
    // 1. Embed
    console.log('Embedding...');
    const emModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const emResult = await emModel.embedContent(q);
    const vector = emResult.embedding.values.slice(0, 768);
    
    // 2. Query Pinecone
    console.log('Querying Pinecone...');
    const queryResponse = await index.query({
      vector: vector,
      topK: 3,
      includeMetadata: true,
    });
    
    const context = queryResponse.matches.map(m => m.metadata.text).join('\n\n');
    console.log('Context:', context);
    
    // 3. Generate Answer
    console.log('Generating Answer...');
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: 'You are a helpful assistant.'
    });
    
    const prompt = `[컨텍스트]\n${context}\n\n[질문]\n${q}`;
    const result = await model.generateContent(prompt);
    console.log('Answer:', result.response.text());
    
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
