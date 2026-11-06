import { createClient } from '@supabase/supabase-js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import { randomUUID } from 'node:crypto'

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
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }))
app.use('/api/suggestions', rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false }))
const str = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const cleanUser = u => ({ id: u.id, name: u.name, email: u.email, className: u.class_name || '' })
const dbFail = (res, error) => { console.error('Database error:', error); return res.status(500).json({ error: 'Ma’lumotlar bazasida xatolik.' }) }
const postOut = p => ({ id: p.id, category: p.category, title: p.title, description: p.description || '', location: p.location || '', status: p.status || '', createdAt: p.created_at, userId: p.user_id })
const suggestionOut = s => ({ id: s.id, message: s.message, createdAt: s.created_at })
async function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'Bu amal uchun avval tizimga kiring.' })
  let payload
  try { payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) }
  catch { return res.status(401).json({ error: 'Sessiya yaroqsiz yoki muddati tugagan. Qayta kiring.' }) }
  const { data, error } = await supabase.from('app_users').select('id,name,email,class_name').eq('id', payload.sub).maybeSingle()
  if (error) return dbFail(res, error)
  if (!data) return res.status(401).json({ error: 'Akkaunt topilmadi. Qayta kiring.' })
  req.user = data
  next()
}
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Maktab Hub API', timestamp: new Date().toISOString() }))
app.post('/api/auth/register', async (req, res) => {
  const name = str(req.body?.name, 60), email = str(req.body?.email, 160).toLowerCase()
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const className = str(req.body?.className, 20)
  if (name.length < 2) return res.status(400).json({ error: 'Ism kamida 2 ta belgidan iborat bo‘lsin.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email manzilni tekshiring.' })
  if (password.length < 8 || password.length > 100) return res.status(400).json({ error: 'Parol 8–100 belgi bo‘lishi kerak.' })
  const { data: existing, error: checkError } = await supabase.from('app_users').select('id').eq('email', email).maybeSingle()
  if (checkError) return dbFail(res, checkError)
  if (existing) return res.status(409).json({ error: 'Bu email bilan akkaunt mavjud.' })
  const user = { id: randomUUID(), name, email, class_name: className, password_hash: await bcrypt.hash(password, 12) }
  const { data, error } = await supabase.from('app_users').insert(user).select('id,name,email,class_name').single()
  if (error?.code === '23505') return res.status(409).json({ error: 'Bu email bilan akkaunt mavjud.' })
  if (error) return dbFail(res, error)
  res.status(201).json({ token: jwt.sign({ sub: data.id }, JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' }), user: cleanUser(data) })
})
app.post('/api/auth/login', async (req, res) => {
  const email = str(req.body?.email, 160).toLowerCase(), password = typeof req.body?.password === 'string' ? req.body.password : ''
  const { data: user, error } = await supabase.from('app_users').select('*').eq('email', email).maybeSingle()
  if (error) return dbFail(res, error)
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email yoki parol noto‘g‘ri.' })
  res.json({ token: jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' }), user: cleanUser(user) })
})
app.get('/api/auth/me', auth, (req, res) => res.json({ user: cleanUser(req.user) }))
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
app.listen(PORT, '0.0.0.0', () => console.log(`MaktabHub API listening on port ${PORT}`))
