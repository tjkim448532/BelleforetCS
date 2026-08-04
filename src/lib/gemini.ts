import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'mock-gemini-key');

/**
 * ?�스?��? 벡터�?변?�합?�다. (Gemini Embedding)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const result = await model.embedContent(text);
    // Pinecone ?�덱?��? 768차원?��?�? MRL(Matryoshka Representation Learning) ?�성???�용??768차원?�로 ?�라??반환?�니??
    return result.embedding.values.slice(0, 768);
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * 컨텍?�트�?기반?�로 ?��????�성?�니?? (Gemini Chat Completion)
 */
export async function generateAnswer(query: string, context: string, persona: string = 'friendly', language: string = 'ko'): Promise<string> {
  try {
    let personaInstruction = "??�� 공손?�고 친절???�텔리어처럼 ?�문?�인 ?�국??존댓말을 ?�용?�세??";
    if (persona === 'professional') {
      personaInstruction = "감정??배제?�고 명확?�고 간결?�게 ?�심�??��??�는 비서처럼 ?�동?�세??";
    } else if (persona === 'guide') {
      personaInstruction = "?�쾌?�고 ?�기�??�?�공??가?�드처럼 ?�너지 ?�치�??�?�하?�요. ?�모지???�절???�용?�세??";
    } else if (persona === 'english') {
      personaInstruction = "All your responses MUST be in fluent English, acting as a welcoming concierge for foreign tourists.";
    }

    if (language === 'en') {
      personaInstruction = "All your responses MUST be in fluent English. Act as a welcoming and polite concierge for foreign tourists at Belle Foret resort. Answer questions accurately based only on the provided context.";
    }

    const systemInstruction = language === 'en' 
      ? `You are the official AI knowledge response system for 'Belle Foret' resort.
Answer the user's [Question] using ONLY the provided [Context].
[Important Rules]
1. Never hallucinate or invent information not found in the context. Do not use external general knowledge.
2. If the context does not contain the answer, you must reply: "I'm sorry, but I don't have enough information to answer that question based on the provided data. Please contact the front desk." Do not make any guesses.
3. When giving directions or locations, do not output full street addresses (like Chungbuk Jeungpyeong-gun...). Only provide natural, relative directions based on landmarks inside the resort.
4. DO NOT use any Markdown formatting like **bold** or *italics*. Use plain text only. For lists, use hyphens (-) instead of asterisks (*).
${personaInstruction}

[Context]
${context}`
      : `?�신?� '벨포??Belle Foret)' 리조?�의 공식 AI 지???�답 ?�스?�입?�다. 
 ?�공??[컨텍?�트] ?�보만을 ?�용?�여 ?�용?�의 [질문]???��??�세??
 [중요 규칙]
 1. ?��? 컨텍?�트???�는 ?�용??지?�내거나(Hallucination) ?��????�반?�인 지?�으�??��??��? 마세??
 2. 컨텍?�트만으�??��??????�는 ?�용?�라�? ?�떠???�추???��? 말고 반드??"죄송?�니?? ?�공???�보만으로는 ?�당 질문???��??????�습?�다. ?�론???�스?�에 문의?�주?�요."(?�문 모드??경우 ?�어�??�고 ?�답?�세??
 3. ?�치??길안?��? ????"충북 증평�??�안�?.."�?같�? 불필?�한 ?�체 ?�로�?지�?주소???��? 출력?��? 말고, 리조???��? ?�드마크 기�????��????�치�??�연?�럽�??�내?�세??
 4. 마크?�운 ?�맷(?�히 ** 기호??* 기호)???��? ?�용?��? 마세?? 모든 ?��??� ?�수???�문(Plain Text)?�로 ?�성?�며, 목록???�요???�는 별표(*) ?�???�이??-)???�용?�세??
 ${personaInstruction}

[컨텍?�트]
${context}`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `[질문] ${query}` }] }],
      generationConfig: {
        temperature: 0.3, // ??��?�록 ?�확?�고 보수?�인 ?��?
        maxOutputTokens: 400,
      }
    });

    let answerText = result.response.text() || '?��????�성?????�습?�다.';
    
    // AI가 마크?�운???�을 경우�??�비한 ?�처�?로직 (강제 ?�거)
    answerText = answerText.replace(/\*\*/g, ''); // 굵게 ?�시 ?�거
    answerText = answerText.replace(/^\s*\*\s/gm, '- '); // 불릿 ?�인??*)�??�이??-)?�로 교체

    return answerText;
  } catch (error) {
    console.error('Error generating answer:', error);
    throw new Error('Failed to generate answer');
  }
}

