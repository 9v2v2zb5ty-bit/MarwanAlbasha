# Marwan Albasha Educational Platform

منصة تعليمية عربية مبنية بـ Node.js + Express + SQLite.

## الملفات
- `public/index.html` الواجهة
- `server.js` الـ backend وواجهات API
- `package.json` الحزم وأوامر التشغيل
- `.env.example` متغيرات البيئة
- `.gitignore` ملفات لا يجب رفعها
- `public/404.html` صفحة 404

## تشغيل محلي
1. ثبّت Node.js 18 أو أحدث.
2. نفّذ `npm install`.
3. انسخ `.env.example` إلى `.env`.
4. ضع كلمة مرور أدمن قوية وJWT_SECRET عشوائي طويل.
5. نفّذ `npm start`.
6. افتح `http://localhost:3000`.

## مهم
GitHub Pages يستضيف الواجهة الثابتة فقط. الـ Express + SQLite يحتاجان استضافة Node.js منفصلة.
لا ترفع `.env` أو مجلد `data/` إلى مستودع Public.
