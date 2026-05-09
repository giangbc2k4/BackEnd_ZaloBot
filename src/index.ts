import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import housesRouter from './routes/houses.js'
import roomsRouter from './routes/rooms.js'
import zaloRouter from './routes/zalo.js'

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
app.use('/api/houses', housesRouter)
app.use('/api/rooms', roomsRouter)
app.use('/zalo', zaloRouter)

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route không tồn tại.' })
})

// Start
app.listen(PORT, () => {
  console.log(`🚀 NhaTroSmart API running at http://localhost:${PORT}`)
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`)
})
