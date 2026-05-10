export async function readMeterFromImage(imageUrl: string, apiKey: string) {
  try {
    // 1. Tải ảnh từ URL
    console.log("Đang tải ảnh từ Zalo...", imageUrl);
    const imageResponse = await fetch(imageUrl);
    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

    // 2. Gọi Gemini API
    console.log("Đang gọi Gemini API...");
    // Sử dụng model có sẵn theo ListModels
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Đây là ảnh đồng hồ điện/nước. Đọc chỉ số trên mặt đồng hồ và trả về định dạng JSON duy nhất, ví dụ: {"chi_so": 12345}. Không giải thích gì thêm, chỉ trả về chuỗi JSON.' },
            { inline_data: { mime_type: mimeType, data: base64Image } }
          ]
        }],
        generationConfig: {
          temperature: 0.1
        }
      })
    });

    const data = await response.json() as any;
    
    if (data.error) {
      console.error("Gemini API Error:", data.error);
      return null;
    }

    const text = data.candidates[0].content.parts[0].text;
    console.log("Gemini trả về nguyên bản:", text);
    
    // Clean up markdown code block if any (e.g. ```json ... ```)
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("Lỗi khi đọc ảnh bằng Gemini:", error);
    return null;
  }
}
