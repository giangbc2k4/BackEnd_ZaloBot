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
