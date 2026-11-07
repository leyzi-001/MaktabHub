import { createClient } from '@supabase/supabase-js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { randomUUID } from 'node:crypto'
import { installEmailVerification } from './email-verification.js'

dotenv.config()
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET, FRONTEND_ORIGIN } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET || !FRONTEND_ORIGIN) throw new Error('Required environment variables are missing')
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const app = express()
const PORT = Number(process.env.PORT || 4000)
const origins = FRONTEND_ORIGIN.split(',').map(x => x.trim().replace(/\/$/, ''))
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: origins, methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }))
app.use(express.json({ limit: '30kb' }))
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: "Juda ko'p so'rov. Keyinroq qayta urinib ko'ring." } }))
app.use('/api/suggestions', rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: "Juda ko'p so'rov. Keyinroq qayta urinib ko'ring." } }))
const str = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const dbFail = (res, error) => { console.error('Database error:', error); return res.status(500).json({ error: 'Ma’lumotlar bazasida xatolik.' }) }
const postOut = p => ({ id: p.id, category: p.category, title: p.title, description: p.description || '', location: p.location || '', status: p.status || '', createdAt: p.created_at, userId: p.user_id })
const suggestionOut = s => ({ id: s.id, message: s.message, createdAt: s.created_at })
const { auth } = installEmailVerification(app, supabase, { JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'MaktabHub API' }))
app.get('/api/posts', async (req, res) => {
  const category = str(req.query.category, 30)
  if (category && !['lost','clubs','books','qa','places'].includes(category)) return res.status(400).json({ error: 'Noma’lum bo‘lim.' })
  let query = supabase.from('posts').select('id,category,title,description,location,status,created_at,user_id').order('created_at', { ascending: false }).limit(200)
  if (category) query = query.eq('category', category)
  const { data, error } = await query
  if (error) return dbFail(res, error)
  res.json({ posts: data.map(postOut) })
})
app.post('/api/posts', auth, async (req, res) => {
  const category = str(req.body?.category, 30), title = str(req.body?.title, 100), description = str(req.body?.description, 1000), location = str(req.body?.location, 120)
  if (!['lost','clubs','books','qa'].includes(category)) return res.status(400).json({ error: 'Bu bo‘limga e’lon joylab bo‘lmaydi.' })
  if (title.length < 2 || description.length < 3) return res.status(400).json({ error: 'Sarlavha va batafsil ma’lumotni kiriting.' })
  const status = { lost: 'Yangi', clubs: 'Faol', books: 'Kitob', qa: 'Savol' }[category]
  const { data, error } = await supabase.from('posts').insert({ id: randomUUID(), category, title, description, location, status, user_id: req.user.id }).select('id,category,title,description,location,status,created_at,user_id').single()
  if (error) return dbFail(res, error)
  res.status(201).json({ post: postOut(data) })
})
app.get('/api/suggestions', async (_req, res) => {
  const { data, error } = await supabase.from('suggestions').select('id,message,created_at').order('created_at', { ascending: false }).limit(100)
  if (error) return dbFail(res, error)
  res.json({ suggestions: data.map(suggestionOut) })
})
app.post('/api/suggestions', async (req, res) => {
  const message = str(req.body?.message, 1200)
  if (message.length < 3) return res.status(400).json({ error: 'Taklif kamida 3 ta belgidan iborat bo‘lsin.' })
  const { data, error } = await supabase.from('suggestions').insert({ id: randomUUID(), message }).select('id,message,created_at').single()
  if (error) return dbFail(res, error)
  res.status(201).json({ ok: true, suggestion: suggestionOut(data) })
})
app.post('/api/join-requests', async (req, res) => {
  const name = str(req.body?.name, 60), className = str(req.body?.className, 20), interest = str(req.body?.interest, 120)
  if (name.length < 2 || !className) return res.status(400).json({ error: 'Ism va sinfni kiriting.' })
  const { data, error } = await supabase.from('join_requests').insert({ id: randomUUID(), name, class_name: className, interest }).select('id').single()
  if (error) return dbFail(res, error)
  res.status(201).json({ ok: true, requestId: data.id })
})
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Serverda kutilmagan xatolik yuz berdi.' }) })
if (!process.env.VERCEL) app.listen(PORT, '0.0.0.0', () => console.log(`MaktabHub API listening on port ${PORT}`))

export default app
