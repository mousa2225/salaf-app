import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, doc, deleteDoc, onSnapshot, writeBatch,
  getDoc, updateDoc, setDoc, query, where, getDocs,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Loader2 } from 'lucide-react';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Advances from './pages/Advances';
import Deductions from './pages/Deductions';
import Statement from './pages/Statement';
import Reports from './pages/Reports';
import UsersPage from './pages/Users';
import Layout, { PermissionDenied } from './components/Layout';
import Toast from './components/Toast';

import { uid, todayISO, addMonths, can } from './lib/utils';

export default function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setProfileLoading(true);
        try {
          const profileDoc = await getDoc(doc(db, 'userOrgMap', u.uid));
          if (profileDoc.exists()) {
            setUserProfile({ uid: u.uid, email: u.email, ...profileDoc.data() });
          } else {
            // No profile yet (could happen with stale account) — sign out
            setUserProfile(null);
          }
        } catch (e) {
          console.error('profile load failed', e);
          setUserProfile(null);
        }
        setProfileLoading(false);
      } else {
        setUserProfile(null);
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  if (!authReady || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin accent-emerald" />
      </div>
    );
  }

  if (!user) return <Login />;
  if (!userProfile) return <ProfileMissing user={user} />;
  return <MainApp user={userProfile} />;
}

function ProfileMissing({ user }) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const checkForInvitation = async () => {
    setError('');
    setInfo('');
    setChecking(true);
    try {
      const emailLower = user.email.trim().toLowerCase();
      const invSnap = await getDocs(query(
        collection(db, 'invitations'),
        where('email', '==', emailLower),
        limit(1),
      ));

      if (invSnap.empty) {
        setError('🚫 لم نجد لك دعوة. اطلب من الأدمن إنشاء دعوة بالبريد ' + emailLower);
        setChecking(false);
        return;
      }

      const invDoc = invSnap.docs[0];
      const invitationData = invDoc.data();
      const invitationOrgId = invitationData.orgId;
      const uid = user.uid;
      const name = user.displayName || emailLower.split('@')[0];

      // Link to org
      await setDoc(doc(db, 'userOrgMap', uid), {
        orgId: invitationOrgId,
        role: invitationData.role || 'member',
        permissions: invitationData.permissions || [],
        displayName: name,
        email: emailLower,
        isAdmin: invitationData.isAdmin || false,
        createdAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'orgs', invitationOrgId, 'members', uid), {
        uid,
        email: emailLower,
        displayName: name,
        role: invitationData.role || 'member',
        permissions: invitationData.permissions || [],
        isAdmin: invitationData.isAdmin || false,
        createdAt: new Date().toISOString(),
      });
      // delete invitation
      try { await deleteDoc(doc(db, 'invitations', invDoc.id)); } catch { /* ignore */ }

      setInfo('✅ تم تفعيل حسابك! جاري إعادة التحميل...');
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      console.error('Activation failed:', e);
      setError('فشل التفعيل: ' + (e.message || 'خطأ غير معروف'));
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card rounded-lg p-7 max-w-md w-full text-center">
        <div className="text-5xl mb-3">🔒</div>
        <h2 className="display text-xl font-bold ink mb-3">حسابك غير مفعّل</h2>
        <p className="ink-muted text-sm mb-5">
          البريد <span className="font-semibold ink num">{user.email}</span> غير مرتبط بأي منشأة.
        </p>

        <div className="p-3 rounded-md text-sm mb-4 text-right" style={{ background: '#FBF4F1', color: '#8B2635' }}>
          ⚠️ إذا كان الأدمن دعاك للنظام، اضغط الزر بالأسفل للبحث عن الدعوة وتفعيل حسابك تلقائياً.
        </div>

        {error && (
          <div className="p-3 rounded-md text-sm mb-3 text-right" style={{ background: '#FBF4F1', color: '#8B2635' }}>
            {error}
          </div>
        )}

        {info && (
          <div className="p-3 rounded-md text-sm mb-3 text-right" style={{ background: '#F4F8F5', color: '#1F4D3F' }}>
            {info}
          </div>
        )}

        <button
          onClick={checkForInvitation}
          disabled={checking}
          className="btn-primary w-full py-2.5 rounded-md text-sm font-medium mb-2"
        >
          {checking ? '⏳ جاري البحث عن دعوتك...' : '🔍 ابحث عن دعوتي وفعّل حسابي'}
        </button>

        <button
          onClick={() => signOut(auth)}
          className="btn-ghost w-full py-2 rounded-md text-sm"
        >
          تسجيل خروج
        </button>
      </div>
    </div>
  );
}