/**
 * 컨텍?�트�?기반?�로 ?��????�성?�며, ?�시�??�트�?객체�?반환?�니?? (Gemini Chat Completion Streaming)
 */
export async function generateAnswerStream(query: string, context: string, persona: string = 'friendly', language: string = 'ko') {
  try {
    let personaInstruction = "??�� 공손?�고 친절???�텔리어처럼 ?�문?�인 ?�국??존댓말을 ?�용?�세??";
    if (persona === 'professional') {
      personaInstruction = "감정??배제?�고 명확?�고 간결?�게 ?�심�??��??�는 비서처럼 ?�동?�세??";
    } else if (persona === 'guide') {
      personaInstruction = "?�쾌?�고 ?�기�??�?�공??가?�드처럼 ?�너지 ?�치�??�?�하?�요. ?�모지???�절???�용?�세??";
    } else if (persona === 'english') {
      personaInstruction = "All your responses MUST be in fluent English, acting as a welcoming concierge for foreign tourists.";
    }

    if (language === 'en') {
      personaInstruction = "All your responses MUST be in fluent English. Act as a welcoming and polite concierge for foreign tourists at Belle Foret resort. Answer questions accurately based only on the provided context.";
    }

    const systemInstruction = language === 'en' 
      ? `You are the official AI knowledge response system for 'Belle Foret' resort.
Answer the user's [Question] using ONLY the provided [Context].
[Important Rules]
1. Never hallucinate or invent information not found in the context. Do not use external general knowledge.
2. If the context does not contain the answer, you must reply: "I'm sorry, but I don't have enough information to answer that question based on the provided data. Please contact the front desk." Do not make any guesses.
3. When giving directions or locations, do not output full street addresses (like Chungbuk Jeungpyeong-gun...). Only provide natural, relative directions based on landmarks inside the resort.
4. DO NOT use any Markdown formatting like **bold** or *italics*. Use plain text only. For lists, use hyphens (-) instead of asterisks (*).
${personaInstruction}

[Context]
${context}`
      : `?�신?� '벨포??Belle Foret)' 리조?�의 공식 AI 지???�답 ?�스?�입?�다. 
 ?�공??[컨텍?�트] ?�보만을 ?�용?�여 ?�용?�의 [질문]???��??�세??
 [중요 규칙]
 1. ?��? 컨텍?�트???�는 ?�용??지?�내거나(Hallucination) ?��????�반?�인 지?�으�??��??��? 마세??
 2. 컨텍?�트만으�??��??????�는 ?�용?�라�? ?�떠???�추???��? 말고 반드??"죄송?�니?? ?�공???�보만으로는 ?�당 질문???��??????�습?�다. ?�론???�스?�에 문의?�주?�요."(?�문 모드??경우 ?�어�??�고 ?�답?�세??
 3. ?�치??길안?��? ????"충북 증평�??�안�?.."�?같�? 불필?�한 ?�체 ?�로�?지�?주소???��? 출력?��? 말고, 리조???��? ?�드마크 기�????��????�치�??�연?�럽�??�내?�세??
 4. 마크?�운 ?�맷(?�히 ** 기호??* 기호)???��? ?�용?��? 마세?? 모든 ?��??� ?�수???�문(Plain Text)?�로 ?�성?�며, 목록???�요???�는 별표(*) ?�???�이??-)???�용?�세??
 ${personaInstruction}

[컨텍?�트]
${context}`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction
    });

    const result = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: `[질문] ${query}` }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 400,
      }
    });

    return result; // Returns GenerateContentStreamResult
  } catch (error) {
    console.error('Error generating answer stream:', error);
    throw new Error('Failed to generate answer stream');
  }
}

/**
 * 관리자??지?�어???�라 ?�본 ?�스?��? ?�정?�고 ?�약??반환?�니??
 */
