export async function checkGroqKey(apiKey: string) {
  try {
    let msg = '🔍 Kết quả kiểm tra Groq API Key:\n\n';
    
    const testModel = async (modelName: string) => {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || `HTTP ${response.status}`);
      }
      return data;
    };

    // Test text model
    try {
      await testModel('llama3-8b-8192');
      msg += '✅ llama3-8b-8192: Hoạt động tốt!\n';
    } catch (e: any) {
      const eMsg = e.message || '';
      if (eMsg.includes('429') || eMsg.includes('Rate limit')) msg += '⚠️ llama3-8b-8192: Hết hạn mức (429)\n';
      else msg += `❌ llama3-8b-8192: Lỗi (${eMsg.substring(0, 50)}...)\n`;
    }

    // Test vision model
    try {
      await testModel('llama-3.2-11b-vision-preview');
      msg += '✅ llama-3.2-11b-vision-preview: Hoạt động tốt!\n';
    } catch (e: any) {
      const eMsg = e.message || '';
      if (eMsg.includes('429') || eMsg.includes('Rate limit')) msg += '⚠️ llama-3.2-11b-vision-preview: Hết hạn mức (429)\n';
      else msg += `❌ llama-3.2-11b-vision-preview: Lỗi (${eMsg.substring(0, 50)}...)\n`;
    }

    return msg;
  } catch (error: any) {
    return `❌ Lỗi kiểm tra Groq: ${error.message}`;
  }
}

let lastCallTime = 0;
let isBackupKeyExhausted = false;

function getGroqKey() {
  const mainKey = process.env.GROQ_API_KEY;
  const backupKey = process.env.GROQ_API_KEY_BACKUP;
  
  if (isBackupKeyExhausted) return mainKey; 
  if (process.env.GROQ_KEY_EXHAUSTED === 'true') return backupKey || mainKey;
  return mainKey;
}

export async function readMeterFromImageGroq(imageUrl: string) {
  try {
    console.log("Đang gọi Groq API...", imageUrl);
    const apiKey = getGroqKey();
    if (!apiKey) {
      console.error("Thiếu GROQ_API_KEY. Vui lòng thêm vào .env");
      return null;
    }

    const now = Date.now();
    const timeSinceLast = now - lastCallTime;
    if (timeSinceLast < 2100) {
      await new Promise(r => setTimeout(r, 2100 - timeSinceLast));
    }
    lastCallTime = Date.now();

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Đây là ảnh đồng hồ điện/nước. Đọc chỉ số trên mặt đồng hồ và trả về định dạng JSON duy nhất, ví dụ: {"chi_so": 12345}. Không giải thích gì thêm, chỉ trả về chuỗi JSON.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        temperature: 0.1
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Groq API Error:", data.error);
      
      // Basic fallback logic for rate limits
      if (data.error?.message?.includes('Rate limit') || data.error?.code === 'rate_limit_exceeded') {
        if (process.env.GROQ_API_KEY_BACKUP && process.env.GROQ_KEY_EXHAUSTED !== 'true') {
          console.log("Groq quota exceeded. Switching to backup key...");
          process.env.GROQ_KEY_EXHAUSTED = 'true';
          // Try one more time with backup key
          return await readMeterFromImageGroq(imageUrl);
        }
      }
      return null;
    }

    const text = data.choices?.[0]?.message?.content || '';
    console.log("Groq trả về nguyên bản:", text);
    
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const match = cleanText.match(/\{[\s\S]*\}/);
    if (match) {
        return JSON.parse(match[0]);
    }
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("Lỗi khi đọc ảnh bằng Groq:", error);
    return null;
  }
}

export async function readCCCDFromImageGroq(imageBase64: string, mimeType: string, imageUrl?: string) {
  try {
    console.log("Đang gọi Groq API (OCR CCCD)...");
    const apiKey = getGroqKey();
    if (!apiKey) {
      throw new Error("Thiếu GROQ_API_KEY");
    }

    const now = Date.now();
    const timeSinceLast = now - lastCallTime;
    if (timeSinceLast < 2100) {
      await new Promise(r => setTimeout(r, 2100 - timeSinceLast));
    }
    lastCallTime = Date.now();

    const prompt = `Bạn là hệ thống OCR chuyên đọc Căn cước công dân (CCCD) Việt Nam.
Hãy đọc thông tin từ ảnh CCCD này và trả về JSON với các trường sau:
{
  "number": "Số CCCD (12 chữ số)",
  "full_name": "Họ và tên (viết HOA)",
  "dob": "Ngày sinh (dd/mm/yyyy)",
  "gender": "Nam hoặc Nữ",
  "nationality": "Quốc tịch",
  "place_of_origin": "Quê quán",
  "place_of_residence": "Nơi thường trú",
  "expiry_date": "Có giá trị đến (dd/mm/yyyy)",
  "issued_date": "Ngày cấp nếu có (dd/mm/yyyy)"
}

Nếu không đọc được trường nào thì để chuỗi rỗng "".
CHỈ TRẢ VỀ JSON, KHÔNG trả về gì khác.`;

    let imageContent: any;
    if (imageUrl) {
        imageContent = { url: imageUrl };
    } else {
        const mime = mimeType || 'image/jpeg';
        imageContent = { url: `data:${mime};base64,${imageBase64}` };
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: imageContent }
            ]
          }
        ],
        temperature: 0.1
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Groq API Error:", data.error);
      if (data.error?.message?.includes('Rate limit') || data.error?.code === 'rate_limit_exceeded') {
        if (process.env.GROQ_API_KEY_BACKUP && process.env.GROQ_KEY_EXHAUSTED !== 'true') {
          process.env.GROQ_KEY_EXHAUSTED = 'true';
          return await readCCCDFromImageGroq(imageBase64, mimeType, imageUrl);
        }
      }
      throw new Error(data.error?.message || 'Groq API Error');
    }

    const text = data.choices?.[0]?.message?.content || '';
    console.log('[OCR CCCD] Groq raw:', text);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Không đọc được thông tin từ ảnh');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Lỗi khi đọc CCCD bằng Groq:", error);
    throw error;
  }
}
