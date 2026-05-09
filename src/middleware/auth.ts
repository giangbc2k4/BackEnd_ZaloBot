import type { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../config/supabase.js'

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      userId?: string
      userRole?: 'owner' | 'tenant'
    }
  }
}

/**
 * Middleware: Verify Supabase JWT token from Authorization header.
 * Extracts userId and userRole, attaches to req.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token không hợp lệ. Vui lòng đăng nhập.' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn.' })
      return
    }

    req.userId = user.id
    req.userRole = (user.user_metadata?.role as 'owner' | 'tenant') || 'tenant'
    next()
  } catch {
    res.status(500).json({ error: 'Lỗi xác thực.' })
  }
}

/**
 * Middleware: Only allow users with 'owner' role.
 * Must be used AFTER requireAuth.
 */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.userRole !== 'owner') {
    res.status(403).json({ error: 'Chỉ chủ nhà trọ mới được thực hiện thao tác này.' })
    return
  }
  next()
}
