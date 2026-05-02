import { Pinecone } from '@pinecone-database/pinecone';
import { getEmbedding } from './gemini';

let pineconeInstance: Pinecone | null = null;

export const getPineconeClient = async () => {
  if (!pineconeInstance) {
    pineconeInstance = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY || 'mock-pinecone-key',
    });
  }
  return pineconeInstance;
};

export const getIndex = async () => {
  const client = await getPineconeClient();
  const indexName = process.env.PINECONE_INDEX_NAME || 'belleforet-cs';
  return client.index(indexName);
};

export interface VectorDocument {
  id: string; // facility id or notice id
  text: string;
  metadata: any;
}

/**
 * 문서를 벡터로 변환하여 Pinecone에 저장(upsert)합니다.
 */
export async function upsertDocument(doc: VectorDocument) {
  const index = await getIndex();
  const vector = await getEmbedding(doc.text);

  await index.upsert([
    {
      id: doc.id,
      values: vector,
      metadata: {
        text: doc.text,
        ...doc.metadata,
      },
    },
  ]);
}

/**
 * 쿼리에 대한 유사 문서를 검색합니다.
 */
export async function querySimilarDocuments(query: string, topK: number = 3) {
  const index = await getIndex();
  const queryVector = await getEmbedding(query);

  const queryResponse = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  });

  return queryResponse.matches.map(match => ({
    id: match.id,
    score: match.score,
    metadata: match.metadata,
  }));
}