export async function smartEditFacilityDescription(original: string, instruction: string): Promise<{summary: string, updatedText: string}> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: `?�신?� ?�스???�집 보조 AI?�니?? ?�용?��? ?�공??[?�본 ?�스??�?[?�정 지????맞게 ?�정?�세??
?�답?� 반드???�래 JSON ?�식?�로�?반환?�야 ?�니?? 마크?�운(\`\`\`json) 기호 ?�이 ?�수??JSON ?�스?�만 출력?�세??
{
  "summary": "?�떤 부분을 ?�떻�??�정?�는지 간결????�??�약",
  "updatedText": "?�정??모두 반영???�체 ?�스?�본 (기존 ?�스?�의 맥락 ?��?)"
}`
    });

    const prompt = `[?�본 ?�스??\n${original}\n\n[?�정 지??\n${instruction}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500,
        responseMimeType: "application/json",
      }
    });

    const responseText = result.response.text();
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Error in smartEditFacilityDescription:', error);
    throw new Error('Failed to execute smart edit');
  }
}

export async function smartSplitFacilityDescription(text: string): Promise<{description: string, seasonalDescription: string}> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: `?�신?� ?�스??분류 AI?�니?? 주어�?[?�설 ?�명] ?�스?��? ??가지 범주�??�벽?�게 분리?�세??
1. description (고정 ?�보): ?�영?�간, ?�치, 기본 ?�징, ?�구?�인 주의?�항 ??
2. seasonalDescription (?�즌/?�시 ?�보): ?�름/겨울 ?�즌 ?�정 ?�벤?? ?�정 ?�짜?�만 진행?�는 ?�사, 공사 ???�시?�인 ?�태 ?�보.

?�답?� 반드???�래 JSON ?�식?�로�?반환?�야 ?�니?? 마크?�운(\`\`\`json) 기호 ?�이 ?�수??JSON ?�스?�만 출력?�세??
{
  "description": "분리??고정 ?�보 ?�스??(줄바�??��?)",
  "seasonalDescription": "분리???�즌/?�시 ?�보 ?�스??(?�당 ?�으�?�?문자??"
}`
    });

    const prompt = `[?�설 ?�명]\n${text}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      }
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);
    
    return {
      description: parsed.description || '',
      seasonalDescription: parsed.seasonalDescription || ''
    };
  } catch (error) {
    console.error('Error in smartSplitFacilityDescription:', error);
    throw new Error('Failed to execute smart split');
  }
}

/**
 * 기존 ?�설 ?�명�?직원???�로 ?�력???�명???�연?�럽�?병합?�니?? (Golden Record ?�성)
 */
export async function mergeFacilityDescription(existingDesc: string, newDesc: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: `?�신?� 문서 병합(Merge) ?�문가?�니??
[기존 ?�명]�?직원??방금 추�?/?�정??[?�로???�명]??주어집니??
?????�스?��? 모순 ?�이 ?�나???�연?�럽�?구조?�된 ?�스?�로 병합?�여 반환?�세??

