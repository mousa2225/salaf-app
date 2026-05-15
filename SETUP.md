# 📒 دفتر السلف - دليل الإعداد والنشر

نظام إدارة سلف الموظفين مع تخزين سحابي (Firebase) ونشر مجاني (GitHub Pages).

---

## 📋 ما تحتاجه قبل البدء

1. **حساب Google** (لـ Firebase)
2. **حساب GitHub** ([github.com](https://github.com))
3. **Node.js** على جهازك ([nodejs.org](https://nodejs.org) - حمّل LTS)
4. **Git** ([git-scm.com](https://git-scm.com))

---

## 🔥 الخطوة 1: إعداد Firebase

### 1.1 إنشاء المشروع

1. روح [console.firebase.google.com](https://console.firebase.google.com)
2. اضغط **Add project** → سمّه (مثلاً: `salaf-app`) → التالي → تجاهل Analytics → Create
3. لما يخلص، اضغط على أيقونة **</>** (Web) → سمّ التطبيق `salaf-web` → Register
4. **انسخ كائن `firebaseConfig`** - راح تحتاجه في الخطوة 1.4

### 1.2 تفعيل تسجيل الدخول

1. من القائمة اليسرى: **Build → Authentication** → Get started
2. اختر **Email/Password** → فعّل أول خيار → Save

### 1.3 تفعيل قاعدة البيانات Firestore

1. من القائمة اليسرى: **Build → Firestore Database** → Create database
2. اختر **Start in production mode** → التالي
3. اختر أقرب منطقة لك (مثلاً: `eur3` أو `me-central1`) → Enable

### 1.4 ضبط قواعد الأمان (مهم جداً!)

1. في Firestore، اذهب لـ تبويب **Rules**
2. الصق هذي القواعد بدل اللي موجودة:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. اضغط **Publish**

> هذي القواعد تضمن إن كل مستخدم يشوف بياناته فقط، ولا أحد ثاني يقدر يفتحها.

### 1.5 نسخ إعدادات Firebase للمشروع

افتح ملف `src/firebase.js` واستبدل القيم بقيمك من الخطوة 1.1:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "salaf-app.firebaseapp.com",
  projectId: "salaf-app",
  storageBucket: "salaf-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc..."
};
```

---

## 💻 الخطوة 2: تشغيل المشروع محلياً

افتح Terminal (أو CMD على ويندوز) داخل مجلد المشروع:

```bash
npm install
npm run dev
```

افتح الرابط اللي يطلع لك (عادة `http://localhost:5173`)، أنشئ حساب، وجرّب التطبيق.

---

## 🐙 الخطوة 3: رفع المشروع على GitHub

### 3.1 إنشاء Repository

1. روح [github.com/new](https://github.com/new)
2. **اسم الـ Repository:** `salaf-app` (نفس الاسم اللي في `vite.config.js`)
3. اختر **Public** (لازم Public للنشر المجاني على GitHub Pages)
4. **لا تختار** أي خيارات إضافية (ولا README ولا .gitignore)
5. اضغط **Create repository**

### 3.2 ربط المشروع بـ GitHub

في Terminal داخل مجلد المشروع، شغّل (استبدل `YOUR_USERNAME` باسم حسابك):

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/salaf-app.git
git push -u origin main
```

---

## 🚀 الخطوة 4: النشر على GitHub Pages

### 4.1 النشر بضغطة زر

```bash
npm run deploy
```

هذا الأمر يبني المشروع ويرفعه على branch اسمه `gh-pages` تلقائياً.

### 4.2 تفعيل GitHub Pages

1. روح صفحة الـ repository على GitHub
2. **Settings** (إعدادات) → من القائمة اليسرى **Pages**
3. تحت **Source**: اختر **Deploy from a branch**
4. تحت **Branch**: اختر `gh-pages` → `/(root)` → **Save**
5. انتظر دقيقتين، راح يطلع رابط أخضر:
   ```
   https://YOUR_USERNAME.github.io/salaf-app/
   ```

### 4.3 إضافة الـ Domain للـ Authorized Domains في Firebase

عشان تسجيل الدخول يشتغل من الرابط المنشور:

1. Firebase Console → **Authentication** → **Settings** → **Authorized domains**
2. اضغط **Add domain**
3. أضف: `YOUR_USERNAME.github.io` (بدون https وبدون مسار)

---

## 🔄 التحديثات المستقبلية

أي تعديل تسويه على الكود، شغّل:

```bash
git add .
git commit -m "وصف التعديل"
git push
npm run deploy
```

---

## ⚠️ تنبيهات مهمة

### إذا غيرت اسم الـ repository
لازم تحدّث ملف `vite.config.js`:
```javascript
base: '/الاسم-الجديد/',
```

### الخطة المجانية لـ Firebase تكفي لـ:
- ٥٠٬٠٠٠ قراءة يومياً
- ٢٠٬٠٠٠ كتابة يومياً
- ١ جيجا تخزين

أكثر من كافية لأي مشروع صغير-متوسط.

### النسخ الاحتياطي
بياناتك محفوظة عند Google، لكن يفضل من فترة لأخرى:
- صدّر "أرصدة الموظفين" كملف إكسل واحتفظ به

---

## 🆘 حل المشاكل الشائعة

**المشكلة:** الصفحة بيضاء بعد النشر
**الحل:** تأكد إن `base` في `vite.config.js` يطابق اسم الـ repository

**المشكلة:** تسجيل الدخول ما يشتغل بعد النشر
**الحل:** أضف الـ domain في Authorized domains (الخطوة 4.3)

**المشكلة:** `Permission denied` في Firestore
**الحل:** راجع قواعد الأمان (الخطوة 1.4)

**المشكلة:** `npm install` فشل
**الحل:** تأكد إن Node.js مثبت (`node -v` يطلع نسخة)
