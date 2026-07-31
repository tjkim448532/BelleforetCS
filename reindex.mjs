import fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  if (line.trim() && !line.startsWith('#') && line.includes('=')) {
    const firstEq = line.indexOf('=');
    const k = line.substring(0, firstEq).trim();
    let v = line.substring(firstEq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) {
      v = v.substring(1, v.length - 1);
    }
    env[k] = v;
  }
});

// Init Firebase
initializeApp({
  credential: cert({
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  })
});
const db = getFirestore();

// Init Pinecone
const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY });
const index = pc.index(env.PINECONE_INDEX_NAME || 'belleforet-cs');

// Init Gemini
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });

async function run() {
  console.log('Fetching approved facilities from Firestore...');
  const snapshot = await db.collection('facilities').where('status', '==', 'approved').get();
  const docs = snapshot.docs;
  console.log(`Found ${docs.length} approved facilities.`);
  
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const data = doc.data();
    const id = doc.id;
    const name = data.name;
    const category = data.category || '기타';
    const location = data.location || '';
    const description = data.description || '';
    const tags = (data.tags || []).join(', ');

    const textToVectorize = `시설명: ${name}\n카테고리: ${category}\n위치: ${location}\n설명: ${description}\n태그: ${tags}`;
    
    console.log(`[${i+1}/${docs.length}] Embedding ${name}...`);
    try {
      const result = await model.embedContent(textToVectorize);
      const vector = result.embedding.values.slice(0, 768);

      await index.upsert([{
        id: id,
        values: vector,
        metadata: {
          type: data.type || 'facility',
          name,
          category,
          text: textToVectorize
        }
      }]);
      console.log(` -> Upserted ${id}`);
    } catch (e) {
      console.error(`Error on ${name}:`, e.message);
    }
    // Sleep a bit to avoid rate limits
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log('Re-indexing complete.');
}

run();
