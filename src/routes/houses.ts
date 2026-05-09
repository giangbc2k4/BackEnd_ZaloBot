import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { requireAuth, requireOwner } from '../middleware/auth.js'

const router = Router()

// GET /api/houses — Lấy danh sách nhà trọ của owner
router.get('/', requireAuth, requireOwner, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('houses')
    .select('*, rooms(count)')
    .eq('owner_id', req.userId!)
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.json(data)
})

// GET /api/houses/:id — Chi tiết 1 nhà trọ
router.get('/:id', requireAuth, requireOwner, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('houses')
    .select('*, rooms(*)')
    .eq('id', req.params.id)
    .eq('owner_id', req.userId!)
    .single()

  if (error) {
    res.status(404).json({ error: 'Không tìm thấy nhà trọ.' })
    return
  }
  res.json(data)
})

// POST /api/houses — Tạo nhà trọ mới
router.post('/', requireAuth, requireOwner, async (req, res) => {
  const { name, address } = req.body

  if (!name) {
    res.status(400).json({ error: 'Tên nhà trọ là bắt buộc.' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('houses')
    .insert({ name, address, owner_id: req.userId })
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.status(201).json(data)
})

// PUT /api/houses/:id — Cập nhật nhà trọ
router.put('/:id', requireAuth, requireOwner, async (req, res) => {
  const { name, address } = req.body

  const { data, error } = await supabaseAdmin
    .from('houses')
    .update({ name, address })
    .eq('id', req.params.id)
    .eq('owner_id', req.userId!)
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.json(data)
})

// DELETE /api/houses/:id — Xóa nhà trọ
router.delete('/:id', requireAuth, requireOwner, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('houses')
    .delete()
    .eq('id', req.params.id)
    .eq('owner_id', req.userId!)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.json({ message: 'Đã xóa nhà trọ.' })
})

export default router
