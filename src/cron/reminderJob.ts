import cron from 'node-cron'
import { supabase } from '../config/supabase.js'
import { sendMessage } from '../services/zalo/api.js'
import { setState } from '../services/state.js'

/**
 * Cron Job — Nhắc tiền tự động vào 8h sáng ngày 1 hàng tháng
 * Schedule: '0 8 1 * *'
 */
export function startReminderJob() {
  const botToken = process.env.ZALO_OA_TOKEN
  const ownerChatId = process.env.OWNER_CHAT_ID

  cron.schedule('0 8 1 * *', async () => {
    console.log('⏰ [Cron] Bắt đầu gửi nhắc tiền hàng tháng...')

    if (!botToken) {
      console.error('[Cron] Thiếu ZALO_OA_TOKEN, không thể gửi tin nhắn.')
      return
    }

    try {
      // Lấy danh sách tenant đang có hợp đồng active + có chat_id
      const { data: tenants, error } = await supabase
        .from('contracts')
        .select('*, rooms(name), tenant_records!inner(full_name, chat_id)')
        .eq('status', 'active')
        .not('tenant_records.chat_id', 'is', null)

      if (error) {
        console.error('[Cron] Lỗi truy vấn DB:', error)
        return
      }

      if (!tenants || tenants.length === 0) {
        console.log('[Cron] Không có người thuê nào để nhắc.')
        return
      }

      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const currentYear = now.getFullYear()
      let sentCount = 0

      for (const tenant of tenants) {
        const chatId = (tenant as any).tenant_records?.chat_id
        const roomName = (tenant as any).rooms?.name || 'N/A'
        const tenantName = (tenant as any).tenant_records?.full_name || 'Bạn'

        if (!chatId) continue

        try {
          // Gửi tin nhắn nhắc tiền
          await sendMessage(chatId,
            `📋 Tháng ${currentMonth}/${currentYear} đến rồi!\n\n` +
            `Chào ${tenantName}, phòng ${roomName}.\n` +
            `Vui lòng gửi ảnh đồng hồ ĐIỆN trước nhé!\n` +
            `Hạn đóng tiền: ngày 05/${String(currentMonth).padStart(2, '0')}`,
            botToken
          )

          // Đổi state sang chờ ảnh điện
          await setState(chatId, 'WAIT_ELECTRIC')
          sentCount++
        } catch (err) {
          console.error(`[Cron] Lỗi gửi nhắc cho ${chatId}:`, err)
        }
      }

      console.log(`✅ [Cron] Đã gửi nhắc tiền cho ${sentCount}/${tenants.length} phòng.`)

      // Báo cáo tổng hợp cho chủ nhà
      if (ownerChatId) {
        await sendMessage(ownerChatId,
          `📊 [Báo cáo tự động]\n` +
          `Đã gửi nhắc tiền ${sentCount} phòng tháng ${currentMonth}/${currentYear}.\n` +
          `Nhắn "tình trạng" để xem danh sách chi tiết.`,
          botToken
        )
      }
    } catch (err) {
      console.error('[Cron] Lỗi nghiêm trọng:', err)
    }
  })

  console.log('📅 Cron Job nhắc tiền đã được kích hoạt (8h sáng ngày 1 hàng tháng)')
}
