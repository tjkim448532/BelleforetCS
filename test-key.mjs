import { GoogleGenerativeAI } from '@google/generative-ai';

// 사용자님이 올려주신 화면의 키를 직접 하드코딩하여 테스트합니다.
const API_KEY = "AIzaSyDiGtMT-itJqNBqwCz9mjXOsS75VZMPokw";
const genAI = new GoogleGenerativeAI(API_KEY);

async function run() {
  try {
    console.log("Gemini API 키 테스트 중...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    const result = await model.generateContent("안녕하세요!");
    console.log("성공! 응답:", result.response.text());
  } catch (e) {
    console.error("실패:", e.message);
  }
}

run();
