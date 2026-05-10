import { Router } from 'express'
import { callGeminiSafe } from '../services/ai/gemini.js'

const router = Router()

/**
 * POST /api/ocr/cccd
 * Body: { imageUrl: string } hoặc { imageBase64: string }
 * Trả về: { success, data: { number, full_name, dob, gender, nationality, place_of_origin, place_of_residence, expiry_date, issued_date } }
 */
router.post('/cccd', async (req, res) => {
  try {
    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) {
      return res.status(500).json({ success: false, error: 'Thiếu GEMINI_API_KEY' })
    }

    const { imageBase64, mimeType } = req.body
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'Thiếu imageBase64' })
    }

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
CHỈ TRẢ VỀ JSON, KHÔNG trả về gì khác.`

    const response = await callGeminiSafe(prompt, mimeType || 'image/jpeg', imageBase64)
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || ''
    console.log('[OCR CCCD] Gemini raw:', text)

    // Parse JSON từ response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return res.json({ success: false, error: 'Không đọc được thông tin từ ảnh' })
    }

    const data = JSON.parse(jsonMatch[0])
    return res.json({ success: true, data })
  } catch (error: any) {
    console.error('[OCR CCCD] Error:', error)
    return res.status(500).json({ success: false, error: error.message || 'Lỗi xử lý ảnh' })
  }
})

export default router
