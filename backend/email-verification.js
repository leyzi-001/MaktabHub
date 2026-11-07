import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createHmac, randomUUID } from 'node:crypto'

export function installEmailVerification(app, db, config) {
  const secret = config.JWT_SECRET
  if (secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters')
  const client = config.createAuthClient || (() => createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }))
  const publicUser = u => ({ id: u.id, name: u.name, email: u.email, className: u.class_name || '', emailVerified: true })
  const sign = (claims, expiresIn) => jwt.sign(claims, secret, { algorithm: 'HS256', expiresIn, audience: 'maktabhub' })
  const session = u => ({ token: sign({ sub: u.id, purpose: 'session', verified: true }, '7d'), user: publicUser(u) })
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
  const read = (token, purpose) => {
    const claims = jwt.verify(token, secret, { algorithms: ['HS256'], audience: 'maktabhub' })
    if (claims.purpose !== purpose || typeof claims.sub !== 'string') throw new Error('Invalid token')
    return claims
  }
  async function consume(key, seconds, limit) {
    const digest = createHmac('sha256', secret).update(key).digest('hex')
    const { data, error } = await db.rpc('mh_consume_auth_limit', { p_key: digest, p_seconds: seconds, p_limit: limit })
    if (error) throw new Error('Auth rate limiter unavailable')
    return data === true
  }
  async function limited(req, res, action, email, seconds, count) {
    const account = await consume(`${action}:email:${email}`, seconds, count)
    const ip = await consume(`${action}:ip:${req.ip}`, seconds, action === 'send' ? 10 : count * 3)
    if (account && ip) return false
    res.set('Retry-After', String(seconds)).status(429).json({ error: `Juda ko‘p urinish. ${seconds} soniyadan keyin qayta urinib ko‘ring.`, retryAfter: seconds })
    return true
  }
  async function getUser(id) {
    const { data, error } = await db.from('app_users').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error('Profile lookup failed')
    return data
  }
  async function identity(user) {
    if (!user.auth_user_id) return null
    const { data, error } = await db.auth.admin.getUserById(user.auth_user_id)
    if (error || !data.user || data.user.email?.toLowerCase() !== user.email.toLowerCase()) throw new Error('Auth identity unavailable')
    return data.user
  }
  async function link(user, password) {
    if (user.auth_user_id) return user
    // Admin creates an UNCONFIRMED identity; resend sends Supabase's signup OTP.
    // Keep existing app_users IDs, bcrypt login and post ownership intact.
    const { data, error } = await db.auth.admin.createUser({ email: user.email, password, email_confirm: false })
    let authId = data.user?.id
    if (error) {
      const found = await db.rpc('mh_auth_id_by_email', { p_email: user.email })
      if (found.error || !found.data) throw new Error('Auth provisioning failed')
      authId = found.data
    }
    const saved = await db.from('app_users').update({ auth_user_id: authId }).eq('id', user.id).is('auth_user_id', null)
    if (saved.error) throw new Error('Auth linking failed')
    return getUser(user.id)
  }
  async function pending(req, res, user) {
    const challenge = sign({ sub: user.id, purpose: 'verify-email', email: user.email }, '30m')
    let sent = false
    const account = await consume(`send:email:${user.email}`, 60, 1)
    const ip = await consume(`send:ip:${req.ip}`, 60, 10)
    if (account && ip) {
      const result = await client().auth.resend({ type: 'signup', email: user.email })
      sent = !result.error
    }
    res.status(202).json({ verificationRequired: true, challenge, email: user.email, retryAfter: 60,
      message: sent ? 'Tasdiqlash kodi emailingizga yuborildi.' : 'Kod yuborilmadi yoki yaqinda yuborilgan. Spam papkasini tekshiring va 60 soniyadan keyin qayta yuboring.' })
  }
  async function challengeUser(req, res) {
    let claims
    try { claims = read(req.body?.challenge, 'verify-email') }
    catch { res.status(401).json({ error: 'Tasdiqlash seansi tugadi. Email va parolingiz bilan qayta kiring.' }); return null }
    const user = await getUser(claims.sub)
    if (!user || user.email !== claims.email || !user.auth_user_id) {
      res.status(401).json({ error: 'Tasdiqlash seansi yaroqsiz. Qayta kiring.' }); return null
    }
    return user
  }
  app.use('/api/auth', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  app.post('/api/auth/register', wrap(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    const password = req.body?.password
    if (name.length < 2 || name.length > 60 || email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 100 || Buffer.byteLength(password) > 72)
      return res.status(400).json({ error: 'Ism, email va parolni tekshiring. Parol 8–72 bayt bo‘lsin.' })
    if (await limited(req, res, 'register', email, 900, 5)) return
    const { data: existing, error } = await db.from('app_users').select('id').eq('email', email).maybeSingle()
    if (error) throw new Error('Registration unavailable')
    if (existing) return res.status(409).json({ error: 'Bu email bilan akkaunt mavjud. Kirish orqali davom eting.' })
    const inserted = await db.from('app_users').insert({ id: randomUUID(), email, name,
      class_name: typeof req.body.className === 'string' ? req.body.className.trim().slice(0, 20) : '', password_hash: await bcrypt.hash(password, 12) }).select('*').single()
    if (inserted.error) return res.status(409).json({ error: 'Akkaunt yaratilmadi. Kirish orqali qayta urinib ko‘ring.' })
    const user = await link(inserted.data, password)
    return pending(req, res, user)
  }))
  app.post('/api/auth/login', wrap(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 160) : ''
    const password = req.body?.password
    if (typeof password !== 'string' || password.length > 100) return res.status(400).json({ error: 'Email va parolni kiriting.' })
    if (await limited(req, res, 'login', email, 900, 10)) return
    const { data, error } = await db.from('app_users').select('*').eq('email', email).maybeSingle()
    if (error) throw new Error('Login unavailable')
    if (!data || !await bcrypt.compare(password, data.password_hash)) return res.status(401).json({ error: 'Email yoki parol noto‘g‘ri.' })
    const user = await link(data, password)
    const authUser = await identity(user)
    if (!authUser.email_confirmed_at) return pending(req, res, user)
    res.json(session(user))
  }))
  app.post('/api/auth/verify-email', wrap(async (req, res) => {
    const user = await challengeUser(req, res)
    if (!user) return
    if (await limited(req, res, 'verify', user.email, 900, 5)) return
    if (typeof req.body.code !== 'string' || !/^\d{6}$/.test(req.body.code)) return res.status(400).json({ error: '6 xonali kodni to‘liq kiriting.' })
    const { data, error } = await client().auth.verifyOtp({ email: user.email, token: req.body.code, type: 'signup' })
    if (error || data.user?.id !== user.auth_user_id || !data.user?.email_confirmed_at)
      return res.status(400).json({ error: 'Kod noto‘g‘ri, muddati tugagan yoki ishlatilgan. Yangi kod so‘rang.' })
    res.json({ ...session(user), message: 'Email muvaffaqiyatli tasdiqlandi!' })
  }))
  app.post('/api/auth/resend-code', wrap(async (req, res) => {
    const user = await challengeUser(req, res)
    if (!user) return
    if (await limited(req, res, 'send', user.email, 60, 1)) return
    const authUser = await identity(user)
    if (authUser.email_confirmed_at) return res.status(400).json({ error: 'Email allaqachon tasdiqlangan. Parolingiz bilan kiring.' })
    const { error } = await client().auth.resend({ type: 'signup', email: user.email })
    if (error) return res.status(503).json({ error: 'Email yuborilmadi. 60 soniyadan keyin qayta urinib ko‘ring.', retryAfter: 60 })
    res.json({ message: 'Yangi kod emailingizga yuborildi.', retryAfter: 60 })
  }))
  const auth = wrap(async (req, res, next) => {
    let claims
    try { claims = read((req.headers.authorization || '').replace(/^Bearer /, ''), 'session') }
    catch { return res.status(401).json({ error: 'Seans tugagan. Qayta kiring va emailingizni tasdiqlang.' }) }
    const user = await getUser(claims.sub)
    if (!user) return res.status(401).json({ error: 'Akkaunt topilmadi.' })
    const authUser = await identity(user)
    if (!claims.verified || !authUser?.email_confirmed_at) return res.status(403).json({ error: 'Avval emailingizni tasdiqlang.' })
    req.user = user
    next()
  })
  app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }))
  return { auth }
}
