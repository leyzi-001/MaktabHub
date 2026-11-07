import React, { useEffect, useRef, useState } from 'react';

export default function EmailVerification({ pending, request, onVerified, onBack }) {
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState(pending.message);
  const [until, setUntil] = useState(() => Date.now() + (pending.retryAfter || 60) * 1000);
  const [now, setNow] = useState(Date.now());
  const inputs = useRef([]);
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);
  useEffect(() => { inputs.current[0]?.focus(); }, []);
  function fill(index, value) {
    const clean = value.replace(/\D/g, '').slice(0, 6 - index);
    setDigits(old => { const next = [...old]; if (!clean) next[index] = ''; else [...clean].forEach((n, offset) => { next[index + offset] = n; }); return next; });
    if (clean) inputs.current[Math.min(5, index + clean.length)]?.focus();
    setError('');
  }
  async function verify(e) {
    e.preventDefault();
    if (digits.join('').length !== 6 || busy) return;
    setBusy('verify'); setError(''); setMessage('');
    try {
      const data = await request('/auth/verify-email', { method: 'POST', body: JSON.stringify({ challenge: pending.challenge, code: digits.join('') }) });
      setDigits(Array(6).fill(''));
      onVerified(data);
    } catch (e) {
      setError(e.message);
      setDigits(Array(6).fill('')); inputs.current[0]?.focus();
    } finally { setBusy(''); }
  }
  async function resend() {
    if (remaining || busy) return;
    setBusy('resend'); setError(''); setMessage('');
    setUntil(Date.now() + 60000);
    try {
      const data = await request('/auth/resend-code', { method: 'POST', body: JSON.stringify({ challenge: pending.challenge }) });
      setUntil(Date.now() + (data.retryAfter || 60) * 1000);
      setMessage(data.message); setDigits(Array(6).fill('')); inputs.current[0]?.focus();
    } catch (e) {
      setError(e.message);
      if (e.retryAfter) setUntil(Date.now() + e.retryAfter * 1000);
    } finally { setBusy(''); }
  }
  return <section className="otp-panel" aria-labelledby="otp-title">
    <div className="otp-icon" aria-hidden="true">✉</div>
    <span className="kicker">MAKTABHUB · XAVFSIZ TASDIQLASH</span>
    <h2 id="otp-title">Emailingizni tasdiqlang</h2>
    <p><strong>{pending.email}</strong> manziliga yuborilgan 6 xonali kodni kiriting.</p>
    <form onSubmit={verify} aria-busy={Boolean(busy)}>
      <div className="otp-inputs" role="group" aria-label="6 xonali tasdiqlash kodi">
        {digits.map((digit, i) => <input key={i} ref={el => { inputs.current[i] = el; }} type="text" inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'} aria-label={`Kodning ${i + 1}-raqami`} aria-invalid={Boolean(error)}
          value={digit} disabled={Boolean(busy)} maxLength={6} onFocus={e => e.target.select()}
          onChange={e => fill(i, e.target.value)} onPaste={e => { e.preventDefault(); fill(i, e.clipboardData.getData('text')); }}
          onKeyDown={e => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) { e.preventDefault(); setDigits(old => old.map((d, n) => n === i - 1 ? '' : d)); inputs.current[i - 1]?.focus(); }
            if (e.key === 'ArrowLeft') inputs.current[Math.max(0, i - 1)]?.focus();
            if (e.key === 'ArrowRight') inputs.current[Math.min(5, i + 1)]?.focus();
          }} />)}
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice success" role="status">{message}</div>}
      <button className="btn btn-primary otp-submit" disabled={Boolean(busy) || digits.join('').length !== 6}>
        {busy === 'verify' && <span className="otp-spinner" aria-hidden="true" />}{busy === 'verify' ? 'Tekshirilmoqda...' : 'Emailni tasdiqlash'}
      </button>
    </form>
    <p className="otp-help">Kod kelmadimi? Spam papkasini ham tekshiring.</p>
    <button type="button" className="btn btn-quiet otp-submit" onClick={resend} disabled={remaining > 0 || Boolean(busy)}>
      {busy === 'resend' ? 'Yuborilmoqda...' : remaining ? `Qayta yuborish (${remaining}s)` : 'Kodni qayta yuborish'}
    </button>
    <button type="button" className="btn btn-quiet otp-submit" onClick={onBack} disabled={Boolean(busy)}>Kirishga qaytish</button>
    <p className="privacy-note">Kodning amal qilish muddati cheklangan. Uni hech kimga bermang. Tasdiqlash seansi tugasa, parolingiz bilan qayta kiring.</p>
  </section>;
}
