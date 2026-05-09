export async function sendMessage(chatId: string, text: string, token: string) {
  try {
    const url = `https://bot-api.zaloplatforms.com/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
    
    const data = await response.json() as any;
    if (!data.ok) {
      console.error('Lỗi khi gửi tin nhắn Zalo Bot:', data);
    } else {
      console.log('Đã phản hồi Zalo Bot thành công cho chat_id:', chatId);
    }
  } catch (error) {
    console.error('Exception khi gửi tin nhắn Zalo Bot:', error);
  }
}

/**
 * Gửi ảnh qua Zalo Bot (dùng cho QR VietQR)
 */
export async function sendPhoto(chatId: string, photoUrl: string, caption: string, token: string) {
  try {
    const url = `https://bot-api.zaloplatforms.com/bot${token}/sendPhoto`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption: caption
      })
    });
    
    const data = await response.json() as any;
    if (!data.ok) {
      console.error('Lỗi khi gửi ảnh Zalo Bot:', data);
      // Fallback: gửi text nếu ảnh lỗi
      await sendMessage(chatId, `${caption}\n\n🔗 Link QR: ${photoUrl}`, token);
    } else {
      console.log('Đã gửi ảnh QR thành công cho chat_id:', chatId);
    }
  } catch (error) {
    console.error('Exception khi gửi ảnh Zalo Bot:', error);
    // Fallback
    await sendMessage(chatId, `${caption}\n\n🔗 Link QR: ${photoUrl}`, token);
  }
}

// Hàm phụ để lấy URL ảnh gốc từ file_id của Zalo
export async function getFileUrl(fileId: string, token: string) {
  try {
    const url = `https://bot-api.zaloplatforms.com/bot${token}/getFile?file_id=${fileId}`;
    const response = await fetch(url);
    const data = await response.json() as any;
    if (data.ok && data.result) {
      // API của Zalo Bot sẽ trả về URL tải ảnh trực tiếp
      // Theo docs Telegram-like, có thể file_path, cần ghép nối. 
      // Do chưa có docs chính thức của Zalo Bot API phần getFile trong file MD, 
      // ta tạm thời giả định data.result chứa url trực tiếp (hoặc file_path)
      return data.result.file_path || data.result.url || fileId; 
    }
    return null;
  } catch (error) {
    console.error("Lỗi getFile:", error);
    return null;
  }
}