function MainApp({ user }) {
  const orgId = user.orgId;
  const [employees, setEmployees] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('dashboard');
  const [toast, setToast] = useState(null);

  // Firestore collection refs
  const empCol = collection(db, 'orgs', orgId, 'employees');
  const txCol = collection(db, 'orgs', orgId, 'transactions');
  const instCol = collection(db, 'orgs', orgId, 'installments');
  const memberCol = collection(db, 'orgs', orgId, 'members');
  const invCol = collection(db, 'invitations');

  // Realtime subscriptions
  useEffect(() => {
    let loadedFlags = { emp: false, tx: false, inst: false, mem: false, inv: false };
    const check = () => { if (Object.values(loadedFlags).every(Boolean)) setLoading(false); };

    const unsubs = [
      onSnapshot(empCol, (snap) => {
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        loadedFlags.emp = true; check();
      }, (e) => { console.error(e); loadedFlags.emp = true; check(); }),

      onSnapshot(txCol, (snap) => {
        setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        loadedFlags.tx = true; check();
      }, (e) => { console.error(e); loadedFlags.tx = true; check(); }),

      onSnapshot(instCol, (snap) => {
        setInstallments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        loadedFlags.inst = true; check();
      }, (e) => { console.error(e); loadedFlags.inst = true; check(); }),

      onSnapshot(memberCol, (snap) => {
        setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        loadedFlags.mem = true; check();
      }, (e) => { console.error(e); loadedFlags.mem = true; check(); }),
    ];

    // Only admin can see invitations
    if (user.isAdmin) {
      const unsubInv = onSnapshot(
        query(invCol, where('orgId', '==', orgId)),
        (snap) => {
          setInvitations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          loadedFlags.inv = true; check();
        },
        (e) => { console.error(e); loadedFlags.inv = true; check(); }
      );
      unsubs.push(unsubInv);
    } else {
      loadedFlags.inv = true; check();
    }

    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line
  }, [orgId, user.isAdmin]);

  const showToast = useCallback((message, kind = 'success') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ==== Derived ====
  const empById = useMemo(() => {
    const m = {};
    employees.forEach((e) => (m[e.id] = e));
    return m;
  }, [employees]);

  const empByIqama = useMemo(() => {
    const m = {};
    employees.forEach((e) => { if (e.iqama) m[String(e.iqama).trim()] = e; });
    return m;
  }, [employees]);

  const balances = useMemo(() => {
    const m = {};
    for (const e of employees) m[e.id] = 0;
    for (const t of transactions) {
      if (!(t.employeeId in m)) continue;
      m[t.employeeId] += t.type === 'advance' ? Number(t.amount) : -Number(t.amount);
    }
    return m;
  }, [employees, transactions]);

  // ==== Employee ====
  const addEmployee = async (data) => {
    if (!data.name?.trim() || !data.iqama?.toString().trim()) {
      showToast('الاسم ورقم الإقامة مطلوبان', 'error');
      return null;
    }
    if (empByIqama[String(data.iqama).trim()]) {
      showToast('يوجد موظف بنفس رقم الإقامة', 'error');
      return null;
    }
    const id = uid();
    const payload = {
      name: data.name.trim(),
      iqama: String(data.iqama).trim(),
      phone: data.phone?.toString().trim() || '',
      position: data.position?.trim() || '',
      department: data.department?.trim() || '',
      salary: Number(data.salary) || 0,
      hireDate: data.hireDate || '',
      status: data.status || 'active',
      maxAdvanceRatio: Number(data.maxAdvanceRatio) || 0.5, // 50%
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
    };
    try {
      await setDoc(doc(empCol, id), payload);
      return { id, ...payload };
    } catch (e) {
      console.error(e);
      showToast('فشل الحفظ', 'error');
      return null;
    }
  };

  const updateEmployee = async (id, data) => {
    try {
      const payload = {
        name: data.name?.trim(),
        iqama: String(data.iqama || '').trim(),
        phone: data.phone?.toString().trim() || '',
        position: data.position?.trim() || '',
        department: data.department?.trim() || '',
        salary: Number(data.salary) || 0,
        hireDate: data.hireDate || '',
        status: data.status || 'active',
        maxAdvanceRatio: Number(data.maxAdvanceRatio) || 0.5,
        updatedAt: new Date().toISOString(),
      };
      await updateDoc(doc(empCol, id), payload);
      showToast('تم التعديل');
      return true;
    } catch (e) {
      console.error(e);
      showToast('فشل التعديل', 'error');
      return false;
    }
  };

  const deleteEmployee = async (id) => {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(empCol, id));
      transactions.filter((t) => t.employeeId === id).forEach((t) => batch.delete(doc(txCol, t.id)));
      installments.filter((i) => i.employeeId === id).forEach((i) => batch.delete(doc(instCol, i.id)));
      await batch.commit();
      showToast('تم حذف الموظف وحركاته');
    } catch (e) {
      console.error(e);
      showToast('فشل الحذف', 'error');
    }
  };

  // ==== Transaction (advance/deduction) ====
  const addTransaction = async (tx) => {
    if (!tx.employeeId || !tx.amount || Number(tx.amount) <= 0) {
      showToast('يجب تحديد الموظف ومبلغ صحيح', 'error');
      return false;
    }
    const txId = uid();
    const newTx = {
      employeeId: tx.employeeId,
      type: tx.type,
      amount: Number(tx.amount),
      date: tx.date || todayISO(),
      deductionType: tx.deductionType || null,
      notes: tx.notes || '',
      relatedAdvanceId: tx.relatedAdvanceId || null,
      installmentPlanId: tx.installmentPlanId || null,
      voucherNo: tx.voucherNo || generateVoucherNo(tx.type),
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(txCol, txId), newTx);

      // If advance with installment plan, create the schedule
      if (tx.type === 'advance' && tx.installments && Number(tx.installments) > 1) {
        const planId = uid();
        const n = Number(tx.installments);
        const monthlyAmount = Math.round((Number(tx.amount) / n) * 100) / 100;
        const startDate = tx.firstInstallmentDate || addMonths(tx.date || todayISO(), 1);

        batch.update(doc(txCol, txId), { installmentPlanId: planId });

        for (let i = 0; i < n; i++) {
          const instId = uid();
          batch.set(doc(instCol, instId), {
            planId,
            advanceId: txId,
            employeeId: tx.employeeId,
            installmentNo: i + 1,
            totalInstallments: n,
            amount: i === n - 1
              ? Math.round((Number(tx.amount) - monthlyAmount * (n - 1)) * 100) / 100
              : monthlyAmount,
            dueDate: addMonths(startDate, i),
            status: 'pending', // pending | paid | skipped
            deductionType: tx.installmentDeductionType || 'من الراتب الشهري',
            createdAt: new Date().toISOString(),
          });
        }
      }

      await batch.commit();
      return true;
    } catch (e) {
      console.error(e);
      showToast('فشل الحفظ', 'error');
      return false;
    }
  };

  const updateTransaction = async (id, data) => {
    try {
      await updateDoc(doc(txCol, id), {
        amount: Number(data.amount),
        date: data.date,
        deductionType: data.deductionType || null,
        notes: data.notes || '',
        updatedAt: new Date().toISOString(),
      });
      showToast('تم التعديل');
      return true;
    } catch (e) {
      console.error(e);
      showToast('فشل التعديل', 'error');
      return false;
    }
  };

  const deleteTransaction = async (id) => {
    try {
      await deleteDoc(doc(txCol, id));
      showToast('تم الحذف');
    } catch (e) {
      console.error(e);
      showToast('فشل الحذف', 'error');
    }
  };

  // Mark installment as paid (creates deduction transaction)
  const payInstallment = async (inst) => {
    try {
      const batch = writeBatch(db);
      const txId = uid();
      batch.set(doc(txCol, txId), {
        employeeId: inst.employeeId,
        type: 'deduction',
        amount: Number(inst.amount),
        date: todayISO(),
        deductionType: inst.deductionType || 'من الراتب الشهري',
        notes: `قسط ${inst.installmentNo}/${inst.totalInstallments}`,
        relatedAdvanceId: inst.advanceId,
        installmentPlanId: inst.planId,
        voucherNo: generateVoucherNo('deduction'),
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
      });
      batch.update(doc(instCol, inst.id), {
        status: 'paid',
        paidAt: new Date().toISOString(),
        paidTransactionId: txId,
      });
      await batch.commit();
      showToast(`تم تسجيل القسط ${inst.installmentNo}/${inst.totalInstallments}`);
      return true;
    } catch (e) {
      console.error(e);
      showToast('فشل تسجيل القسط', 'error');
      return false;
    }
  };

  const updateInstallment = async (id, data) => {
    try {
      await updateDoc(doc(instCol, id), data);
      return true;
    } catch (e) { console.error(e); return false; }
  };

  // Voucher numbering
  const generateVoucherNo = (type) => {
    const prefix = type === 'advance' ? 'A' : 'D';
    const list = transactions.filter((t) => t.type === type);
    const num = list.length + 1;
    return `${prefix}-${String(num).padStart(5, '0')}`;
  };

  // ==== Users / Invitations (admin) ====
  const inviteUser = async ({ email, displayName, role, permissions }) => {
    const emailLower = email.trim().toLowerCase();
    if (!emailLower) { showToast('البريد مطلوب', 'error'); return false; }

    // Check existing member
    if (members.some((m) => m.email === emailLower)) {
      showToast('هذا البريد عضو بالفعل', 'error');
      return false;
    }
    // Check existing invitation
    const dup = invitations.find((i) => i.email === emailLower);
    if (dup) {
      showToast('يوجد دعوة سابقة لهذا البريد', 'error');
      return false;
    }

    try {
      const invId = uid();
      await setDoc(doc(invCol, invId), {
        invId,
        email: emailLower,
        displayName: displayName?.trim() || '',
        orgId,
        role: role || 'member',
        permissions: permissions || [],
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
      });
      showToast('تم إنشاء الدعوة. أعطِ المستخدم البريد ليسجّل بنفسه');
      return true;
    } catch (e) {
      console.error(e);
      showToast('فشل إنشاء الدعوة', 'error');
      return false;
    }
  };

  const updateMemberPermissions = async (memberUid, { role, permissions, isAdmin }) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(memberCol, memberUid), {
        role: role || 'member',
        permissions: permissions || [],
        isAdmin: isAdmin || false,
        updatedAt: new Date().toISOString(),
      });
      batch.update(doc(db, 'userOrgMap', memberUid), {
        role: role || 'member',
        permissions: permissions || [],
        isAdmin: isAdmin || false,
        updatedAt: new Date().toISOString(),
      });
      await batch.commit();
      showToast('تم تحديث الصلاحيات');
      return true;
    } catch (e) {
      console.error(e);
      showToast('فشل التحديث', 'error');
      return false;
    }
  };

  const removeMember = async (memberUid) => {
    if (memberUid === user.uid) {
      showToast('لا يمكنك حذف نفسك', 'error');
      return false;
    }
    try {
      const batch = writeBatch(db);
      batch.delete(doc(memberCol, memberUid));
      batch.delete(doc(db, 'userOrgMap', memberUid));
      await batch.commit();
      showToast('تم إزالة العضو. ملاحظة: حذف حسابه من Firebase Auth يتم من Firebase Console.');
      return true;
    } catch (e) {
      console.error(e);
      showToast('فشل الإزالة', 'error');
      return false;
    }
  };

  const removeInvitation = async (invId) => {
    try {
      await deleteDoc(doc(invCol, invId));
      showToast('تم حذف الدعوة');
    } catch (e) {
      console.error(e);
      showToast('فشل الحذف', 'error');
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin accent-emerald" />
          <div className="ink-muted">جاري تحميل البيانات...</div>
        </div>
      </div>
    );
  }

  // Page routing with permission checks
  const pageProps = {
    user, employees, transactions, installments, members, invitations,
    empById, empByIqama, balances, showToast, setPage,
    addEmployee, updateEmployee, deleteEmployee,
    addTransaction, updateTransaction, deleteTransaction,
    payInstallment, updateInstallment,
    inviteUser, updateMemberPermissions, removeMember, removeInvitation,
  };

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return can(user, 'VIEW_DASHBOARD') ? <Dashboard {...pageProps} /> : <PermissionDenied permName="عرض الرئيسية" />;
      case 'employees':
        return can(user, 'VIEW_EMPLOYEES') ? <Employees {...pageProps} /> : <PermissionDenied permName="عرض الموظفين" />;
      case 'advances':
        return can(user, 'VIEW_ADVANCES') ? <Advances {...pageProps} /> : <PermissionDenied permName="عرض السلف" />;
      case 'deductions':
        return can(user, 'VIEW_DEDUCTIONS') ? <Deductions {...pageProps} /> : <PermissionDenied permName="عرض الخصومات" />;
      case 'statement':
        return can(user, 'VIEW_STATEMENT') ? <Statement {...pageProps} /> : <PermissionDenied permName="عرض كشف الحساب" />;
      case 'reports':
        return can(user, 'VIEW_REPORTS') ? <Reports {...pageProps} /> : <PermissionDenied permName="التقارير" />;
      case 'users':
        return can(user, 'MANAGE_USERS') ? <UsersPage {...pageProps} /> : <PermissionDenied permName="إدارة المستخدمين" />;
      default:
        return <Dashboard {...pageProps} />;
    }
  };

  return (
    <>
      <Layout user={user} currentPage={page} setPage={setPage}>
        {renderPage()}
      </Layout>
      <Toast toast={toast} />
    </>
  );
}
