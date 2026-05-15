# 🚀 دليل النشر اليدوي (بدون Terminal)

## الفكرة

GitHub بيبني التطبيق وينشره لك تلقائياً عبر **GitHub Actions** (ملف `.github/workflows/deploy.yml`). أنت فقط ترفع الملفات يدوياً عبر المتصفح، وكل التعديلات تتم من على GitHub مباشرة.

---

## 📋 الخطوات

### 1️⃣ إنشاء Repository

1. روح [github.com/new](https://github.com/new)
2. **Repository name:** `salaf-app` (بالضبط — مهم لأن `vite.config.js` يعتمد عليه)
3. اختر **Public**
4. **لا تختار** أي خيار إضافي
5. اضغط **Create repository**

### 2️⃣ رفع الملفات يدوياً

1. بعد إنشاء الـ repo، اضغط **uploading an existing file** (في أعلى الصفحة)
2. **افتح مجلد المشروع** على جهازك (بعد فك الزيب)
3. **حدد كل الملفات والمجلدات** (Ctrl+A على ويندوز / Cmd+A على ماك)
4. **اسحبها وأفلتها** في نافذة GitHub

> ⚠️ **مهم جداً:** تأكد إن المجلدات المخفية مرفوعة:
> - `.github/` (يحتوي على ملف النشر التلقائي)
> - `.gitignore`
>
> على ويندوز: في File Explorer → **View** → فعّل **Hidden items**
> على ماك: اضغط **Cmd + Shift + .** (نقطة) لإظهار الملفات المخفية

5. في الأسفل اكتب رسالة مثل: `Initial commit`
6. اضغط **Commit changes**

### 3️⃣ تفعيل GitHub Pages

1. من صفحة الـ repo، روح **Settings** (أعلى الصفحة)
2. من القائمة اليسرى: **Pages**
3. تحت **Source**: اختر **GitHub Actions** (مو "Deploy from a branch")
4. حفظ تلقائي

### 4️⃣ تشغيل النشر

1. روح تبويب **Actions** (أعلى صفحة الـ repo)
2. لازم تشوف workflow اسمه **"Deploy to GitHub Pages"** يشتغل تلقائياً
3. انتظر ٢-٣ دقائق
4. لما تطلع علامة ✅ خضراء، التطبيق منشور

### 5️⃣ الحصول على الرابط

1. ارجع لـ **Settings → Pages**
2. راح يطلع لك رابط أخضر:
   ```
   https://USERNAME.github.io/salaf-app/
   ```

### 6️⃣ إضافة Domain في Firebase

عشان تسجيل الدخول يشتغل بعد النشر:

1. [console.firebase.google.com](https://console.firebase.google.com) → اختر مشروعك
2. **Authentication → Settings → Authorized domains**
3. **Add domain** → اكتب: `USERNAME.github.io` (بدون https)

---

## 🔄 التعديلات المستقبلية

### الطريقة الأسهل: عبر GitHub مباشرة

1. روح الملف اللي تبي تعدله على GitHub
2. اضغط أيقونة القلم ✏️ (Edit)
3. عدّل
4. اضغط **Commit changes**
5. GitHub Actions ينشر التحديث تلقائياً 🎉

### الطريقة الثانية: رفع ملف بديل

1. روح الملف القديم على GitHub
2. اضغط **Delete file** ثم Commit
3. ارفع الملف الجديد بنفس الاسم
4. GitHub Actions ينشر تلقائياً

---

## ⚠️ تنبيهات مهمة

### ✅ تأكد قبل الرفع
- ملف `src/firebase.js` فيه إعداداتك الصحيحة (محدّث لك مسبقاً ✅)
- مجلد `.github/` موجود ومرفوع
- **لا ترفع** مجلد `node_modules/` (مستثنى بـ `.gitignore`)
- **لا ترفع** مجلد `dist/` إن وُجد

### ✅ خطوات Firebase أولاً
قبل ما تنشر، تأكد إنك سويت في Firebase Console:
1. تفعيل **Authentication → Email/Password**
2. تفعيل **Firestore Database**
3. ضبط **قواعد الأمان** (Rules)

راجع `SETUP.md` للتفاصيل.

---

## 🆘 مشاكل شائعة

**المشكلة:** Actions ما تشتغلت
**الحل:** تأكد إن مجلد `.github/workflows/deploy.yml` مرفوع

**المشكلة:** الصفحة بيضاء بعد النشر
**الحل:** افتح Developer Tools (F12) وشوف الأخطاء. غالباً اسم الـ repo ما يطابق `base` في `vite.config.js`

**المشكلة:** تسجيل الدخول لا يعمل
**الحل:** أضف `USERNAME.github.io` في Firebase Authorized domains

**المشكلة:** Actions فشلت ✗
**الحل:** اضغط على الـ workflow لتشاهد الخطأ. أرسلي صورة وأساعدك