[병합 규칙]
1. 최신 ?�보??[?�로???�명]???�선?�니?? ?�영?�간?�나 ?�금 ?�이 충돌?�면 ?�로???�명???�르?�요.
2. [기존 ?�명]?�만 ?�는 ?�용???�세 ?�보(주의?�항 ????버리지 말고 ?��??�세??
3. ???�보가 충돌?��? ?�는 추�? ?�용?�라�? ?�연?�럽�?기존 ??��???�어 붙이?�요(Append).
4. 중복?�는 ?�용?� ?�나�??�치�?문맥???�연?�럽�??�듬?�세??
5. ?�떤 부???�명?�나 마크?�운 코드 블록(\`\`\` ????출력?��? 말고, ?�직 '병합??최종 ?�스?? 결과물만 ?�수 ?�문(Plain Text)?�로 출력?�세??`
    });

    const prompt = `[기존 ?�명]\n${existingDesc}\n\n[?�로???�명]\n${newDesc}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2, // ?�실 기반??보수?�인 병합
        maxOutputTokens: 800,
      }
    });

    return result.response.text().trim();
  } catch (error) {
    console.error('Error in mergeFacilityDescription:', error);
    // AI ?�러 ???�전 ?�치�?최신 ?�력??반환?�거??기존 병합 로직(?�순 ?�어붙이�? ?�용
    return `${existingDesc}\n\n--- (?�동 병합 ?�패, ?�동 ?�인 ?�망) ---\n\n${newDesc}`;
  }
}

/**
 * 모든 ?�설 ?�이?��? AI�??�해 ?�벽???�이?�베?�스 ?�태(CSV)�?추출?�니??
 */
export async function generateBibleCSV(facilitiesData: any[], currentDate: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: `?�신?� ?�이?�베?�스 ?�계 �??�규???�문가?�니??
주어�?JSON 배열 ?�태??[?�설 ?�이??�?분석?�여 ?�벽???�형 ?�이?�베?�스(CSV ?�식)�?변?�하?�요.

[Zero Data Loss ?�칙 - 반드??지??�?
1. ?�영 ?�사말이???�순 중복 문구�??�거?�세??
2. ?�영?�간, 가�? ?�장 ?�한, ?��? 조건, ?�인, ?�불 규정 ??구체?�인 조건(Fact)?� ?��? ?�나??빠짐?�이 '?�세_?�징_�?규정' 컬럼??개조??Bullet point)?�로 기록?�세??
3. [과거 ?�벤???�터�?: ?�늘 ?�짜??"${currentDate}" ?�니?? ?�명글???�사 기간??명시?�어 ?�고, �?기한???�늘 ?�짜보다 ?�실??과거?�면 ?�당 ?�설(?�벤???� CSV 결과?�서 ?�예 ?�외?�세??

[CSV 컬럼 구조 (?�확?????�서�??��? �?]
카테고리,?�설�??�치,?�영?�간,?�용?�금,?�세_?�징_�?규정,검?�태�?

- CSV ?�더�?�?줄에 반드???�함?�세??
- ?�이???�의 ?�표(,)??줄바꿈�? ?�따?�표(" ")�?묶어??CSV ?�맷??깨�?지 ?�게 ?�세??
- 마크?�운 기호(\`\`\`csv) ?�이 ?�수??CSV ?�스?�만 출력?�세??`
    });

    const prompt = `[?�설 ?�이??\n${JSON.stringify(facilitiesData, null, 2)}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1, // 매우 보수?�이�??�확?�게
      }
    });

    let csvText = result.response.text();
    // 마크?�운 ?�거 (만약 출력?�었?�면)
    csvText = csvText.replace(/^```(csv)?/i, '').replace(/```$/i, '').trim();
    
    return csvText;
  } catch (error: any) {
    console.error('Error in generateBibleCSV:', error);
    throw new Error(`AI 백서 ?�성 �??�류가 발생?�습?�다: ${error.message || '?????�는 ?�류'}`);
  }
}

/**
 * ?�패???�??로그?�을 분석?�여 ?�로??지?�을 ?�안?�니??
 */
export async function analyzeFailedLogs(logs: any[]): Promise<any[]> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: `?�신?� 고객 ?�비??�??�이?�베?�스 관�??�문가?�니??
주어�?[?�패???�??로그]??챗봇???��?�??��??��? 못했거나 고객??불만족한 ?��??�입?�다.
??로그?�을 분석?�여, 공통?�인 고객??불만?�나 부족한 ?�보(Pain point)�?찾아?�고,
?��? ?�결?�기 ?�해 ?�스?�에 추�??�야 ??'?�로??지??Facility/FAQ ?�이??' 초안???�성?�주?�요.

?�답?� 반드???�래 ?�식??JSON 배열(Array)로만 반환?�야 ?�니?? 마크?�운 기호 ?�이 ?�수 JSON�?출력?�세??
[
  {
    "problem": "고객?�이 ?�모�??�?�에 ?�???�주 묻�?�??�보가 ?�음",
    "suggestedName": "?�모�?�??�체???�???�내",
    "suggestedCategory": "기�?",
    "suggestedDescription": "벨포???�컴?�터?�서 ?�모�?�??�체?��? 무료�??�?�하?????�습?�다. (?�분�?보�? ?�요)",
    "suggestedTags": "?�모�? ?�체?? ?�?? ?�이?�반"
  }
]`
    });

    const prompt = `[?�패???�??로그]\n${JSON.stringify(logs, null, 2)}\n\n??로그?�을 바탕?�로 1~3개의 ?�심?�인 ?�규 지?�을 ?�안?�주?�요.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2, // 창의?�이???�무 벗어?��? ?�게
        maxOutputTokens: 600,
        responseMimeType: "application/json",
      }
    });

    const responseText = result.response.text();
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Error in analyzeFailedLogs:', error);
    throw new Error('Failed to analyze failed logs');
  }
}
