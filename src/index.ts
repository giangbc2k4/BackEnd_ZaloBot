import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import zaloRouter from './routes/zalo.js'
import { startReminderJob } from './cron/reminderJob.js'

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'NhaTroSmart API',
    timestamp: new Date().toISOString(),
  })
})

// Routes
app.use('/zalo', zaloRouter)

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route không tồn tại.' })
})

// Start
app.listen(PORT, () => {
  console.log(`🚀 NhaTroSmart API running at http://localhost:${PORT}`)
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`)

  // Khởi động cron job nhắc tiền hàng tháng
  startReminderJob()
})
