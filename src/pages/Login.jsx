import { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  doc, setDoc, deleteDoc, collection, getDocs, query, where, limit,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { BookOpen, Lock, Mail, AlertCircle, Loader2, User } from 'lucide-react';
import { ADMIN_PERMISSIONS } from '../lib/utils';

export default function Login() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    await signInWithEmailAndPassword(auth, email, password);
    // The App will pick up the auth state automatically
  };

  const handleSignUp = async () => {
    if (password.length < 6) {
      setError('كلمة السر يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (!displayName.trim()) {
      setError('الاسم مطلوب');
      return;
    }
    const emailLower = email.trim().toLowerCase();

    // STEP 1: Create the auth account FIRST.
    // This is needed because Firestore rules require auth to read invitations.
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, emailLower, password);
    } catch (e) {
      throw e; // bubble up auth errors
    }
    const uid = cred.user.uid;

    // STEP 2: Now that we're authenticated, look for an invitation
    let invitationOrgId = null;
    let invitationData = null;
    let invitationDocId = null;
    try {
      const invSnap = await getDocs(query(
        collection(db, 'invitations'),
        where('email', '==', emailLower),
        limit(1),
      ));
      if (!invSnap.empty) {
        const invDoc = invSnap.docs[0];
        invitationData = invDoc.data();
        invitationOrgId = invitationData.orgId;
        invitationDocId = invDoc.id;
      }
    } catch (e) {
      console.error('Invitation lookup failed:', e);
      // delete the newly created auth account since we can't proceed
      try { await cred.user.delete(); } catch { /* ignore */ }
      throw new Error('INV_READ_FAILED');
    }

    // STEP 3: If invitation found, link the user to the org
    if (invitationOrgId && invitationData) {
      try {
        await setDoc(doc(db, 'userOrgMap', uid), {
          orgId: invitationOrgId,
          role: invitationData.role || 'member',
          permissions: invitationData.permissions || [],
          displayName: displayName.trim(),
          email: emailLower,
          isAdmin: invitationData.isAdmin || false,
          createdAt: new Date().toISOString(),
        });
        await setDoc(doc(db, 'orgs', invitationOrgId, 'members', uid), {
          uid,
          email: emailLower,
          displayName: displayName.trim(),
          role: invitationData.role || 'member',
          permissions: invitationData.permissions || [],
          isAdmin: invitationData.isAdmin || false,
          createdAt: new Date().toISOString(),
        });
        // delete the invitation
        if (invitationDocId) {
          try { await deleteDoc(doc(db, 'invitations', invitationDocId)); }
          catch { /* ignore */ }
        }
        // success — App.jsx will detect the new profile
      } catch (e) {
        console.error('Org linking failed:', e);
        try { await cred.user.delete(); } catch { /* ignore */ }
        throw new Error('LINK_FAILED');
      }
    } else {
      // STEP 4: No invitation found — reject and delete the auth account
      try { await cred.user.delete(); } catch { /* ignore */ }
      throw new Error('NO_INVITATION');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signin') await handleSignIn();
      else await handleSignUp();
    } catch (err) {
      // Special cases
      if (err.message === 'NO_INVITATION') {
        setError('🚫 لا يوجد دعوة لهذا البريد. اطلب من الأدمن أن يدعوك أولاً بنفس البريد بالضبط.');
        setLoading(false);
        return;
      }
      if (err.message === 'INV_READ_FAILED') {
        setError('⚠️ فشل التحقق من الدعوة. تأكد من إعدادات قاعدة البيانات أو تواصل مع الأدمن.');
        setLoading(false);
        return;
      }
      if (err.message === 'LINK_FAILED') {
        setError('⚠️ فشل ربط حسابك بالمنشأة. تواصل مع الأدمن.');
        setLoading(false);
        return;
      }

      const code = err.code || '';
      const messages = {
        'auth/invalid-email': 'البريد الإلكتروني غير صحيح',
        'auth/user-not-found': 'لا يوجد حساب بهذا البريد',
        'auth/wrong-password': 'كلمة السر خاطئة',
        'auth/invalid-credential': 'البريد أو كلمة السر غير صحيحة',
        'auth/email-already-in-use': 'البريد مستخدم مسبقًا، سجّل دخول بدلاً من إنشاء حساب',
        'auth/weak-password': 'كلمة السر ضعيفة (6 أحرف على الأقل)',
        'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقًا',
      };
      setError(messages[code] || err.message || 'حدث خطأ، حاول مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-xl items-center justify-center mb-4" style={{ background: '#1F4D3F' }}>
            <BookOpen size={28} color="#F7F3E9" />
          </div>
          <h1 className="display text-3xl font-bold ink">دفتر السلف <span className="text-base ink-muted">Pro</span></h1>
          <p className="text-sm mt-1 ink-muted">نظام محاسبي احترافي لإدارة سلف الموظفين</p>
        </div>

        <div className="card rounded-lg p-7">
          <h2 className="display text-xl font-bold mb-5 ink">
            {mode === 'signin' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-xs ink-muted block mb-1.5">الاسم الكامل</label>
                <div className="relative">
                  <User size={16} className="absolute right-3 top-1/2 -translate-y-1/2 ink-muted" />
                  <input
                    type="text" required value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="input-base pr-10"
                    placeholder="مثال: محمد أحمد"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs ink-muted block mb-1.5">البريد الإلكتروني</label>
              <div className="relative">
                <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 ink-muted" />
                <input
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-base pr-10" placeholder="email@example.com"
                />
              </div>
            </div>

            <div>
              <label className="text-xs ink-muted block mb-1.5">كلمة السر</label>
              <div className="relative">
                <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 ink-muted" />
                <input
                  type="password" required value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-base pr-10" placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md text-sm" style={{ background: '#FBF4F1', color: '#8B2635' }}>
                <AlertCircle size={16} /> {error}
              </div>
            )}

            {mode === 'signup' && (
              <div className="text-xs ink-muted bg-stone-50 p-3 rounded-md border divider">
                💡 إذا تم دعوتك من قِبَل أدمن، سجّل بنفس البريد الذي أُرسلت إليه الدعوة لتحصل على الصلاحيات تلقائياً.
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="btn-primary w-full py-2.5 rounded-md text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {mode === 'signin' ? 'دخول' : 'إنشاء الحساب'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t divider text-center text-sm ink-muted">
            {mode === 'signin' ? (
              <>ليس لديك حساب؟ <button onClick={() => { setMode('signup'); setError(''); }} className="font-semibold accent-emerald">أنشئ حساب</button></>
            ) : (
              <>لديك حساب؟ <button onClick={() => { setMode('signin'); setError(''); }} className="font-semibold accent-emerald">سجّل دخول</button></>
            )}
          </div>
        </div>

        <p className="text-center text-xs mt-4 ink-muted">🔒 بياناتك محفوظة بأمان في Firebase</p>
      </div>
    </div>
  );
}
