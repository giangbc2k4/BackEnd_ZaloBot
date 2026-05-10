let lastCallTime = 0;
let isBackupKeyExhausted = false;

function getGeminiKey() {
  const mainKey = process.env.GEMINI_API_KEY;
  const backupKey = process.env.GEMINI_API_KEY_BACKUP;
  
  if (isBackupKeyExhausted) {
    return mainKey; // If both are exhausted, just try main again
  }
  
  // Use backup key if main key is marked exhausted
  if (process.env.GEMINI_KEY_EXHAUSTED === 'true') {
    return backupKey || mainKey;
  }
  return mainKey;
}

export async function callGeminiSafe(prompt: string, mimeType: string, base64Data: string): Promise<any> {
  const model = 'gemini-1.5-flash-latest';
  
  // Tối thiểu 4 giây giữa các lần gọi (15 req/phút = 1 req/4s)
  const now = Date.now();
  const timeSinceLast = now - lastCallTime;
  if (timeSinceLast < 4000) {
    await new Promise(r => setTimeout(r, 4000 - timeSinceLast));
  }

  const makeRequest = async (apiKey: string) => {
    lastCallTime = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }],
        generationConfig: {
          temperature: 0.1
        }
      })
    });

    const data = await response.json() as any;
    
    if (!response.ok || data.error) {
      throw { status: response.status, errorData: data.error };
    }
    
    return data;
  };

  try {
    return await makeRequest(getGeminiKey() as string);
  } catch (err: any) {
    if (err.status === 429 || err.errorData?.code === 429) {
      const errMsg = err.errorData?.message || '';
      
      // Nếu hết quota ngày của Free Tier -> Chuyển sang Backup Key
      if (errMsg.includes('Quota exceeded') && process.env.GEMINI_API_KEY_BACKUP) {
        console.log("Main API Key exhausted quota, switching to Backup Key...");
        process.env.GEMINI_KEY_EXHAUSTED = 'true';
        return await makeRequest(getGeminiKey() as string);
      }

      // Lấy thời gian chờ từ thông báo lỗi (vd: retry in 51s)
      const match = errMsg.match(/retry in ([\d.]+)s/);
      const delay = (match ? parseFloat(match[1]) : 60) * 1000;
      
      console.log(`Rate limited (429), chờ ${delay / 1000}s trước khi thử lại...`);
      await new Promise(r => setTimeout(r, delay));
      
      return await makeRequest(getGeminiKey() as string); // Thử lại 1 lần duy nhất
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
    
    const data = await callGeminiSafe(prompt, mimeType, base64Image);
    const text = data.candidates[0].content.parts[0].text;
    console.log("Gemini trả về nguyên bản:", text);
    
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("Lỗi khi đọc ảnh bằng Gemini:", error);
    return null;
  }
}
