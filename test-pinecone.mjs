import fs from 'fs';
import { Pinecone } from '@pinecone-database/pinecone';

const env = fs.readFileSync('.env.local', 'utf-8');
const key = env.match(/PINECONE_API_KEY=\"(.*)\"/)[1];

const pc = new Pinecone({ apiKey: key });
const index = pc.index('belleforet-cs');

index.upsert([{ id: 'test1', values: Array(768).fill(0.1) }])
  .then(() => console.log('Upsert ok'))
  .catch(console.error);
