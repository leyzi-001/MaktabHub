import React, { useEffect, useMemo, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const tabs = [
  { id: 'lost', icon: '🔎', label: 'Buyumlar', title: 'Topilgan buyumlar', desc: 'Buyum nomi yoki joyi bo‘yicha qidiring.' },
  { id: 'clubs', icon: '🎯', label: 'Klublar', title: 'Klublar va tadbirlar', desc: 'Qiziqishingizga mos faoliyatni toping.' },
  { id: 'books', icon: '📚', label: 'Kitoblar', title: 'Kitob almashinuvi', desc: 'Kitob taklif qiling yoki izlang.' },
  { id: 'qa', icon: '💡', label: 'Bilim almashish', title: 'Savol-javob', desc: 'Savol bering va bilim ulashing.' },
  { id: 'places', icon: '🗺️', label: 'Maktab xaritasi', title: 'Maktab joylari', desc: 'Muhim xonalar va joylar ro‘yxati.' },
]
const features = [
  ['🔎','Topilgan buyumlar','Rasm, joy va vaqt haqidagi ma’lumotlar orqali buyumni topishni osonlashtiradi.'],
  ['🎯','Klublar va tadbirlar','O‘zingizga mos to‘garaklarni ko‘ring va maktab hayotida faol qatnashing.'],
  ['💡','Bilim almashish','Savol bering, tushuntiring va foydali o‘quv materiallarini ulashing.'],
  ['📚','Kitob almashinuvi','O‘qib bo‘lgan kitobingizni taklif qiling yoki kerakli kitobni izlang.'],
  ['🗳️','Anonim taklif qutisi','Maktab hayotini yaxshilash uchun savol yoki taklif yuboring.'],
  ['🗺️','Maktab xaritasi','Kutubxona, sport zali va boshqa muhim joylarni toping.'],
]
async function request(path, { token, ...options } = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'So‘rov bajarilmadi.')
  return data
}
function App() {
  const [active, setActive] = useState('lost')
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [token, setToken] = useState(() => localStorage.getItem('mh_token') || '')
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('mh_user') || 'null') } catch { return null } })
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [join, setJoin] = useState({ name: '', className: '', interest: '' })

  const activeTab = tabs.find(t => t.id === active) || tabs[0]
  const filtered = useMemo(() => items.filter(x => `${x.title} ${x.description || ''} ${x.location || ''}`.toLowerCase().includes(query.toLowerCase())), [items, query])

  async function loadItems(category = active) {
    setError('')
    try {
      const data = await request(`/posts?category=${encodeURIComponent(category)}`)
      setItems(data.posts || [])
    } catch (e) {
      setItems([])
      setError('Backend bilan bog‘lanib bo‘lmadi. Terminalda npm run dev ishga tushganini tekshiring.')
    }
  }
  useEffect(() => { loadItems(active) }, [active])
  useEffect(() => {
    request('/suggestions').then(d => setSuggestions(d.suggestions || [])).catch(() => {})
  }, [notice])

  async function handleAuth(e) {
    e.preventDefault(); setBusy(true); setError('')
    const fd = new FormData(e.currentTarget)
    try {
      const data = await request(`/auth/${authMode}`, { method: 'POST', body: JSON.stringify({ name: fd.get('name'), email: fd.get('email'), password: fd.get('password'), className: fd.get('className') }) })
      setToken(data.token); setUser(data.user); localStorage.setItem('mh_token', data.token); localStorage.setItem('mh_user', JSON.stringify(data.user))
      setAuthOpen(false); setNotice(`Xush kelibsiz, ${data.user.name}!`)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function addPost(e) {
    e.preventDefault(); setBusy(true); setError('')
    const fd = new FormData(e.currentTarget)
    try {
      await request('/posts', { token, method: 'POST', body: JSON.stringify({ category: active, title: fd.get('title'), description: fd.get('description'), location: fd.get('location') }) })
      setFormOpen(false); setNotice('E’lon muvaffaqiyatli joylandi.'); await loadItems(active)
    } catch (e) { setError(e.message); if (!token) { setAuthMode('login'); setAuthOpen(true) } } finally { setBusy(false) }
  }
  async function sendSuggestion(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      await request('/suggestions', { method: 'POST', body: JSON.stringify({ message: suggestion }) })
      setSuggestion(''); setNotice('Taklif yuborildi. Rahmat!')
      const d = await request('/suggestions'); setSuggestions(d.suggestions || [])
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function submitJoin(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      await request('/join-requests', { method: 'POST', body: JSON.stringify(join) })
      setJoin({ name: '', className: '', interest: '' }); setNotice('Sinov guruhiga qiziqishingiz qayd etildi.')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  function logout() {
    localStorage.removeItem('mh_token'); localStorage.removeItem('mh_user'); setToken(''); setUser(null); setNotice('Tizimdan chiqdingiz.')
  }
  const demoItems = {
    lost: [{ icon:'🎒', title:'Qora ryukzak', description:'Sport zaliga yaqin · Bugun 10:30', location:'Sport zali' }, { icon:'🔑', title:'Kalitlar bog‘lami', description:'Kutubxona oldida · Kecha', location:'Kutubxona' }],
    clubs: [{ icon:'⚽', title:'Futbol klubi', description:'Sport maydoni · Dushanba va chorshanba' }, { icon:'💻', title:'Dasturlash klubi', description:'Informatika xonasi · Seshanba' }],
    books: [{ icon:'📘', title:'Ingliz tili grammatikasi', description:'Almashish uchun · 8–9-sinflar' }, { icon:'📙', title:'Sarguzashtlar kitobi', description:'Yaxshi holatda' }],
    qa: [{ icon:'❓', title:'Present Perfect qachon ishlatiladi?', description:'Ingliz tili · Savol' }, { icon:'🧮', title:'Kasrlarni qo‘shish usuli', description:'Matematika · Savol' }],
    places: [{ icon:'📚', title:'Kutubxona', description:'Asosiy bino · 2-qavat' }, { icon:'🏀', title:'Sport zali', description:'Asosiy bino · 1-qavat' }, { icon:'🧪', title:'Laboratoriya', description:'B-blok · 3-qavat' }],
  }
  const visibleItems = filtered.length || query ? filtered : (items.length ? [] : (demoItems[active] || []))
  return <div>
    <header className="navbar"><a className="brand" href="#home"><span className="brand-mark">MH</span><span>Maktab <b>Hub</b></span></a>
      <nav><a href="#features">Imkoniyatlar</a><a href="#how">Qanday ishlaydi?</a><a href="#workspace">Platforma</a><a href="#contact">Aloqa</a></nav>
      <div className="nav-actions">{user ? <><span className="user-chip">👋 {user.name}</span><button className="btn btn-quiet" onClick={logout}>Chiqish</button></> : <button className="btn btn-primary" onClick={() => {setAuthMode('login');setAuthOpen(true)}}>Kirish / Ro‘yxatdan o‘tish</button>}</div>
    </header>
    <main id="home">
      <section className="hero wrap"><div className="hero-copy"><span className="eyebrow"><i/> Maktab hayoti — bir joyda</span><h1>Maktab hayotini <span>birlashtiramiz.</span></h1><p>Klublar, tadbirlar, bilim almashish, kitoblar va topilgan buyumlar haqidagi ma’lumotlar — barchasi bitta qulay platformada.</p><div className="hero-actions"><a className="btn btn-primary" href="#workspace">Platformani sinash <span>→</span></a><a className="btn btn-soft" href="#features">Imkoniyatlarni ko‘rish</a></div><div className="social-proof"><span className="emoji-stack">📚 ⚽ 💡</span><span>Faol o‘quvchilar hamjamiyati uchun</span></div></div>
      <div className="preview-card"><div className="preview-head"><div className="brand"><span className="brand-mark">MH</span><b>Maktab Hub</b></div><span className="live-tag">● Platforma</span></div><div className="welcome-card"><small>Assalomu alaykum! 👋</small><h3>Maktab hayotiga xush kelibsiz</h3><p>Bugun yangi imkoniyatlarni kashf qiling.</p></div><div className="preview-grid">{[['🔎','Topilmalar','Buyumlarni izlash'],['🎯','Klublar','Qiziqishni topish'],['📚','Kitoblar','Ulashish va almashish'],['💬','Bilimlar','Savol-javob']].map(x=><div className="preview-tile" key={x[1]}><span>{x[0]}</span><b>{x[1]}</b><small>{x[2]}</small></div>)}</div></div></section>
      <section className="section wrap" id="features"><div className="section-heading"><span className="kicker">IMKONIYATLAR</span><h2>Maktab uchun kerakli hamma narsa</h2><p>Maktab Hub baho va davomatni takrorlamaydi. U o‘quvchilar hamjamiyati va maktab hayotini qulaylashtirishga xizmat qiladi.</p></div><div className="feature-grid">{features.map(f=><article className="feature-card" key={f[1]}><span className="feature-icon">{f[0]}</span><h3>{f[1]}</h3><p>{f[2]}</p></article>)}</div></section>
      <section className="section section-tint" id="how"><div className="wrap"><div className="section-heading"><span className="kicker">ODDIY VA QULAY</span><h2>Uch qadamda ishtirok eting</h2><p>Maktabdagi imkoniyatlardan foydalanish endi yanada sodda.</p></div><div className="steps-grid">{[['01 / KO‘RING','Imkoniyatlarni kashf qiling','Klublar, kitoblar, savollar va topilgan buyumlarni ko‘ring.'],['02 / TANLANG','O‘zingizga keraklisini toping','Qidiruvdan foydalaning yoki o‘zingizga mos tadbirni tanlang.'],['03 / QO‘SHILING','Hamjamiyatni rivojlantiring','Bilimingizni ulashing va maktab hayotida faol qatnashing.']].map(s=><article className="step-card" key={s[0]}><span>{s[0]}</span><h3>{s[1]}</h3><p>{s[2]}</p></article>)}</div></div></section>
      <section className="section wrap" id="workspace"><div className="section-heading"><span className="kicker">INTERAKTIV PLATFORMА</span><h2>Maktab Hub’ni sinab ko‘ring</h2><p>Backend yoqilgan bo‘lsa, e’lonlar serverga saqlanadi. Hozircha namunaviy ma’lumotlar ham ko‘rsatiladi.</p></div>
        {notice && <div className="notice success" role="status">{notice}<button onClick={()=>setNotice('')}>✕</button></div>}
        {error && <div className="notice error" role="alert">{error}<button onClick={()=>setError('')}>✕</button></div>}
        <div className="workspace"><aside className="side-tabs">{tabs.map(t=><button key={t.id} className={active===t.id?'side-tab active':'side-tab'} onClick={()=>{setActive(t.id);setQuery('')}}><span>{t.icon}</span>{t.label}</button>)}<button className={active==='suggest'?'side-tab active':'side-tab'} onClick={()=>setActive('suggest')}><span>🗳️</span>Anonim taklif</button></aside>
        <div className="work-panel">{active==='suggest' ? <><div className="panel-head"><div><h3>Anonim taklif qutisi</h3><p>Maktab hayotini yaxshilash uchun taklif yuboring.</p></div></div><form onSubmit={sendSuggestion}><textarea className="field textarea" value={suggestion} onChange={e=>setSuggestion(e.target.value)} required minLength="3" maxLength="1200" placeholder="Savol yoki taklifingizni yozing..."/><button className="btn btn-primary" disabled={busy}>{busy?'Yuborilmoqda...':'Taklifni yuborish ↗'}</button></form><div className="privacy-note">Maxfiylik: takliflar ism ko‘rsatmasdan saqlanadi, lekin server ma’muri texnik jihatdan ma’lumotlarni boshqaradi. Haqiqiy anonimlik uchun hosting va maxfiylik sozlamalari ham ko‘rib chiqilishi kerak.</div><div className="suggestion-list">{suggestions.slice(0,5).map(s=><div className="suggestion" key={s.id}><b>🗳️ Anonim taklif</b><p>{s.message}</p></div>)}</div></> : <><div className="panel-head"><div><h3>{activeTab.title}</h3><p>{activeTab.desc}</p></div><button className="btn btn-primary" onClick={()=>{if(active==='places'){setNotice('Maktab joylari ro‘yxati ma’lumot uchun berilgan.');return} if(!token){setAuthMode('login');setAuthOpen(true);return}setFormOpen(v=>!v)}}>＋ E’lon qo‘shish</button></div><div className="searchbox"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Qidirish..."/></div>{formOpen&&<form className="post-form" onSubmit={addPost}><input className="field" name="title" required maxLength="100" placeholder="Sarlavha"/><input className="field" name="location" maxLength="120" placeholder="Joylashuv (ixtiyoriy)"/><textarea className="field" name="description" required maxLength="1000" placeholder="Batafsil ma’lumot"/><div className="form-actions"><button className="btn btn-primary" disabled={busy}>{busy?'Saqlanmoqda...':'Saqlash'}</button><button className="btn btn-quiet" type="button" onClick={()=>setFormOpen(false)}>Bekor qilish</button></div></form>}<div className="result-count">{visibleItems.length} ta natija</div><div className="listing-grid">{visibleItems.map((item,i)=><article className="listing" key={item.id||`${item.title}-${i}`}><span className="listing-icon">{item.icon || (active==='clubs'?'🎯':active==='books'?'📚':active==='qa'?'💡':active==='places'?'🗺️':'🔎')}</span><div className="listing-info"><b>{item.title}</b><p>{item.description || item.location || 'Qo‘shimcha ma’lumot yo‘q'}</p>{item.location&&<small>📍 {item.location}</small>}</div><span className="listing-tag">{item.status||'Mavjud'}</span></article>)}</div>{visibleItems.length===0&&<div className="empty-state">🔍 Mos ma’lumot topilmadi. Boshqa so‘z bilan qidiring yoki yangi e’lon qo‘shing.</div>}</>}</div></div>
      </section>
      <section className="cta-section" id="contact"><div className="wrap cta-box"><div><span className="kicker">KEYINGI QADAM</span><h2>Maktabingizni yanada faol qilamiz.</h2><p>Maktab Hub’ni kichik sinov guruhida ishga tushirib, o‘quvchilar fikri asosida rivojlantiramiz.</p></div><form className="join-form" onSubmit={submitJoin}><input className="field" required value={join.name} onChange={e=>setJoin({...join,name:e.target.value})} placeholder="Ismingiz"/><input className="field" required value={join.className} onChange={e=>setJoin({...join,className:e.target.value})} placeholder="Sinf (masalan, 8-A)"/><input className="field" value={join.interest} onChange={e=>setJoin({...join,interest:e.target.value})} placeholder="Qaysi bo‘lim qiziq?"/><button className="btn btn-primary" disabled={busy}>{busy?'Yuborilmoqda...':'Sinov guruhiga qo‘shilish ↗'}</button></form></div></section>
    </main>
    <footer className="footer wrap"><a className="brand" href="#home"><span className="brand-mark">MH</span><span>Maktab <b>Hub</b></span></a><span>© {new Date().getFullYear()} Maktab Hub · Maktab hayoti bir joyda.</span><a href="#home">Yuqoriga ↑</a></footer>
    {authOpen&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAuthOpen(false)}}><div className="modal"><div className="modal-title"><div><span className="kicker">MAKTAB HUB</span><h2>{authMode==='login'?'Akkauntga kirish':'Ro‘yxatdan o‘tish'}</h2></div><button className="close-btn" onClick={()=>setAuthOpen(false)}>✕</button></div><form onSubmit={handleAuth} className="auth-form">{authMode==='register'&&<><input className="field" name="name" required minLength="2" maxLength="60" placeholder="Ism"/><input className="field" name="className" maxLength="20" placeholder="Sinf (ixtiyoriy)"/></>}<input className="field" name="email" type="email" required placeholder="Email manzil"/><input className="field" name="password" type="password" required minLength="8" placeholder="Parol (kamida 8 belgi)"/><button className="btn btn-primary" disabled={busy}>{busy?'Kuting...':authMode==='login'?'Kirish':'Akkaunt yaratish'}</button></form><p className="auth-switch">{authMode==='login'?'Akkauntingiz yo‘qmi?':'Akkauntingiz bormi?'} <button onClick={()=>setAuthMode(authMode==='login'?'register':'login')}>{authMode==='login'?'Ro‘yxatdan o‘tish':'Kirish'}</button></p><p className="privacy-note">Demo loyihada haqiqiy shaxsiy ma’lumotlarni kiritmang. Sayt maktab tomonidan rasmiy tasdiqlanmagan.</p></div></div>}
  </div>
}
export default App
