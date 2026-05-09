import { Router } from 'express'
import { readMeterFromImage } from '../services/ai/gemini.js'
import { sendMessage, sendPhoto } from '../services/zalo/api.js'
import { getState, setState } from '../services/state.js'
import { getTenantProfileByChatId, upsertMeterReading, calculateInvoice } from '../services/db.js'
import { buildVietQR, formatInvoiceCaption } from '../services/payment/vietqr.js'

const router = Router()

router.post('/webhook', async (req, res) => {
  try {
    // 1. Xác thực Webhook
    const secretToken = req.headers['x-bot-api-secret-token']
    if (process.env.WEBHOOK_SECRET && secretToken !== process.env.WEBHOOK_SECRET) {
      return res.status(403).json({ error: 'Unauthorized' })
    }

    const update = req.body
    
    // Log toàn bộ body để debug
    console.log("📥 Webhook:", JSON.stringify(update, null, 2))

    // Phản hồi HTTP 200 nhanh chóng
    res.json({ ok: true })

    const msg = update.message
    if (!msg || !msg.chat || !msg.chat.id) return

    const chatId = msg.chat.id
    const botToken = process.env.ZALO_OA_TOKEN
    const geminiKey = process.env.GEMINI_API_KEY

    if (!botToken) {
      console.error("Thiếu ZALO_OA_TOKEN")
      return
    }

    // ─── XỬ LÝ GỬI TEXT ─────────────────────────────────
    if (update.event_name === 'message.text.received' || msg.text) {
      const text = (msg.text || '').trim()
      if (!text) return

      // Kiểm tra tenant đã đăng ký chưa
      const tenant = await getTenantProfileByChatId(chatId)

      if (!tenant) {
        // Chưa liên kết phòng → vẫn chào và hướng dẫn gửi ảnh
        await sendMessage(chatId,
          `Xin chào ${msg.from?.display_name || 'bạn'}! 👋\n` +
          `Mình là Bot quản lý nhà trọ.\n\n` +
          `Bạn có thể gửi ảnh đồng hồ điện/nước để test AI đọc số nhé! 📸`,
          botToken
        )
        return
      }

      // Đã đăng ký → xem state
      const state = await getState(chatId)
      await sendMessage(chatId,
        `Chào ${tenant.full_name}! 🏠\n` +
        `Phòng: ${tenant.contracts?.[0]?.rooms?.name || 'N/A'}\n` +
        `Trạng thái: ${state === 'IDLE' ? '✅ Không có giao dịch mở' : `⏳ ${state}`}\n\n` +
        `Gửi ảnh đồng hồ điện/nước để bot xử lý nhé!`,
        botToken
      )
      return
    }

    // ─── XỬ LÝ GỬI ẢNH ─────────────────────────────────
    if (update.event_name === 'message.image.received' && msg.photo_url) {
      if (!geminiKey) {
        await sendMessage(chatId, "⚠️ Bot chưa được cấu hình GEMINI_API_KEY.", botToken)
        return
      }

      const imageUrl = msg.photo_url
      const state = await getState(chatId)

      // Kiểm tra tenant (nếu có DB)
      const tenant = await getTenantProfileByChatId(chatId)
      const contract = tenant?.contracts?.[0]
      const room = contract?.rooms

      // Nếu chưa liên kết phòng → vẫn chạy PoC mode (đọc ảnh trả số)
      if (!tenant || !contract || !room) {
        // PoC Mode: chỉ đọc số và trả về
        await sendMessage(chatId, "⏳ Đang phân tích ảnh bằng AI...", botToken)
        const result = await readMeterFromImage(imageUrl, geminiKey)
        if (result && result.chi_so) {
          await sendMessage(chatId,
            `✅ Đọc được chỉ số: ${result.chi_so}\n\n` +
            `ℹ️ Tài khoản chưa liên kết phòng nên bot chỉ đọc số.\n` +
            `Liên hệ chủ nhà để được gán phòng và dùng đầy đủ tính năng!`,
            botToken
          )
        } else {
          await sendMessage(chatId, "❌ Không thể đọc được số từ ảnh này. Chụp rõ nét hơn nhé!", botToken)
        }
        return
      }

      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()

      // ── STATE: WAIT_ELECTRIC ──
      if (state === 'WAIT_ELECTRIC') {
        await sendMessage(chatId, "⏳ Đang đọc chỉ số đồng hồ ĐIỆN...", botToken)

        const result = await readMeterFromImage(imageUrl, geminiKey)
        if (!result || !result.chi_so) {
          await sendMessage(chatId, "❌ Không đọc được số. Chụp rõ nét hơn rồi gửi lại nhé!", botToken)
          return
        }

        // Lưu vào DB
        await upsertMeterReading({
          roomId: room.id,
          month, year,
          electricNew: result.chi_so,
          imageElectricUrl: imageUrl
        })

        await setState(chatId, 'WAIT_WATER')

        await sendMessage(chatId,
          `✅ Điện: ${result.chi_so} kWh\n\n` +
          `📸 Bây giờ gửi tiếp ảnh đồng hồ NƯỚC nhé!`,
          botToken
        )
        return
      }

      // ── STATE: WAIT_WATER ──
      if (state === 'WAIT_WATER') {
        await sendMessage(chatId, "⏳ Đang đọc chỉ số đồng hồ NƯỚC...", botToken)

        const result = await readMeterFromImage(imageUrl, geminiKey)
        if (!result || !result.chi_so) {
          await sendMessage(chatId, "❌ Không đọc được số. Chụp rõ nét hơn rồi gửi lại nhé!", botToken)
          return
        }

        // Lưu vào DB
        await upsertMeterReading({
          roomId: room.id,
          month, year,
          waterNew: result.chi_so,
          imageWaterUrl: imageUrl
        })

        // Tính hóa đơn
        const invoice = await calculateInvoice(room.id, contract.id, month, year)

        // Tạo QR
        const qrUrl = buildVietQR({
          roomName: room.name,
          month, year,
          totalAmount: invoice.total_amount
        })

        // Gửi caption hóa đơn
        const caption = formatInvoiceCaption({
          roomName: room.name,
          month, year,
          rentAmount: invoice.rent_amount,
          electricAmount: invoice.electric_amount,
          waterAmount: invoice.water_amount,
          totalAmount: invoice.total_amount
        })

        // Gửi QR + caption
        await sendPhoto(chatId, qrUrl, caption, botToken)

        await setState(chatId, 'WAIT_PAYMENT')
        return
      }

      // ── STATE: IDLE hoặc khác ──
      // Nếu ảnh gửi ngoài flow → chỉ đọc số và trả về (PoC mode)
      await sendMessage(chatId, "⏳ Đang phân tích ảnh bằng AI...", botToken)
      const result = await readMeterFromImage(imageUrl, geminiKey)
      if (result && result.chi_so) {
        await sendMessage(chatId,
          `✅ Đọc được chỉ số: ${result.chi_so}\n\n` +
          `ℹ️ Hiện tại bạn chưa trong kỳ thu tiền. Bot sẽ nhắc bạn vào đầu tháng!`,
          botToken
        )
      } else {
        await sendMessage(chatId, "❌ Không thể đọc được số từ ảnh này.", botToken)
      }
    }
  } catch (error) {
    console.error("Lỗi webhook:", error)
  }
})

// Endpoint để Zalo verify webhook
router.get('/webhook', (_req, res) => {
  res.send('Zalo Webhook is active.')
})

export default router
