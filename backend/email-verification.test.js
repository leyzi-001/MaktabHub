import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { installEmailVerification } from './email-verification.js'

const secret = 'test-secret-at-least-thirty-two-characters-long'
async function fixture(t, { confirmed = false, deliveryError = false, limiterError = false, legacy = false } = {}) {
  const user = { id: 'profile-1', name: 'Ali', email: 'ali@example.com', auth_user_id: legacy ? null : 'auth-1', password_hash: await bcrypt.hash('password123', 4) }
  let used = false, now = 0, otpCalls = 0
  const limits = new Map()
  const db = {
    rpc: async (name, args) => {
      if (name === 'mh_auth_id_by_email') return { data: 'auth-1' }
      if (limiterError) return { error: { message: 'offline' } }
      let bucket = limits.get(args.p_key)
      if (!bucket || now >= bucket.until) bucket = { count: 0, until: now + args.p_seconds }
      bucket.count++; limits.set(args.p_key, bucket)
      return { data: bucket.count <= args.p_limit }
    },
    from: () => {
      let update
      const query = {
        select: () => query, eq: () => query, is: () => { Object.assign(user, update); return Promise.resolve({ error: null }) },
        update: value => { update = value; return query },
        maybeSingle: async () => ({ data: user }),
      }
      return query
    },
    auth: { admin: {
      getUserById: async () => ({ data: { user: { id: 'auth-1', email: user.email, email_confirmed_at: confirmed ? '2026-11-07' : null } } }),
      createUser: async args => { assert.equal(args.email_confirm, false); return { data: { user: { id: 'auth-1' } } } },
    } },
  }
  const client = () => ({ auth: {
    resend: async args => { assert.equal(args.type, 'signup'); return { error: deliveryError ? new Error('SMTP') : null } },
    verifyOtp: async args => {
      otpCalls++; assert.equal(args.type, 'signup')
      if (args.token !== '012345' || used) return { data: {}, error: new Error('invalid or expired') }
      used = true; confirmed = true
      return { data: { user: { id: 'auth-1', email_confirmed_at: '2026-11-07' } } }
    },
  } })
  const app = express(); app.use(express.json())
  const { auth } = installEmailVerification(app, db, { JWT_SECRET: secret, createAuthClient: client })
  app.get('/protected', auth, (_req, res) => res.json({ ok: true }))
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Server xatoligi.' }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  async function call(path, body, token) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: res.status, body: await res.json() }
  }
  const challenge = jwt.sign({ sub: user.id, email: user.email, purpose: 'verify-email' }, secret, { audience: 'maktabhub', expiresIn: '30m' })
  return { call, challenge, user, advance: seconds => { now += seconds }, otpCalls: () => otpCalls }
}

test('password login for unverified user issues only a verification challenge', async t => {
  const f = await fixture(t)
  const r = await f.call('/api/auth/login', { email: f.user.email, password: 'password123' })
  assert.equal(r.status, 202); assert.ok(r.body.challenge); assert.equal(r.body.token, undefined)
  assert.equal((await f.call('/protected', null, r.body.challenge)).status, 401)
})
test('verified users retain password login and protected access', async t => {
  const f = await fixture(t, { confirmed: true })
  const r = await f.call('/api/auth/login', { email: f.user.email, password: 'password123' })
  assert.equal(r.status, 200); assert.equal((await f.call('/protected', null, r.body.token)).status, 200)
})
test('legacy profiles link without changing profile ID or password hash', async t => {
  const f = await fixture(t, { legacy: true }); const hash = f.user.password_hash
  assert.equal((await f.call('/api/auth/login', { email: f.user.email, password: 'password123' })).status, 202)
  assert.equal(f.user.id, 'profile-1'); assert.equal(f.user.password_hash, hash); assert.equal(f.user.auth_user_id, 'auth-1')
})
test('leading-zero OTP succeeds once, replay is rejected', async t => {
  const f = await fixture(t)
  const r = await f.call('/api/auth/verify-email', { challenge: f.challenge, code: '012345' })
  assert.equal(r.status, 200); assert.ok(r.body.token)
  assert.equal((await f.call('/protected', null, r.body.token)).status, 200)
  assert.equal((await f.call('/api/auth/verify-email', { challenge: f.challenge, code: '012345' })).status, 400)
})
test('wrong or expired OTP never returns a session', async t => {
  const f = await fixture(t)
  const r = await f.call('/api/auth/verify-email', { challenge: f.challenge, code: '999999' })
  assert.equal(r.status, 400); assert.equal(r.body.token, undefined)
})
test('account verification limit survives challenge changes', async t => {
  const f = await fixture(t)
  for (let i = 0; i < 5; i++) assert.equal((await f.call('/api/auth/verify-email', { challenge: f.challenge, code: '999999' })).status, 400)
  assert.equal((await f.call('/api/auth/verify-email', { challenge: f.challenge, code: '012345' })).status, 429)
  assert.equal(f.otpCalls(), 5)
})
test('resend cooldown is enforced on the server', async t => {
  const f = await fixture(t)
  assert.equal((await f.call('/api/auth/resend-code', { challenge: f.challenge })).status, 200)
  assert.equal((await f.call('/api/auth/resend-code', { challenge: f.challenge })).status, 429)
  f.advance(60)
  assert.equal((await f.call('/api/auth/resend-code', { challenge: f.challenge })).status, 200)
})
test('email delivery failure keeps account unverified and supports retry', async t => {
  const f = await fixture(t, { deliveryError: true })
  const r = await f.call('/api/auth/login', { email: f.user.email, password: 'password123' })
  assert.equal(r.status, 202); assert.ok(r.body.challenge); assert.equal(r.body.token, undefined)
  f.advance(60)
  assert.equal((await f.call('/api/auth/resend-code', { challenge: f.challenge })).status, 503)
})
test('limiter outage fails closed', async t => {
  const f = await fixture(t, { limiterError: true })
  assert.equal((await f.call('/api/auth/verify-email', { challenge: f.challenge, code: '012345' })).status, 500)
  assert.equal(f.otpCalls(), 0)
})
test('old JWTs, expired challenges and missing sessions are rejected', async t => {
  const f = await fixture(t)
  const old = jwt.sign({ sub: f.user.id }, secret)
  const expired = jwt.sign({ sub: f.user.id, email: f.user.email, purpose: 'verify-email' }, secret, { audience: 'maktabhub', expiresIn: -1 })
  assert.equal((await f.call('/protected', null, old)).status, 401)
  assert.equal((await f.call('/protected')).status, 401)
  assert.equal((await f.call('/api/auth/verify-email', { challenge: expired, code: '012345' })).status, 401)
})

test('even a signed session cannot bypass current unverified email state', async t => {
  const f = await fixture(t)
  const token = jwt.sign({ sub: f.user.id, purpose: 'session', verified: true }, secret, { audience: 'maktabhub' })
  assert.equal((await f.call('/protected', null, token)).status, 403)
})
test('incorrect passwords and malformed codes never verify or create a session', async t => {
  const f = await fixture(t)
  assert.equal((await f.call('/api/auth/login', { email: f.user.email, password: 'incorrect' })).status, 401)
  const r = await f.call('/api/auth/verify-email', { challenge: f.challenge, code: '12345x' })
  assert.equal(r.status, 400); assert.equal(r.body.token, undefined); assert.equal(f.otpCalls(), 0)
})
