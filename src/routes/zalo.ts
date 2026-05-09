import { Router } from 'express'
import { readMeterFromImage } from '../services/ai/gemini.js'
import { sendMessage, getFileUrl } from '../services/zalo/api.js'

const router = Router()

// PoC: Webhook Zalo Bot đơn giản
router.post('/webhook', async (req, res) => {
  try {
    // 1. Xác thực Webhook
    const secretToken = req.headers['x-bot-api-secret-token']
    if (process.env.WEBHOOK_SECRET && secretToken !== process.env.WEBHOOK_SECRET) {
      return res.status(403).json({ error: 'Unauthorized' })
    }

    const update = req.body
    
    // Log toàn bộ body để debug
    console.log("📥 Nhận được Webhook từ Zalo:", JSON.stringify(update, null, 2))

    // Zalo yêu cầu phản hồi HTTP 200 nhanh chóng
    res.json({ ok: true })

    const msg = update.message
    if (!msg || !msg.chat || !msg.chat.id) return

    const chatId = msg.chat.id
    const botToken = process.env.ZALO_OA_TOKEN // Biến env giữ nguyên tên, nhưng chứa token bot
    const geminiKey = process.env.GEMINI_API_KEY

    if (!botToken) {
      console.error("Thiếu ZALO_OA_TOKEN trong file cấu hình")
      return
    }

    // Xử lý khi user gửi text (dành cho bot chào hỏi)
    if (msg.text) {
      const text = msg.text.toLowerCase().trim()
      await sendMessage(chatId, `Chào bạn, bạn vừa gửi: "${text}". Hãy gửi cho tôi ảnh đồng hồ điện/nước để test nhé!`, botToken)
    }

    // Xử lý khi user gửi ảnh
    if (msg.photo && msg.photo.length > 0) {
      if (!geminiKey) {
        await sendMessage(chatId, "⚠️ Bot chưa được cấu hình GEMINI_API_KEY nên không thể phân tích ảnh AI. Hãy thêm API Key để tiếp tục test nhé!", botToken)
        return
      }

      // Lấy ảnh lớn nhất (phần tử cuối)
      const fileId = msg.photo[msg.photo.length - 1].file_id
      
      // Lấy URL thực tế của ảnh
      const imageUrl = await getFileUrl(fileId, botToken)
      
      if (!imageUrl) {
        await sendMessage(chatId, "❌ Không thể tải được ảnh từ hệ thống Zalo. Vui lòng thử lại.", botToken)
        return
      }

      // Phản hồi tạm thời để user biết bot đang xử lý
      await sendMessage(chatId, "⏳ Đang phân tích ảnh đồng hồ bằng AI, vui lòng đợi...", botToken)
      
      // Gọi Gemini
      const result = await readMeterFromImage(imageUrl, geminiKey)
      
      if (result && result.chi_so) {
        await sendMessage(chatId, `✅ Đã đọc thành công!\nChỉ số trên đồng hồ là: ${result.chi_so}`, botToken)
      } else {
        await sendMessage(chatId, `❌ Không thể đọc được số từ ảnh này. Vui lòng chụp rõ nét hơn.`, botToken)
      }
    }
  } catch (error) {
    console.error("Lỗi webhook:", error)
  }
})

// Endpoint để Zalo verify webhook (khi add webhook vào Zalo app)
router.get('/webhook', (req, res) => {
  res.send('Zalo Webhook is active.')
})

export default router
