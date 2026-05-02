import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'mock-gemini-key');

/**
 * 텍스트를 벡터로 변환합니다. (Gemini Embedding)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * 컨텍스트를 기반으로 답변을 생성합니다. (Gemini Chat Completion)
 */
export async function generateAnswer(query: string, context: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: `당신은 '벨포레(Belle Foret)' 리조트의 고객 및 직원을 위한 공식 AI 지식 응답 시스템입니다. 
제공된 [컨텍스트] 정보만을 사용하여 사용자의 [질문]에 정확하고 친절하게 답변하세요.
컨텍스트에 없는 내용을 지어내거나 일반적인 지식으로 답변하지 마세요. 컨텍스트만으로 답변할 수 없는 경우, "죄송합니다. 제공된 정보만으로는 해당 질문에 답변할 수 없습니다."라고 응답하세요.

[컨텍스트]
${context}`
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `[질문] ${query}` }] }],
      generationConfig: {
        temperature: 0.3, // 낮을수록 정확하고 보수적인 답변
      }
    });

    return result.response.text() || '답변을 생성할 수 없습니다.';
  } catch (error) {
    console.error('Error generating answer:', error);
    throw new Error('Failed to generate answer');
  }
}
