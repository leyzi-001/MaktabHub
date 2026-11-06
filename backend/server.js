import { createClient } from '@supabase/supabase-js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

dotenv.config()
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase sozlamalari topilmadi')
}

const supabase = createClient(supabaseUrl, supabaseKey)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const dbPath = path.join(dataDir, 'db.json')
const app = express()
const PORT = Number(process.env.PORT || 4000)
const JWT_SECRET = process.env.JWT_SECRET || 'local-development-only-change-me'
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

app.use(helmet())
app.use(cors({ origin: allowedOrigin.split(',').map(s => s.trim()), methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }))
app.use(express.json({ limit: '30kb' }))
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }))
app.use('/api/suggestions', rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }))

const initialDB = {
  users: [],
  posts: [
    { id: randomUUID(), category:'lost', title:'Qora ryukzak', description:'Sport zaliga yaqin · Bugun 10:30', location:'Sport zali', status:'Topilgan', createdAt:new Date().toISOString(), userId:'seed' },
    { id: randomUUID(), category:'lost', title:'Kalitlar bog‘lami', description:'Kutubxona oldida · Kecha', location:'Kutubxona', status:'Topilgan', createdAt:new Date().toISOString(), userId:'seed' },
    { id: randomUUID(), category:'clubs', title:'Futbol klubi', description:'Sport maydoni · Dushanba va chorshanba', location:'Sport maydoni', status:'Faol', createdAt:new Date().toISOString(), userId:'seed' },
    { id: randomUUID(), category:'clubs', title:'Dasturlash klubi', description:'Informatika xonasi · Seshanba', location:'Informatika xonasi', status:'Faol', createdAt:new Date().toISOString(), userId:'seed' },
    { id: randomUUID(), category:'books', title:'Ingliz tili grammatikasi', description:'Almashish uchun · 8–9-sinflar', location:'', status:'Kitob', createdAt:new Date().toISOString(), userId:'seed' },
    { id: randomUUID(), category:'books', title:'Sarguzashtlar kitobi', description:'O‘qib bo‘lingan · Yaxshi holatda', location:'', status:'Kitob', createdAt:new Date().toISOString(), userId:'seed' },
    { id: randomUUID(), category:'qa', title:'Present Perfect qachon ishlatiladi?', description:'Ingliz tili · Savol', location:'', status:'Savol', createdAt:new Date().toISOString(), userId:'seed' },
    { id: randomUUID(), category:'qa', title:'Kasrlarni qo‘shish usuli', description:'Matematika · Savol', location:'', status:'Savol', createdAt:new Date().toISOString(), userId:'seed' },
    { id: randomUUID(), category:'places', title:'Kutubxona', description:'Asosiy bino · 2-qavat', location:'Asosiy bino', status:'Joy', createdAt:new Date().toISOString(), userId:'seed' },
    { id: randomUUID(), category:'places', title:'Sport zali', description:'Asosiy bino · 1-qavat', location:'Asosiy bino', status:'Joy', createdAt:new Date().toISOString(), userId:'seed' },
    { id: randomUUID(), category:'places', title:'Laboratoriya', description:'B-blok · 3-qavat', location:'B-blok', status:'Joy', createdAt:new Date().toISOString(), userId:'seed' }
  ],
  suggestions: [],
  joinRequests: []
}
let db = initialDB
async function saveDB() { await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8') }
async function loadDB() {
  await fs.mkdir(dataDir, { recursive: true })
  try { db = JSON.parse(await fs.readFile(dbPath, 'utf8')) }
  catch { db = initialDB; await saveDB() }
}
const cleanUser = user => ({ id:user.id, name:user.name, email:user.email, className:user.className || '' })
function auth(req,res,next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ error:'Bu amal uchun avval tizimga kiring.' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = db.users.find(u => u.id === payload.sub)
    if (!user) return res.status(401).json({ error:'Akkaunt topilmadi. Qayta kiring.' })
    req.user = user; next()
  } catch { return res.status(401).json({ error:'Sessiya yaroqsiz yoki muddati tugagan. Qayta kiring.' }) }
}
const str = (value, max=1000) => typeof value === 'string' ? value.trim().slice(0,max) : ''
app.get('/api/health', (_req,res) => res.json({ ok:true, service:'Maktab Hub API', timestamp:new Date().toISOString() }))
app.post('/api/auth/register', async (req,res) => {
  const name = str(req.body?.name,60), email = str(req.body?.email,160).toLowerCase()
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const className = str(req.body?.className,20)
  if (name.length < 2) return res.status(400).json({ error:'Ism kamida 2 ta belgidan iborat bo‘lsin.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error:'Email manzilni tekshiring.' })
  if (password.length < 8 || password.length > 100) return res.status(400).json({ error:'Parol 8–100 belgi bo‘lishi kerak.' })
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error:'Bu email bilan akkaunt mavjud.' })
  const user = { id:randomUUID(), name, email, className, passwordHash:await bcrypt.hash(password,12), createdAt:new Date().toISOString() }
  db.users.push(user); await saveDB()
  const token = jwt.sign({ sub:user.id }, JWT_SECRET, { expiresIn:'7d' })
  res.status(201).json({ token, user:cleanUser(user) })
})
app.post('/api/auth/login', async (req,res) => {
  const email = str(req.body?.email,160).toLowerCase(), password = typeof req.body?.password === 'string' ? req.body.password : ''
  const user = db.users.find(u => u.email === email)
  if (!user || !(await bcrypt.compare(password,user.passwordHash))) return res.status(401).json({ error:'Email yoki parol noto‘g‘ri.' })
  const token = jwt.sign({ sub:user.id }, JWT_SECRET, { expiresIn:'7d' })
  res.json({ token, user:cleanUser(user) })
})
app.get('/api/auth/me', auth, (req,res) => res.json({ user:cleanUser(req.user) }))
app.get('/api/posts', (req,res) => {
  const category = str(req.query.category,30)
  const allowed = ['lost','clubs','books','qa','places']
  if (category && !allowed.includes(category)) return res.status(400).json({ error:'Noma’lum bo‘lim.' })
  const posts = db.posts.filter(p => !category || p.category === category).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
  res.json({ posts })
})
app.post('/api/posts', auth, async (req,res) => {
  const category = str(req.body?.category,30)
  const title = str(req.body?.title,100), description = str(req.body?.description,1000), location = str(req.body?.location,120)
  if (!['lost','clubs','books','qa'].includes(category)) return res.status(400).json({ error:'Bu bo‘limga e’lon joylab bo‘lmaydi.' })
  if (title.length < 2 || description.length < 3) return res.status(400).json({ error:'Sarlavha va batafsil ma’lumotni kiriting.' })
  const post = { id:randomUUID(), category, title, description, location, status:category==='lost'?'Yangi':category==='clubs'?'Faol':category==='books'?'Kitob':'Savol', createdAt:new Date().toISOString(), userId:req.user.id }
  db.posts.push(post); await saveDB()
  res.status(201).json({ post })
})
app.get('/api/suggestions', (_req,res) => res.json({ suggestions:db.suggestions.map(({id,message,createdAt})=>({id,message,createdAt})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)) }))
app.post('/api/suggestions', async (req,res) => {
  const message = str(req.body?.message,1200)
  if (message.length < 3) return res.status(400).json({ error:'Taklif kamida 3 ta belgidan iborat bo‘lsin.' })
  const item = { id:randomUUID(), message, createdAt:new Date().toISOString() }
  db.suggestions.push(item); await saveDB()
  res.status(201).json({ ok:true, suggestion:{ id:item.id, message:item.message, createdAt:item.createdAt } })
})
app.post('/api/join-requests', async (req,res) => {
  const name = str(req.body?.name,60), className = str(req.body?.className,20), interest = str(req.body?.interest,120)
  if (name.length < 2 || className.length < 1) return res.status(400).json({ error:'Ism va sinfni kiriting.' })
  const item = { id:randomUUID(), name, className, interest, createdAt:new Date().toISOString() }
  db.joinRequests.push(item); await saveDB()
  res.status(201).json({ ok:true, requestId:item.id })
})
app.use((err,_req,res,_next) => { console.error(err); res.status(500).json({ error:'Serverda kutilmagan xatolik yuz berdi.' }) })
await loadDB()
app.listen(PORT, () => {
  console.log(`Maktab Hub API: http://localhost:${PORT}/api/health`)
  if (JWT_SECRET === 'local-development-only-change-me') console.warn('DIQQAT: JWT_SECRET faqat lokal demo uchun. Deploydan oldin kuchli maxfiy kalit bilan almashtiring.')
})
