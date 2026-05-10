import { Router } from 'express'
import { checkGeminiKey } from '../services/ai/gemini.js'
import { checkGroqKey, readMeterFromImageGroq } from '../services/ai/groq.js'
import { sendMessage, sendPhoto } from '../services/zalo/api.js'
import { getState, setState } from '../services/state.js'
import { getTenantProfileByChatId, findTenantByPhone, linkChatIdToProfile, upsertMeterReading, calculateInvoice } from '../services/db.js'
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
    console.log("📥 Webhook:", JSON.stringify(update, null, 2))
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

      // Lệnh kiểm tra API Key: /checkapi AIzaSy... hoặc /checkapi gsk_...
      if (text.startsWith('/checkapi ')) {
        const testKey = text.replace('/checkapi ', '').trim()
        if (testKey.length < 20) {
          await sendMessage(chatId, "❌ Key không hợp lệ.", botToken)
          return
        }
        await sendMessage(chatId, "⏳ Đang kiểm tra cấu hình API Key...", botToken)
        
        let resultMsg = ''
        if (testKey.startsWith('gsk_')) {
          resultMsg = await checkGroqKey(testKey)
        } else {
          resultMsg = await checkGeminiKey(testKey)
        }
        
        await sendMessage(chatId, resultMsg, botToken)
        return
      }

      const state = await getState(chatId)

      // ── STATE: WAIT_PHONE (đang chờ nhập SĐT để liên kết) ──
      if (state === 'WAIT_PHONE') {
        // Kiểm tra xem text có phải SĐT không (bắt đầu bằng 0, có 10-11 số)
        const phoneRegex = /^(0|\+84)\d{9,10}$/
        const cleanText = text.replace(/[\s\.\-]/g, '')

        if (!phoneRegex.test(cleanText)) {
          await sendMessage(chatId,
            `❌ "${text}" không phải số điện thoại hợp lệ.\n\n` +
            `Vui lòng nhập SĐT đúng định dạng (VD: 0901234567):`,
            botToken
          )
          return
        }

        // Tìm trong DB theo SĐT
        const tenant = await findTenantByPhone(cleanText)
        if (!tenant) {
          await sendMessage(chatId,
            `❌ Không tìm thấy SĐT "${cleanText}" trong hệ thống.\n\n` +
            `Có thể chủ nhà chưa thêm bạn vào. Hãy liên hệ chủ nhà nhé!\n` +
            `Hoặc nhập lại SĐT khác:`,
            botToken
          )
          return
        }

        // Tìm thấy → liên kết chat_id
        const roomName = tenant.contracts?.[0]?.rooms?.name || 'N/A'
        const linked = await linkChatIdToProfile(tenant.id, chatId)

        if (linked) {
          await setState(chatId, 'IDLE')
          await sendMessage(chatId,
            `✅ Liên kết thành công!\n\n` +
            `👤 Tên: ${tenant.full_name}\n` +
            `📱 SĐT: ${tenant.phone}\n` +
            `🏠 Phòng: ${roomName}\n\n` +
            `Từ giờ bot sẽ tự động nhắc bạn gửi ảnh đồng hồ vào đầu mỗi tháng.\n` +
            `Bạn cũng có thể gửi ảnh bất cứ lúc nào để đọc chỉ số! 📸`,
            botToken
          )
        } else {
          await sendMessage(chatId, "❌ Lỗi hệ thống khi liên kết. Vui lòng thử lại sau.", botToken)
        }
        return
      }

      // ── Đã liên kết → xem thông tin ──
      const tenant = await getTenantProfileByChatId(chatId)

      if (!tenant) {
        // Chưa liên kết → hỏi SĐT
        await setState(chatId, 'WAIT_PHONE')
        await sendMessage(chatId,
          `Xin chào ${msg.from?.display_name || 'bạn'}! 👋\n` +
          `Mình là Bot quản lý nhà trọ.\n\n` +
          `Để liên kết tài khoản, vui lòng nhập số điện thoại mà bạn đã đăng ký với chủ nhà:`,
          botToken
        )
        return
      }

      // Đã đăng ký → xem state & thông tin
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
      if (!process.env.GROQ_API_KEY) {
        await sendMessage(chatId, "⚠️ Bot chưa được cấu hình GROQ_API_KEY.", botToken)
        return
      }

      const imageUrl = msg.photo_url
      const state = await getState(chatId)

      // Kiểm tra tenant
      const tenant = await getTenantProfileByChatId(chatId)
      const contract = tenant?.contracts?.[0]
      const room = contract?.rooms

      // Nếu chưa liên kết → PoC mode
      if (!tenant || !contract || !room) {
        await sendMessage(chatId, "⏳ Đang phân tích ảnh bằng AI...", botToken)
        const result = await readMeterFromImageGroq(imageUrl)
        if (result && result.chi_so) {
          await sendMessage(chatId,
            `✅ Đọc được chỉ số: ${result.chi_so}\n\n` +
            `ℹ️ Tài khoản chưa liên kết phòng.\n` +
            `Nhắn tin bất kỳ để bắt đầu liên kết bằng SĐT!`,
            botToken
          )
        } else {
          await sendMessage(chatId, "❌ Không đọc được số. Chụp rõ nét hơn nhé!", botToken)
        }
        return
      }

      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()

      // ── STATE: WAIT_ELECTRIC ──
      if (state === 'WAIT_ELECTRIC') {
        await sendMessage(chatId, "⏳ Đang đọc chỉ số đồng hồ ĐIỆN...", botToken)
        const result = await readMeterFromImageGroq(imageUrl)
        if (!result || !result.chi_so) {
          await sendMessage(chatId, "❌ Không đọc được số. Chụp rõ nét hơn rồi gửi lại nhé!", botToken)
          return
        }

        await upsertMeterReading({ roomId: room.id, month, year, electricNew: result.chi_so, imageElectricUrl: imageUrl })
        await setState(chatId, 'WAIT_WATER')
        await sendMessage(chatId,
          `✅ Điện: ${result.chi_so} kWh\n\n📸 Bây giờ gửi tiếp ảnh đồng hồ NƯỚC nhé!`,
          botToken
        )
        return
      }

      // ── STATE: WAIT_WATER ──
      if (state === 'WAIT_WATER') {
        await sendMessage(chatId, "⏳ Đang đọc chỉ số đồng hồ NƯỚC...", botToken)
        const result = await readMeterFromImageGroq(imageUrl)
        if (!result || !result.chi_so) {
          await sendMessage(chatId, "❌ Không đọc được số. Chụp rõ nét hơn rồi gửi lại nhé!", botToken)
          return
        }

        await upsertMeterReading({ roomId: room.id, month, year, waterNew: result.chi_so, imageWaterUrl: imageUrl })
        const invoice = await calculateInvoice(room.id, contract.id, month, year)

        const qrUrl = buildVietQR({ roomName: room.name, month, year, totalAmount: invoice.total_amount })
        const caption = formatInvoiceCaption({
          roomName: room.name, month, year,
          rentAmount: invoice.rent_amount,
          electricAmount: invoice.electric_amount,
          waterAmount: invoice.water_amount,
          totalAmount: invoice.total_amount
        })

        await sendPhoto(chatId, qrUrl, caption, botToken)
        await setState(chatId, 'WAIT_PAYMENT')
        return
      }

      // ── STATE: IDLE → đọc số thôi ──
      await sendMessage(chatId, "⏳ Đang phân tích ảnh bằng AI...", botToken)
      const result = await readMeterFromImageGroq(imageUrl)
      if (result && result.chi_so) {
        await sendMessage(chatId,
          `✅ Đọc được chỉ số: ${result.chi_so}\n\nℹ️ Bot sẽ nhắc bạn vào đầu tháng để ghi nhận chính thức!`,
          botToken
        )
      } else {
        await sendMessage(chatId, "❌ Không đọc được số từ ảnh này.", botToken)
      }
    }
  } catch (error) {
    console.error("Lỗi webhook:", error)
  }
})

router.get('/webhook', (_req, res) => {
  res.send('Zalo Webhook is active.')
})

export default router
