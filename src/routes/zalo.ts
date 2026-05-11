import { Router } from 'express'
import { checkGeminiKey } from '../services/ai/gemini.js'
import { checkGroqKey, readMeterFromImageGroq } from '../services/ai/groq.js'
import { sendMessage } from '../services/zalo/api.js'
import { getState, setState } from '../services/state.js'
import { getTenantProfileByChatId, findTenantByPhone, linkChatIdToProfile, upsertMeterReading, getMeterReading, getInvoiceForZalo } from '../services/db.js'
import { supabase } from '../config/supabase.js'

const router = Router()

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0)

const sendMessageStrict = async (chatId: string, text: string, token: string) => {
  const response = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  const data = await response.json() as any
  if (!response.ok || !data.ok) {
    throw new Error(data?.description || data?.error || 'Zalo API không chấp nhận tin nhắn')
  }
}

const buildInvoiceMessage = (invoice: any) => {
  const tenant = invoice.contracts?.tenant_records
  const room = invoice.rooms
  const house = room?.houses
  const remaining = Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0)
  const dueDate = new Date(invoice.created_at)
  dueDate.setDate(dueDate.getDate() + 5)

  const lineItems = Array.isArray(invoice.line_items) && invoice.line_items.length
    ? invoice.line_items
    : [
        { name: 'Tiền phòng', total: Number(invoice.rent_amount || 0) },
        { name: 'Tiền điện', total: Number(invoice.electric_amount || 0) },
        { name: 'Tiền nước', total: Number(invoice.water_amount || 0) },
        { name: 'Dịch vụ', total: Number(invoice.other_amount || 0) },
      ].filter((item) => item.total > 0)

  const detailLines = lineItems
    .map((item: any, index: number) => `${index + 1}. ${item.name}: ${formatCurrency(Number(item.total || 0))}`)
    .join('\n')

  const invoiceUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/invoices/${invoice.id}`

  return [
    `Xin chào ${tenant?.full_name || 'anh/chị'},`,
    '',
    `Hóa đơn phòng ${room?.name || ''} - ${house?.name || 'Khu trọ'}`,
    `Kỳ cước: Tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`,
    `Mã HĐ: #${String(invoice.id).slice(0, 8).toUpperCase()}`,
    '',
    detailLines,
    '',
    `Tổng tiền: ${formatCurrency(Number(invoice.total_amount || 0))}`,
    `Đã thanh toán: ${formatCurrency(Number(invoice.paid_amount || 0))}`,
    `Còn lại: ${formatCurrency(remaining)}`,
    `Hạn thanh toán: ${dueDate.toLocaleDateString('vi-VN')}`,
    '',
    `Xem chi tiết: ${invoiceUrl}`,
    house?.phone ? `Liên hệ chủ nhà: ${house.phone}` : '',
  ].filter(Boolean).join('\n')
}

router.post('/invoices/:id/send', async (req, res) => {
  try {
    const token = process.env.ZALO_OA_TOKEN
    if (!token) {
      return res.status(500).json({ error: 'Thiếu ZALO_OA_TOKEN' })
    }

    const authHeader = req.headers.authorization || ''
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!accessToken) {
      return res.status(401).json({ error: 'Thiếu phiên đăng nhập' })
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
    if (userError || !userData.user) {
      return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ' })
    }

    const invoice = await getInvoiceForZalo(req.params.id, userData.user.id)
    if (!invoice) {
      return res.status(404).json({ error: 'Không tìm thấy hóa đơn' })
    }

    const chatId = invoice.contracts?.tenant_records?.chat_id
    if (!chatId) {
      return res.status(400).json({ error: 'Khách thuê chưa liên kết Zalo' })
    }

    await sendMessageStrict(chatId, buildInvoiceMessage(invoice), token)
    return res.json({ success: true })
  } catch (error: any) {
    console.error('Lỗi gửi hóa đơn qua Zalo:', error)
    return res.status(500).json({ error: error.message || 'Không thể gửi hóa đơn qua Zalo' })
  }
})

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
        await sendMessage(chatId,
          `✅ Nước: ${result.chi_so} m³\n\n` +
          `📨 Bot đã gửi ảnh và chỉ số điện/nước lên hệ thống.\n` +
          `Chủ nhà sẽ kiểm tra và chốt số trước khi tạo hóa đơn.`,
          botToken
        )
        await setState(chatId, 'IDLE')
        return
      }

      // ── TEST MODE: mọi ảnh từ tenant đã liên kết đều đẩy lên web ──
      await sendMessage(chatId, "⏳ Đang phân tích ảnh bằng AI...", botToken)
      const result = await readMeterFromImageGroq(imageUrl)
      if (!result || !result.chi_so) {
        await sendMessage(chatId, "❌ Không đọc được số từ ảnh này.", botToken)
        return
      }

      const currentReading = await getMeterReading(room.id, month, year)
      const hasElectricImage = Boolean(currentReading?.image_electric_url)
      const hasWaterImage = Boolean(currentReading?.image_water_url)
      const shouldSaveAsElectric = !hasElectricImage || hasWaterImage

      if (shouldSaveAsElectric) {
        await upsertMeterReading({ roomId: room.id, month, year, electricNew: result.chi_so, imageElectricUrl: imageUrl })
        await setState(chatId, 'WAIT_WATER')
        await sendMessage(chatId,
          `✅ Đã gửi ảnh ĐIỆN và chỉ số ${result.chi_so} kWh lên hệ thống để chủ nhà xác nhận.\n\n` +
          `📸 Gửi tiếp ảnh đồng hồ NƯỚC nếu muốn test đủ bộ.`,
          botToken
        )
        return
      }

      await upsertMeterReading({ roomId: room.id, month, year, waterNew: result.chi_so, imageWaterUrl: imageUrl })
      await setState(chatId, 'IDLE')
      await sendMessage(chatId,
        `✅ Đã gửi ảnh NƯỚC và chỉ số ${result.chi_so} m³ lên hệ thống để chủ nhà xác nhận.`,
        botToken
      )
    }
  } catch (error) {
    console.error("Lỗi webhook:", error)
  }
})

router.get('/webhook', (_req, res) => {
  res.send('Zalo Webhook is active.')
})

export default router
