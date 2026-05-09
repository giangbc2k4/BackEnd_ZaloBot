import { Router } from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { requireAuth, requireOwner } from '../middleware/auth.js'

const router = Router()

// GET /api/rooms?house_id=xxx — Lấy phòng theo nhà trọ
router.get('/', requireAuth, requireOwner, async (req, res) => {
  const houseId = req.query.house_id as string

  if (!houseId) {
    res.status(400).json({ error: 'house_id là bắt buộc.' })
    return
  }

  // Verify house belongs to owner
  const { data: house } = await supabaseAdmin
    .from('houses')
    .select('id')
    .eq('id', houseId)
    .eq('owner_id', req.userId!)
    .single()

  if (!house) {
    res.status(403).json({ error: 'Bạn không có quyền xem nhà trọ này.' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('rooms')
    .select('*, contracts(tenant:profiles(id, full_name, phone))')
    .eq('house_id', houseId)
    .order('name')

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.json(data)
})

// POST /api/rooms — Tạo phòng mới
router.post('/', requireAuth, requireOwner, async (req, res) => {
  const { house_id, name, price } = req.body

  if (!house_id || !name) {
    res.status(400).json({ error: 'house_id và tên phòng là bắt buộc.' })
    return
  }

  // Verify house belongs to owner
  const { data: house } = await supabaseAdmin
    .from('houses')
    .select('id')
    .eq('id', house_id)
    .eq('owner_id', req.userId!)
    .single()

  if (!house) {
    res.status(403).json({ error: 'Bạn không có quyền thêm phòng cho nhà trọ này.' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('rooms')
    .insert({ house_id, name, price: price || 0, status: 'vacant' })
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.status(201).json(data)
})

// PUT /api/rooms/:id — Cập nhật phòng
router.put('/:id', requireAuth, requireOwner, async (req, res) => {
  const { name, price, status } = req.body

  // Get room + verify ownership
  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('house_id, houses!inner(owner_id)')
    .eq('id', req.params.id)
    .single()

  if (!room || (room as any).houses?.owner_id !== req.userId) {
    res.status(403).json({ error: 'Không có quyền.' })
    return
  }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (price !== undefined) updates.price = price
  if (status !== undefined) updates.status = status

  const { data, error } = await supabaseAdmin
    .from('rooms')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.json(data)
})

// DELETE /api/rooms/:id — Xóa phòng
router.delete('/:id', requireAuth, requireOwner, async (req, res) => {
  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('house_id, houses!inner(owner_id)')
    .eq('id', req.params.id)
    .single()

  if (!room || (room as any).houses?.owner_id !== req.userId) {
    res.status(403).json({ error: 'Không có quyền.' })
    return
  }

  const { error } = await supabaseAdmin
    .from('rooms')
    .delete()
    .eq('id', req.params.id)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.json({ message: 'Đã xóa phòng.' })
})

export default router
