import { GoogleGenAI } from '@google/genai';

let lastCallTime = 0;
let isBackupKeyExhausted = false;

function getGeminiKey() {
  const mainKey = process.env.GEMINI_API_KEY;
  const backupKey = process.env.GEMINI_API_KEY_BACKUP;
  
  if (isBackupKeyExhausted) {
    return mainKey; 
  }
  
  if (process.env.GEMINI_KEY_EXHAUSTED === 'true') {
    return backupKey || mainKey;
  }
  return mainKey;
}

export async function callGeminiSafe(prompt: string, mimeType: string, base64Data: string): Promise<any> {
  // Model ổn định và miễn phí nhiều nhất
  const modelName = 'gemini-2.0-flash';
  
  const now = Date.now();
  const timeSinceLast = now - lastCallTime;
  if (timeSinceLast < 4000) {
    await new Promise(r => setTimeout(r, 4000 - timeSinceLast));
  }

  const makeRequest = async (apiKey: string) => {
    lastCallTime = Date.now();
    const ai = new GoogleGenAI({ apiKey });
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64Data } }
        ]
      }]
    });
    
    return response;
  };

  try {
    return await makeRequest(getGeminiKey() as string);
  } catch (err: any) {
    const errMsg = err.message || '';
    console.error(`[Gemini API Error] Original: ${errMsg}`);
    
    if (errMsg.includes('429') || errMsg.includes('Quota exceeded') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      const hasBackupKey = !!process.env.GEMINI_API_KEY_BACKUP;
      
      if ((errMsg.includes('limit: 0') || errMsg.includes('Quota exceeded')) && hasBackupKey && process.env.GEMINI_KEY_EXHAUSTED !== 'true') {
        console.log("Main API Key exhausted quota or limit 0, switching to Backup Key...");
        process.env.GEMINI_KEY_EXHAUSTED = 'true';
        try {
          return await makeRequest(getGeminiKey() as string);
        } catch (fallbackErr: any) {
          console.error(`[Gemini API Error] Fallback key also failed: ${fallbackErr.message}`);
          throw fallbackErr;
        }
      }

      const match = errMsg.match(/retry in ([\d.]+)s/);
      const delay = (match ? parseFloat(match[1]) : 60) * 1000;
      
      console.log(`Rate limited (429), chờ ${delay / 1000}s trước khi thử lại...`);
      await new Promise(r => setTimeout(r, delay));
      
      return await makeRequest(getGeminiKey() as string); 
    }
    throw err;
  }
}

export async function readMeterFromImage(imageUrl: string) {
  try {
    console.log("Đang tải ảnh từ Zalo...", imageUrl);
    const imageResponse = await fetch(imageUrl);
    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

    console.log("Đang gọi Gemini API...");
    const prompt = 'Đây là ảnh đồng hồ điện/nước. Đọc chỉ số trên mặt đồng hồ và trả về định dạng JSON duy nhất, ví dụ: {"chi_so": 12345}. Không giải thích gì thêm, chỉ trả về chuỗi JSON.';
    
    const response = await callGeminiSafe(prompt, mimeType, base64Image);
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log("Gemini trả về nguyên bản:", text);
    
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("Lỗi khi đọc ảnh bằng Gemini:", error);
    return null;
  }
}

export async function checkGeminiKey(apiKey: string) {
  try {
    const ai = new GoogleGenAI({ apiKey });
    let msg = '🔍 Kết quả kiểm tra API Key:\n\n';
    
    // Test 1.5 Flash 8B (nhẹ nhất)
    try {
      await ai.models.generateContent({ model: 'gemini-1.5-flash-8b', contents: 'Hi' });
      msg += '✅ gemini-1.5-flash-8b: Hoạt động tốt!\n';
    } catch (e: any) {
      const eMsg = e.message || '';
      if (eMsg.includes('429') || eMsg.includes('Quota exceeded')) msg += '⚠️ gemini-1.5-flash-8b: Hết hạn mức (429)\n';
      else if (eMsg.includes('limit: 0')) msg += '❌ gemini-1.5-flash-8b: Bị khoá (limit: 0)\n';
      else msg += `❌ gemini-1.5-flash-8b: Lỗi (${eMsg.substring(0, 50)}...)\n`;
    }

    // Test 2.0 Flash
    try {
      await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: 'Hi' });
      msg += '✅ gemini-2.0-flash: Hoạt động tốt!\n';
    } catch (e: any) {
      const eMsg = e.message || '';
      if (eMsg.includes('429') || eMsg.includes('Quota exceeded')) msg += '⚠️ gemini-2.0-flash: Hết hạn mức (429)\n';
      else if (eMsg.includes('limit: 0')) msg += '❌ gemini-2.0-flash: Bị khoá (limit: 0)\n';
      else msg += `❌ gemini-2.0-flash: Lỗi (${eMsg.substring(0, 50)}...)\n`;
    }

    return msg;
  } catch (error: any) {
    return `❌ Lỗi kiểm tra: ${error.message}`;
  }
}
