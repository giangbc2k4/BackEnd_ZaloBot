import { Router } from 'express'
import { readCCCDFromImageGroq } from '../services/ai/groq.js'

const router = Router()

/**
 * POST /api/ocr/cccd
 * Body: { imageUrl: string } hoặc { imageBase64: string }
 * Trả về: { success, data: { number, full_name, dob, gender, nationality, place_of_origin, place_of_residence, expiry_date, issued_date } }
 */
router.post('/cccd', async (req, res) => {
  try {
    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) {
      return res.status(500).json({ success: false, error: 'Thiếu GROQ_API_KEY' })
    }

    const { imageUrl } = req.body
    if (!imageUrl) {
      return res.status(400).json({ success: false, error: 'Thiếu imageUrl' })
    }

    const data = await readCCCDFromImageGroq(imageUrl)
    return res.json({ success: true, data })
  } catch (error: any) {
    console.error('[OCR CCCD] Error:', error)
    return res.status(500).json({ success: false, error: error.message || 'Lỗi xử lý ảnh' })
  }
})

export default router
