## Email verification

See [the complete email OTP setup guide](docs/EMAIL_VERIFICATION.md) for the SQL migration, Supabase email template/settings, local configuration, Vercel deployment and file placement.

# Maktab Hub — Full-stack loyiha

Ushbu loyiha taqdim etilgan **Maktab Hub** konsepsiyasiga asoslangan: topilgan/yo‘qolgan buyumlar, klublar va tadbirlar, bilim almashish, kitob almashinuvi, anonim takliflar va maktab joylari.

## Texnologiyalar
- HTML5 — React ichida semantik sahifa tuzilishi
- CSS3 — responsive dizayn
- JavaScript + React + Vite — frontend
- Node.js + Express — REST API backend
- JSON fayl ombori — demo uchun doimiy ma’lumot saqlash
- JWT + bcryptjs — akkaunt va parol himoyasi

## Ishga tushirish (Windows)
1. **Node.js LTS** o‘rnating: https://nodejs.org/
2. ZIP faylni oching.
3. Ushbu papkada terminal/CMD oching.
4. Quyidagilarni bajaring:

```bash
npm run install:all
npm run dev
```

5. Frontend: `http://localhost:5173`
6. Backend API: `http://localhost:4000/api/health`

Alohida terminalda faqat frontend/backend:
```bash
npm run dev --prefix frontend
npm run dev --prefix backend
```

## Funksiyalar
- Ro‘yxatdan o‘tish va tizimga kirish
- JWT bilan himoyalangan amallar
- Buyumlar, kitoblar, savollar va klub/tadbirlarni ko‘rish hamda e’lon qo‘shish
- E’lonlarni qidirish
- Takliflar yuborish
- Maktab joylari ro‘yxati
- Serverdagi JSON fayllarga ma’lumot saqlash

## Muhim cheklovlar
Bu — mahalliy ishlaydigan, backend ulangan **boshlang‘ich to‘liq-stack loyiha**. Bir kompyuterda ishga tushirib tekshirish mumkin. Boshqa foydalanuvchilar internet orqali ishlatishi uchun backendni hostingga joylash, frontend API manzilini sozlash va domen/HTTPS qo‘shish kerak.

Haqiqiy maktabda ishlatishdan oldin:
- JSON omborini PostgreSQL kabi ma’lumotlar bazasiga almashtirish;
- admin/moderator rollari va kontentni tekshirish jarayoni;
- rasm yuklashda fayl turi/hajmini tekshirish;
- maxfiylik siyosati, zaxira nusxa, loglar va HTTPS;
- maktab ma’muriyati bilan anonim takliflarni ko‘rish huquqini kelishish;
- yosh foydalanuvchilar ma’lumotlari uchun tegishli rozilik va himoya choralarini qo‘shish tavsiya etiladi.

## Papkalar
```
Maktab-Hub-Fullstack/
├── frontend/   # React, HTML, CSS, JavaScript
└── backend/    # Express REST API va JSON ma’lumotlar ombori
```
