import { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from './firebase';
import { BookOpen, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

export default function Login() {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (password.length < 6) {
          setError('كلمة السر يجب أن تكون 6 أحرف على الأقل');
          setLoading(false);
          return;
        }
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      const code = err.code || '';
      const messages = {
        'auth/invalid-email': 'البريد الإلكتروني غير صحيح',
        'auth/user-not-found': 'لا يوجد حساب بهذا البريد',
        'auth/wrong-password': 'كلمة السر خاطئة',
        'auth/invalid-credential': 'البريد أو كلمة السر غير صحيحة',
        'auth/email-already-in-use': 'البريد مستخدم مسبقًا',
        'auth/weak-password': 'كلمة السر ضعيفة',
        'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقًا',
      };
      setError(messages[code] || 'حدث خطأ، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center px-4" style={{ background: '#F7F3E9', fontFamily: 'Tajawal, system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&family=Amiri:wght@400;700&display=swap');
        .display { font-family: 'Amiri', 'Tajawal', serif; }
      `}</style>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-xl items-center justify-center mb-4" style={{ background: '#1F4D3F' }}>
            <BookOpen size={28} color="#F7F3E9" />
          </div>
          <h1 className="display text-3xl font-bold" style={{ color: '#1C1917' }}>دفتر السلف</h1>
          <p className="text-sm mt-1" style={{ color: '#78716C' }}>نظام إدارة سلف الموظفين</p>
        </div>

        <div className="rounded-lg p-7 border" style={{ background: '#FFFEF9', borderColor: '#E8DFC8' }}>
          <h2 className="display text-xl font-bold mb-5" style={{ color: '#1C1917' }}>
            {mode === 'signin' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs block mb-1.5" style={{ color: '#78716C' }}>البريد الإلكتروني</label>
              <div className="relative">
                <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#78716C' }} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pr-10 pl-3 py-2.5 rounded-md border outline-none transition-colors"
                  style={{ background: '#FFFEF9', borderColor: '#D6CBA8', color: '#1C1917' }}
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <div>
              <label className="text-xs block mb-1.5" style={{ color: '#78716C' }}>كلمة السر</label>
              <div className="relative">
                <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#78716C' }} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pr-10 pl-3 py-2.5 rounded-md border outline-none"
                  style={{ background: '#FFFEF9', borderColor: '#D6CBA8', color: '#1C1917' }}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md text-sm" style={{ background: '#FBF4F1', color: '#8B2635' }}>
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: '#1F4D3F', color: '#F7F3E9' }}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {mode === 'signin' ? 'دخول' : 'إنشاء الحساب'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t text-center text-sm" style={{ borderColor: '#E8DFC8', color: '#78716C' }}>
            {mode === 'signin' ? (
              <>
                ليس لديك حساب؟{' '}
                <button onClick={() => { setMode('signup'); setError(''); }} className="font-semibold" style={{ color: '#1F4D3F' }}>
                  أنشئ حساب
                </button>
              </>
            ) : (
              <>
                لديك حساب؟{' '}
                <button onClick={() => { setMode('signin'); setError(''); }} className="font-semibold" style={{ color: '#1F4D3F' }}>
                  سجّل دخول
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: '#78716C' }}>
          🔒 بياناتك محفوظة بأمان في Firebase
        </p>
      </div>
    </div>
  );
}
