import React, { useState, useEffect, useMemo, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './Login';
import {
  Users, Plus, Download, Upload, FileText, Wallet,
  Calendar, Trash2, Search, X, Home, AlertCircle, CheckCircle,
  UserPlus, FileSpreadsheet, BookOpen, LogOut, Loader2,
  ArrowDownCircle, ArrowUpCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ============== Helpers ==============
const fmt = (n) => {
  const num = Number(n) || 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const fmtDate = (d) => {
  try {
    return new Date(d).toLocaleDateString('ar-SA-u-ca-gregory', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return d; }
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKeyOf = (d) => new Date(d).toISOString().slice(0, 7);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthLabel = (ym) => {
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('ar-SA-u-ca-gregory', { month: 'long', year: 'numeric' });
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const DEDUCTION_TYPES = [
  'من الراتب الشهري',
  'من رصيد الإجازة',
  'من مكافأة نهاية الخدمة',
  'من الساعات الإضافية',
  'من المكافأة / البونص',
  'تسديد نقدي مباشر',
  'أخرى',
];

const findCol = (row, candidates) => {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const k = keys.find(
      (x) => x && x.toString().trim().toLowerCase() === cand.toLowerCase()
    );
    if (k) return row[k];
  }
  for (const cand of candidates) {
    const k = keys.find((x) =>
      x && x.toString().toLowerCase().includes(cand.toLowerCase())
    );
    if (k) return row[k];
  }
  return undefined;
};

const COL_NAME = ['اسم الموظف', 'الاسم', 'name', 'employee', 'موظف'];
const COL_IQAMA = ['رقم الإقامة', 'الإقامة', 'iqama', 'id', 'هوية', 'الهوية'];
const COL_PHONE = ['رقم الجوال', 'الجوال', 'phone', 'mobile', 'الهاتف'];
const COL_POS = ['الوظيفة', 'المسمى', 'position', 'job', 'title'];
const COL_AMOUNT = ['المبلغ', 'مبلغ السلفة', 'amount', 'value', 'سلفة'];
const COL_DEDUCT_AMOUNT = ['المبلغ', 'المبلغ المخصوم', 'amount', 'خصم', 'الخصم'];
const COL_DEDUCT_TYPE = ['نوع الخصم', 'الخصم', 'type', 'النوع', 'مصدر الخصم'];
const COL_DATE = ['التاريخ', 'date', 'يوم'];
const COL_NOTES = ['ملاحظات', 'notes', 'بيان', 'الملاحظات'];

// ============== App Root ==============
export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  if (!authReady) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center" style={{ background: '#F7F3E9' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: '#1F4D3F' }} />
      </div>
    );
  }

  if (!user) return <Login />;
  return <MainApp user={user} />;
}

// ============== Main App ==============
function MainApp({ user }) {
  const [employees, setEmployees] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [toast, setToast] = useState(null);

  // Firestore paths
  const empCol = collection(db, 'users', user.uid, 'employees');
  const txCol = collection(db, 'users', user.uid, 'transactions');

  // Realtime subscriptions
  useEffect(() => {
    let empLoaded = false, txLoaded = false;
    const checkLoaded = () => { if (empLoaded && txLoaded) setLoading(false); };

    const unsubEmp = onSnapshot(empCol, (snap) => {
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      empLoaded = true; checkLoaded();
    }, (err) => { console.error(err); empLoaded = true; checkLoaded(); });

    const unsubTx = onSnapshot(txCol, (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      txLoaded = true; checkLoaded();
    }, (err) => { console.error(err); txLoaded = true; checkLoaded(); });

    return () => { unsubEmp(); unsubTx(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  const showToast = (message, kind = 'success') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  };

  // ===== Derived =====
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

  const totals = useMemo(() => {
    let totalAdvances = 0, totalDeductions = 0;
    for (const t of transactions) {
      if (t.type === 'advance') totalAdvances += Number(t.amount);
      else totalDeductions += Number(t.amount);
    }
    return { totalAdvances, totalDeductions, outstanding: totalAdvances - totalDeductions };
  }, [transactions]);

  // ===== Handlers =====
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
    const newEmp = {
      name: data.name.trim(),
      iqama: String(data.iqama).trim(),
      phone: data.phone?.toString().trim() || '',
      position: data.position?.trim() || '',
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(empCol, id), newEmp);
      return { id, ...newEmp };
    } catch (e) {
      console.error(e);
      showToast('فشل الحفظ في القاعدة', 'error');
      return null;
    }
  };

  const deleteEmployee = async (id) => {
    if (!confirm('حذف الموظف؟ سيتم حذف جميع حركاته أيضًا.')) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(empCol, id));
      transactions.filter((t) => t.employeeId === id).forEach((t) => {
        batch.delete(doc(txCol, t.id));
      });
      await batch.commit();
      showToast('تم حذف الموظف وحركاته');
    } catch (e) {
      console.error(e);
      showToast('فشل الحذف', 'error');
    }
  };

  const addTransaction = async (tx) => {
    if (!tx.employeeId || !tx.amount || Number(tx.amount) <= 0) {
      showToast('يجب تحديد الموظف ومبلغ صحيح', 'error');
      return false;
    }
    const id = uid();
    const newTx = {
      employeeId: tx.employeeId,
      type: tx.type,
      amount: Number(tx.amount),
      date: tx.date || todayISO(),
      deductionType: tx.deductionType || null,
      notes: tx.notes || '',
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(txCol, id), newTx);
      return true;
    } catch (e) {
      console.error(e);
      showToast('فشل الحفظ', 'error');
      return false;
    }
  };

  const deleteTransaction = async (id) => {
    if (!confirm('حذف هذه الحركة؟')) return;
    try {
      await deleteDoc(doc(txCol, id));
      showToast('تم حذف الحركة');
    } catch (e) {
      console.error(e);
      showToast('فشل الحذف', 'error');
    }
  };

  // ===== Excel Import: employees + advances =====
  const importEmployeesAdvances = async (file) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      let created = 0, updated = 0, advAdded = 0, errors = 0;
      const localByIqama = { ...empByIqama };
      const batch = writeBatch(db);

      for (const row of rows) {
        const name = (findCol(row, COL_NAME) || '').toString().trim();
        const iqama = (findCol(row, COL_IQAMA) || '').toString().trim();
        const phone = (findCol(row, COL_PHONE) || '').toString().trim();
        const position = (findCol(row, COL_POS) || '').toString().trim();
        const amount = Number(findCol(row, COL_AMOUNT) || 0);

        if (!name || !iqama) { errors++; continue; }

        let emp = localByIqama[iqama];
        if (!emp) {
          const empId = uid();
          emp = {
            id: empId, name, iqama, phone, position,
            createdAt: new Date().toISOString(),
          };
          batch.set(doc(empCol, empId), {
            name, iqama, phone, position, createdAt: emp.createdAt,
          });
          localByIqama[iqama] = emp;
          created++;
        } else {
          if ((phone && !emp.phone) || (position && !emp.position)) {
            batch.set(doc(empCol, emp.id), {
              name: emp.name,
              iqama: emp.iqama,
              phone: emp.phone || phone,
              position: emp.position || position,
              createdAt: emp.createdAt,
            }, { merge: true });
          }
          updated++;
        }

        if (amount > 0) {
          const txId = uid();
          batch.set(doc(txCol, txId), {
            employeeId: emp.id,
            type: 'advance',
            amount,
            date: todayISO(),
            deductionType: null,
            notes: 'رصيد افتتاحي من الاستيراد',
            createdAt: new Date().toISOString(),
          });
          advAdded++;
        }
      }

      await batch.commit();
      showToast(`تم: ${created} جديد، ${updated} محدث، ${advAdded} سلفة، ${errors} متجاهل`);
    } catch (e) {
      console.error(e);
      showToast('فشل قراءة الملف. تأكد من التنسيق', 'error');
    }
  };

  // ===== Excel Import: deductions =====
  const importDeductions = async (file) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      let added = 0, errors = 0, autoCreated = 0;
      const localByIqama = { ...empByIqama };
      const batch = writeBatch(db);

      for (const row of rows) {
        const name = (findCol(row, COL_NAME) || '').toString().trim();
        const iqama = (findCol(row, COL_IQAMA) || '').toString().trim();
        const amount = Number(findCol(row, COL_DEDUCT_AMOUNT) || 0);
        const dtype = (findCol(row, COL_DEDUCT_TYPE) || 'من الراتب الشهري').toString().trim();
        const dateRaw = findCol(row, COL_DATE);
        const notes = (findCol(row, COL_NOTES) || '').toString().trim();

        if (!iqama || amount <= 0) { errors++; continue; }

        let emp = localByIqama[iqama];
        if (!emp) {
          if (!name) { errors++; continue; }
          const empId = uid();
          emp = { id: empId, name, iqama, phone: '', position: '', createdAt: new Date().toISOString() };
          batch.set(doc(empCol, empId), {
            name, iqama, phone: '', position: '',
            createdAt: emp.createdAt,
          });
          localByIqama[iqama] = emp;
          autoCreated++;
        }

        let date = todayISO();
        if (dateRaw) {
          if (typeof dateRaw === 'number') {
            const d = XLSX.SSF.parse_date_code(dateRaw);
            if (d) date = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
          } else {
            const parsed = new Date(dateRaw);
            if (!isNaN(parsed)) date = parsed.toISOString().slice(0, 10);
          }
        }

        const txId = uid();
        batch.set(doc(txCol, txId), {
          employeeId: emp.id,
          type: 'deduction',
          amount,
          date,
          deductionType: dtype,
          notes,
          createdAt: new Date().toISOString(),
        });
        added++;
      }

      await batch.commit();
      showToast(`تم تسجيل ${added} خصم. ${autoCreated} موظف جديد. ${errors} متجاهل`);
    } catch (e) {
      console.error(e);
      showToast('فشل قراءة الملف. تأكد من التنسيق', 'error');
    }
  };

  // ===== Templates =====
  const downloadTemplate = (kind) => {
    let data, name;
    if (kind === 'employees') {
      data = [{
        'اسم الموظف': 'محمد أحمد',
        'رقم الإقامة': '2123456789',
        'رقم الجوال': '0500000000',
        'الوظيفة': 'فني',
        'مبلغ السلفة': 1000,
      }];
      name = 'قالب_الموظفين_والسلف.xlsx';
    } else {
      data = [{
        'اسم الموظف': 'محمد أحمد',
        'رقم الإقامة': '2123456789',
        'المبلغ': 500,
        'نوع الخصم': 'من الراتب الشهري',
        'التاريخ': todayISO(),
        'ملاحظات': '',
      }];
      name = 'قالب_الخصومات.xlsx';
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'البيانات');
    XLSX.writeFile(wb, name);
  };

  const exportStatement = (empId) => {
    const emp = empById[empId];
    if (!emp) return;
    const txs = transactions
      .filter((t) => t.employeeId === empId)
      .sort((a, b) => a.date.localeCompare(b.date));

    let running = 0;
    const rows = txs.map((t) => {
      const isAdv = t.type === 'advance';
      running += isAdv ? Number(t.amount) : -Number(t.amount);
      return {
        'التاريخ': t.date,
        'البيان': isAdv ? 'سلفة' : `خصم - ${t.deductionType || ''}`,
        'مدين (سلفة)': isAdv ? Number(t.amount) : '',
        'دائن (خصم)': isAdv ? '' : Number(t.amount),
        'الرصيد': running,
        'ملاحظات': t.notes || '',
      };
    });

    rows.push({});
    rows.push({
      'التاريخ': 'الرصيد المستحق',
      'البيان': '',
      'مدين (سلفة)': '',
      'دائن (خصم)': '',
      'الرصيد': running,
      'ملاحظات': '',
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 25 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'كشف حساب');

    const info = [
      { 'البيان': 'اسم الموظف', 'القيمة': emp.name },
      { 'البيان': 'رقم الإقامة', 'القيمة': emp.iqama },
      { 'البيان': 'الوظيفة', 'القيمة': emp.position || '-' },
      { 'البيان': 'الجوال', 'القيمة': emp.phone || '-' },
      { 'البيان': 'تاريخ الكشف', 'القيمة': todayISO() },
      { 'البيان': 'إجمالي السلف', 'القيمة': txs.filter(t=>t.type==='advance').reduce((s,t)=>s+Number(t.amount),0) },
      { 'البيان': 'إجمالي المخصوم', 'القيمة': txs.filter(t=>t.type==='deduction').reduce((s,t)=>s+Number(t.amount),0) },
      { 'البيان': 'الرصيد المستحق', 'القيمة': running },
    ];
    const wsInfo = XLSX.utils.json_to_sheet(info);
    wsInfo['!cols'] = [{ wch: 25 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'بيانات الموظف');

    XLSX.writeFile(wb, `كشف_${emp.name}_${todayISO()}.xlsx`);
    showToast('تم تنزيل كشف الحساب');
  };

  const exportAllBalances = () => {
    const rows = employees.map((e) => ({
      'اسم الموظف': e.name,
      'رقم الإقامة': e.iqama,
      'الجوال': e.phone || '',
      'الوظيفة': e.position || '',
      'إجمالي السلف': transactions.filter(t=>t.employeeId===e.id && t.type==='advance').reduce((s,t)=>s+Number(t.amount),0),
      'إجمالي المخصوم': transactions.filter(t=>t.employeeId===e.id && t.type==='deduction').reduce((s,t)=>s+Number(t.amount),0),
      'الرصيد المستحق': balances[e.id] || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الأرصدة');
    XLSX.writeFile(wb, `أرصدة_الموظفين_${todayISO()}.xlsx`);
    showToast('تم تنزيل الأرصدة');
  };

  const handleSignOut = async () => {
    if (!confirm('تسجيل الخروج؟')) return;
    await signOut(auth);
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center" style={{ background: '#F7F3E9' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin" style={{ color: '#1F4D3F' }} />
          <div style={{ color: '#78716C' }}>جاري تحميل البيانات...</div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={{ background: '#F7F3E9', minHeight: '100vh', fontFamily: 'Tajawal, system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&family=Amiri:wght@400;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .num { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        .display { font-family: 'Amiri', 'Tajawal', serif; }
        .card { background: #FFFEF9; border: 1px solid #E8DFC8; }
        .btn-primary { background: #1F4D3F; color: #F7F3E9; }
        .btn-primary:hover { background: #163528; }
        .btn-secondary { background: #FFFEF9; color: #1F4D3F; border: 1px solid #1F4D3F; }
        .btn-secondary:hover { background: #F7F3E9; }
        .btn-ghost { background: transparent; color: #57534e; }
        .btn-ghost:hover { background: #EFE9D8; }
        .ink { color: #1C1917; }
        .ink-muted { color: #78716C; }
        .accent-emerald { color: #1F4D3F; }
        .accent-burgundy { color: #8B2635; }
        .divider { border-color: #E8DFC8; }
        input, select, textarea { font-family: inherit; }
        .input-base { background: #FFFEF9; border: 1px solid #D6CBA8; padding: 0.65rem 0.85rem; border-radius: 6px; width: 100%; color: #1C1917; outline: none; transition: border-color .15s; }
        .input-base:focus { border-color: #1F4D3F; box-shadow: 0 0 0 3px rgba(31,77,63,0.1); }
        .tab-pill { transition: all .15s; }
        .tab-pill.active { background: #1C1917; color: #F7F3E9; }
        .tab-pill:not(.active):hover { background: #EFE9D8; }
        .row-hover:hover { background: #FCF8EC; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px);} to { opacity:1; transform: none;} }
        .toast { animation: slideUp .25s ease-out; }
      `}</style>

      {/* Header */}
      <header className="border-b divider" style={{ background: '#FFFEF9' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: '#1F4D3F' }}>
              <BookOpen size={20} color="#F7F3E9" />
            </div>
            <div>
              <h1 className="display text-2xl font-bold ink leading-tight">دفتر السلف</h1>
              <p className="text-xs ink-muted">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-left hidden sm:block">
              <div className="text-xs ink-muted">الرصيد المستحق</div>
              <div className="num text-lg font-semibold accent-burgundy">{fmt(totals.outstanding)} <span className="text-xs">ر.س</span></div>
            </div>
            <button onClick={handleSignOut} className="btn-ghost p-2 rounded-md" title="تسجيل الخروج">
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 pb-2 flex gap-1 overflow-x-auto">
          {[
            { id: 'dashboard', label: 'الرئيسية', icon: Home },
            { id: 'employees', label: 'الموظفون', icon: Users },
            { id: 'advances', label: 'السلف', icon: ArrowUpCircle },
            { id: 'deductions', label: 'الخصومات', icon: ArrowDownCircle },
            { id: 'statement', label: 'كشف حساب', icon: FileText },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`tab-pill flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${tab === id ? 'active' : 'ink'}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {tab === 'dashboard' && (
          <Dashboard
            employees={employees} transactions={transactions} totals={totals}
            balances={balances} empById={empById}
            exportAllBalances={exportAllBalances} setTab={setTab}
          />
        )}
        {tab === 'employees' && (
          <EmployeesTab
            employees={employees} balances={balances}
            addEmployee={addEmployee} deleteEmployee={deleteEmployee}
            importEmployeesAdvances={importEmployeesAdvances}
            downloadTemplate={downloadTemplate} showToast={showToast}
          />
        )}
        {tab === 'advances' && (
          <AdvancesTab
            employees={employees} transactions={transactions} empById={empById}
            addTransaction={addTransaction} deleteTransaction={deleteTransaction}
            showToast={showToast}
          />
        )}
        {tab === 'deductions' && (
          <DeductionsTab
            employees={employees} transactions={transactions} empById={empById}
            addTransaction={addTransaction} deleteTransaction={deleteTransaction}
            importDeductions={importDeductions} downloadTemplate={downloadTemplate}
            showToast={showToast}
          />
        )}
        {tab === 'statement' && (
          <StatementTab
            employees={employees} transactions={transactions}
            balances={balances} exportStatement={exportStatement}
          />
        )}
      </main>

      {toast && (
        <div className="toast fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-md shadow-lg flex items-center gap-2 z-50"
          style={{ background: toast.kind === 'error' ? '#8B2635' : '#1F4D3F', color: '#F7F3E9' }}>
          {toast.kind === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span className="text-sm">{toast.message}</span>
        </div>
      )}
    </div>
  );
}

// ============== Dashboard ==============
function Dashboard({ employees, transactions, totals, balances, empById, exportAllBalances, setTab }) {
  const [month, setMonth] = useState(currentMonth());

  const monthData = useMemo(() => {
    const inMonth = transactions.filter((t) => monthKeyOf(t.date) === month);
    const advances = inMonth.filter((t) => t.type === 'advance');
    const deductions = inMonth.filter((t) => t.type === 'deduction');
    const advanceTotal = advances.reduce((s, t) => s + Number(t.amount), 0);
    const deductionTotal = deductions.reduce((s, t) => s + Number(t.amount), 0);
    return { advances, deductions, advanceTotal, deductionTotal };
  }, [transactions, month]);

  const availableMonths = useMemo(() => {
    const set = new Set([currentMonth()]);
    transactions.forEach((t) => set.add(monthKeyOf(t.date)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const topOutstanding = useMemo(() => {
    return [...employees]
      .map((e) => ({ ...e, balance: balances[e.id] || 0 }))
      .filter((e) => e.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);
  }, [employees, balances]);

  if (employees.length === 0) {
    return (
      <div className="card rounded-lg p-12 text-center">
        <BookOpen size={48} className="mx-auto mb-4 ink-muted" />
        <h2 className="display text-2xl font-bold ink mb-2">ابدأ بإضافة الموظفين</h2>
        <p className="ink-muted mb-6">أضف موظفيك يدويًا أو ارفع ملف إكسل بكل الأسماء والإقامات والسلف</p>
        <button onClick={() => setTab('employees')} className="btn-primary px-5 py-2.5 rounded-md text-sm font-medium inline-flex items-center gap-2">
          <UserPlus size={16} /> الذهاب للموظفين
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="إجمالي السلف الكلية" value={totals.totalAdvances} icon={ArrowUpCircle} color="#1F4D3F" />
        <Kpi label="إجمالي المسدد" value={totals.totalDeductions} icon={ArrowDownCircle} color="#475569" />
        <Kpi label="الرصيد المستحق" value={totals.outstanding} icon={Wallet} color="#8B2635" emphasize />
        <Kpi label="عدد الموظفين" value={employees.length} icon={Users} color="#1F4D3F" plain />
      </div>

      <div className="card rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="display text-xl font-bold ink">حركة الشهر</h3>
            <p className="text-sm ink-muted">من سلّفت ومن خصمت في الشهر المحدد</p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={16} className="ink-muted" />
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="input-base !py-2 !w-auto text-sm">
              {availableMonths.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-md p-4 border divider" style={{ background: '#F4F8F5' }}>
            <div className="text-xs ink-muted mb-1">سلف الشهر</div>
            <div className="num text-2xl font-semibold accent-emerald">{fmt(monthData.advanceTotal)}</div>
            <div className="text-xs ink-muted mt-1">{monthData.advances.length} حركة</div>
          </div>
          <div className="rounded-md p-4 border divider" style={{ background: '#FBF4F1' }}>
            <div className="text-xs ink-muted mb-1">خصومات الشهر</div>
            <div className="num text-2xl font-semibold" style={{ color: '#8B2635' }}>{fmt(monthData.deductionTotal)}</div>
            <div className="text-xs ink-muted mt-1">{monthData.deductions.length} حركة</div>
          </div>
        </div>

        {monthData.advances.length > 0 && (
          <div className="mb-6">
            <h4 className="font-semibold ink mb-3 flex items-center gap-2">
              <ArrowUpCircle size={16} className="accent-emerald" /> سلف الشهر ({monthData.advances.length})
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b divider">
                    <th className="text-right py-2 ink-muted font-medium">التاريخ</th>
                    <th className="text-right py-2 ink-muted font-medium">الموظف</th>
                    <th className="text-right py-2 ink-muted font-medium">الإقامة</th>
                    <th className="text-left py-2 ink-muted font-medium">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {monthData.advances.sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                    <tr key={t.id} className="border-b divider row-hover">
                      <td className="py-2.5 num">{fmtDate(t.date)}</td>
                      <td className="py-2.5 ink font-medium">{empById[t.employeeId]?.name || '-'}</td>
                      <td className="py-2.5 num ink-muted">{empById[t.employeeId]?.iqama || '-'}</td>
                      <td className="py-2.5 num text-left accent-emerald font-semibold">{fmt(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {monthData.deductions.length > 0 && (
          <div>
            <h4 className="font-semibold ink mb-3 flex items-center gap-2">
              <ArrowDownCircle size={16} className="accent-burgundy" /> خصومات الشهر ({monthData.deductions.length})
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b divider">
                    <th className="text-right py-2 ink-muted font-medium">التاريخ</th>
                    <th className="text-right py-2 ink-muted font-medium">الموظف</th>
                    <th className="text-right py-2 ink-muted font-medium">نوع الخصم</th>
                    <th className="text-left py-2 ink-muted font-medium">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {monthData.deductions.sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                    <tr key={t.id} className="border-b divider row-hover">
                      <td className="py-2.5 num">{fmtDate(t.date)}</td>
                      <td className="py-2.5 ink font-medium">{empById[t.employeeId]?.name || '-'}</td>
                      <td className="py-2.5 ink-muted text-xs">{t.deductionType}</td>
                      <td className="py-2.5 num text-left accent-burgundy font-semibold">{fmt(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {monthData.advances.length === 0 && monthData.deductions.length === 0 && (
          <div className="text-center py-8 ink-muted text-sm">لا توجد حركات في هذا الشهر</div>
        )}
      </div>

      {topOutstanding.length > 0 && (
        <div className="card rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="display text-xl font-bold ink">أعلى الأرصدة المستحقة</h3>
            <button onClick={exportAllBalances} className="btn-secondary px-3 py-2 rounded-md text-xs font-medium inline-flex items-center gap-2">
              <Download size={14} /> تصدير جميع الأرصدة
            </button>
          </div>
          <div className="space-y-2">
            {topOutstanding.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2 border-b divider last:border-0">
                <div>
                  <div className="ink font-medium">{e.name}</div>
                  <div className="text-xs ink-muted num">إقامة: {e.iqama}</div>
                </div>
                <div className="num font-semibold accent-burgundy">{fmt(e.balance)} ر.س</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color, emphasize, plain }) {
  return (
    <div className="card rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs ink-muted">{label}</span>
        <Icon size={18} style={{ color }} />
      </div>
      <div className={`num font-semibold ${emphasize ? 'text-3xl' : 'text-2xl'}`} style={{ color }}>
        {plain ? value : fmt(value)}
      </div>
      {!plain && <div className="text-xs ink-muted mt-1">ر.س</div>}
    </div>
  );
}

// ============== Employees Tab ==============
function EmployeesTab({ employees, balances, addEmployee, deleteEmployee, importEmployeesAdvances, downloadTemplate, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', iqama: '', phone: '', position: '' });
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      String(e.iqama).includes(q) ||
      (e.phone || '').includes(q)
    );
  }, [employees, search]);

  const handleSubmit = async () => {
    setSaving(true);
    const created = await addEmployee(form);
    setSaving(false);
    if (created) {
      setForm({ name: '', iqama: '', phone: '', position: '' });
      setShowForm(false);
      showToast('تم إضافة الموظف');
    }
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) importEmployeesAdvances(f);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="card rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
          <div>
            <h2 className="display text-2xl font-bold ink">الموظفون</h2>
            <p className="text-sm ink-muted">{employees.length} موظف مسجل</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => downloadTemplate('employees')} className="btn-ghost px-3 py-2 rounded-md text-sm inline-flex items-center gap-2">
              <FileSpreadsheet size={16} /> تنزيل القالب
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <button onClick={() => fileRef.current?.click()} className="btn-secondary px-3 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2">
              <Upload size={16} /> رفع إكسل
            </button>
            <button onClick={() => setShowForm(!showForm)} className="btn-primary px-4 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2">
              <Plus size={16} /> موظف جديد
            </button>
          </div>
        </div>

        <div className="text-xs ink-muted bg-stone-50 p-3 rounded-md border divider">
          <strong className="ink">💡 رفع الإكسل:</strong> الأعمدة المطلوبة: <span className="font-medium">اسم الموظف، رقم الإقامة، مبلغ السلفة</span> (اختيارية: رقم الجوال، الوظيفة).
        </div>

        {showForm && (
          <div className="mt-5 p-5 rounded-md border divider" style={{ background: '#FCF8EC' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs ink-muted block mb-1">اسم الموظف *</label>
                <input className="input-base" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs ink-muted block mb-1">رقم الإقامة *</label>
                <input className="input-base num" value={form.iqama} onChange={(e) => setForm({ ...form, iqama: e.target.value })} />
              </div>
              <div>
                <label className="text-xs ink-muted block mb-1">رقم الجوال</label>
                <input className="input-base num" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-xs ink-muted block mb-1">الوظيفة</label>
                <input className="input-base" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="btn-ghost px-4 py-2 rounded-md text-sm">إلغاء</button>
              <button onClick={handleSubmit} disabled={saving} className="btn-primary px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60 inline-flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                حفظ
              </button>
            </div>
          </div>
        )}
      </div>

      {employees.length > 0 && (
        <div className="card rounded-lg p-6">
          <div className="relative mb-4">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 ink-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو رقم الإقامة..." className="input-base pr-10" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b divider">
                  <th className="text-right py-2 ink-muted font-medium">الاسم</th>
                  <th className="text-right py-2 ink-muted font-medium">رقم الإقامة</th>
                  <th className="text-right py-2 ink-muted font-medium hidden md:table-cell">الجوال</th>
                  <th className="text-right py-2 ink-muted font-medium hidden md:table-cell">الوظيفة</th>
                  <th className="text-left py-2 ink-muted font-medium">الرصيد المستحق</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const bal = balances[e.id] || 0;
                  return (
                    <tr key={e.id} className="border-b divider row-hover">
                      <td className="py-3 ink font-medium">{e.name}</td>
                      <td className="py-3 num ink-muted">{e.iqama}</td>
                      <td className="py-3 num ink-muted hidden md:table-cell">{e.phone || '-'}</td>
                      <td className="py-3 ink-muted hidden md:table-cell">{e.position || '-'}</td>
                      <td className={`py-3 num text-left font-semibold ${bal > 0 ? 'accent-burgundy' : 'ink-muted'}`}>{fmt(bal)}</td>
                      <td className="py-3 text-left">
                        <button onClick={() => deleteEmployee(e.id)} className="btn-ghost p-1.5 rounded">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="text-center py-6 ink-muted text-sm">لا يوجد نتائج</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== Advances Tab ==============
function AdvancesTab({ employees, transactions, empById, addTransaction, deleteTransaction, showToast }) {
  const [form, setForm] = useState({ employeeId: '', amount: '', date: todayISO(), notes: '' });
  const [empSearch, setEmpSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [saving, setSaving] = useState(false);

  const advances = useMemo(() =>
    transactions.filter((t) => t.type === 'advance' && monthKeyOf(t.date) === filterMonth)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, filterMonth]
  );

  const monthsList = useMemo(() => {
    const set = new Set([currentMonth()]);
    transactions.filter((t) => t.type === 'advance').forEach((t) => set.add(monthKeyOf(t.date)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const filteredEmps = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      e.name.toLowerCase().includes(q) || String(e.iqama).includes(q)
    );
  }, [employees, empSearch]);

  const selectedEmp = empById[form.employeeId];

  const handleSubmit = async () => {
    setSaving(true);
    const ok = await addTransaction({ ...form, type: 'advance' });
    setSaving(false);
    if (ok) {
      setForm({ employeeId: '', amount: '', date: todayISO(), notes: '' });
      setEmpSearch('');
      showToast('تم تسجيل السلفة');
    }
  };

  if (employees.length === 0) {
    return (
      <div className="card rounded-lg p-12 text-center">
        <Users size={40} className="mx-auto mb-3 ink-muted" />
        <p className="ink-muted">أضف الموظفين أولاً</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card rounded-lg p-6">
        <h2 className="display text-2xl font-bold ink mb-4 flex items-center gap-2">
          <ArrowUpCircle className="accent-emerald" /> تسجيل سلفة جديدة
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-xs ink-muted block mb-1">الموظف *</label>
            {selectedEmp ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-md border divider" style={{ background: '#F4F8F5' }}>
                <div>
                  <div className="ink font-medium">{selectedEmp.name}</div>
                  <div className="text-xs ink-muted num">إقامة: {selectedEmp.iqama}</div>
                </div>
                <button onClick={() => setForm({ ...form, employeeId: '' })} className="btn-ghost p-1.5 rounded"><X size={14} /></button>
              </div>
            ) : (
              <div className="relative">
                <input className="input-base" placeholder="ابحث بالاسم أو رقم الإقامة..."
                  value={empSearch} onChange={(e) => { setEmpSearch(e.target.value); setShowPicker(true); }}
                  onFocus={() => setShowPicker(true)} />
                {showPicker && empSearch && (
                  <div className="absolute z-10 mt-1 w-full rounded-md shadow-lg max-h-60 overflow-y-auto border divider" style={{ background: '#FFFEF9' }}>
                    {filteredEmps.length === 0 && <div className="p-3 text-sm ink-muted">لا يوجد نتائج</div>}
                    {filteredEmps.slice(0, 20).map((e) => (
                      <button key={e.id}
                        onClick={() => { setForm({ ...form, employeeId: e.id }); setShowPicker(false); setEmpSearch(''); }}
                        className="w-full text-right px-3 py-2 row-hover border-b divider last:border-0">
                        <div className="ink font-medium">{e.name}</div>
                        <div className="text-xs ink-muted num">{e.iqama}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs ink-muted block mb-1">مبلغ السلفة *</label>
            <input type="number" step="0.01" className="input-base num"
              value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs ink-muted block mb-1">التاريخ</label>
            <input type="date" className="input-base" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs ink-muted block mb-1">ملاحظات</label>
            <input className="input-base" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="سبب السلفة، رقم سند، إلخ..." />
          </div>
        </div>
        <div className="flex justify-end mt-5">
          <button onClick={handleSubmit} disabled={saving} className="btn-primary px-6 py-2.5 rounded-md text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            تسجيل السلفة
          </button>
        </div>
      </div>

      <div className="card rounded-lg p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="display text-xl font-bold ink">سلف الشهر</h3>
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="input-base !py-2 !w-auto text-sm">
            {monthsList.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b divider">
                <th className="text-right py-2 ink-muted font-medium">التاريخ</th>
                <th className="text-right py-2 ink-muted font-medium">الموظف</th>
                <th className="text-right py-2 ink-muted font-medium hidden md:table-cell">الإقامة</th>
                <th className="text-right py-2 ink-muted font-medium hidden md:table-cell">ملاحظات</th>
                <th className="text-left py-2 ink-muted font-medium">المبلغ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {advances.map((t) => (
                <tr key={t.id} className="border-b divider row-hover">
                  <td className="py-2.5 num">{fmtDate(t.date)}</td>
                  <td className="py-2.5 ink font-medium">{empById[t.employeeId]?.name || '-'}</td>
                  <td className="py-2.5 num ink-muted hidden md:table-cell">{empById[t.employeeId]?.iqama || '-'}</td>
                  <td className="py-2.5 ink-muted text-xs hidden md:table-cell">{t.notes || '-'}</td>
                  <td className="py-2.5 num text-left accent-emerald font-semibold">{fmt(t.amount)}</td>
                  <td className="py-2.5 text-left">
                    <button onClick={() => deleteTransaction(t.id)} className="btn-ghost p-1.5 rounded">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {advances.length > 0 && (
              <tfoot>
                <tr className="border-t-2 divider">
                  <td colSpan="4" className="py-3 ink font-semibold text-right">الإجمالي</td>
                  <td className="py-3 num text-left accent-emerald font-bold text-base">
                    {fmt(advances.reduce((s, t) => s + Number(t.amount), 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
          {advances.length === 0 && <div className="text-center py-8 ink-muted text-sm">لا توجد سلف في هذا الشهر</div>}
        </div>
      </div>
    </div>
  );
}

// ============== Deductions Tab ==============
function DeductionsTab({ employees, transactions, empById, addTransaction, deleteTransaction, importDeductions, downloadTemplate, showToast }) {
  const [form, setForm] = useState({ employeeId: '', amount: '', date: todayISO(), deductionType: DEDUCTION_TYPES[0], notes: '' });
  const [empSearch, setEmpSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const deductions = useMemo(() =>
    transactions.filter((t) => t.type === 'deduction' && monthKeyOf(t.date) === filterMonth)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, filterMonth]
  );

  const monthsList = useMemo(() => {
    const set = new Set([currentMonth()]);
    transactions.filter((t) => t.type === 'deduction').forEach((t) => set.add(monthKeyOf(t.date)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const filteredEmps = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      e.name.toLowerCase().includes(q) || String(e.iqama).includes(q)
    );
  }, [employees, empSearch]);

  const selectedEmp = empById[form.employeeId];

  const handleSubmit = async () => {
    setSaving(true);
    const ok = await addTransaction({ ...form, type: 'deduction' });
    setSaving(false);
    if (ok) {
      setForm({ employeeId: '', amount: '', date: todayISO(), deductionType: DEDUCTION_TYPES[0], notes: '' });
      setEmpSearch('');
      showToast('تم تسجيل الخصم');
    }
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) importDeductions(f);
    e.target.value = '';
  };

  if (employees.length === 0) {
    return (
      <div className="card rounded-lg p-12 text-center">
        <Users size={40} className="mx-auto mb-3 ink-muted" />
        <p className="ink-muted">أضف الموظفين أولاً</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-3">
          <div>
            <h2 className="display text-2xl font-bold ink">رفع خصومات بالجملة</h2>
            <p className="text-sm ink-muted">ارفع ملف إكسل بكل الخصومات الشهرية دفعة واحدة</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => downloadTemplate('deductions')} className="btn-ghost px-3 py-2 rounded-md text-sm inline-flex items-center gap-2">
              <FileSpreadsheet size={16} /> تنزيل القالب
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <button onClick={() => fileRef.current?.click()} className="btn-primary px-4 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2">
              <Upload size={16} /> رفع إكسل الخصومات
            </button>
          </div>
        </div>
        <div className="text-xs ink-muted bg-stone-50 p-3 rounded-md border divider">
          <strong className="ink">💡 الأعمدة:</strong> اسم الموظف، رقم الإقامة، المبلغ، نوع الخصم (مثل: من الراتب الشهري، من رصيد الإجازة، إلخ).
        </div>
      </div>

      <div className="card rounded-lg p-6">
        <h2 className="display text-xl font-bold ink mb-4 flex items-center gap-2">
          <ArrowDownCircle className="accent-burgundy" /> تسجيل خصم يدوي
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-xs ink-muted block mb-1">الموظف *</label>
            {selectedEmp ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-md border divider" style={{ background: '#FBF4F1' }}>
                <div>
                  <div className="ink font-medium">{selectedEmp.name}</div>
                  <div className="text-xs ink-muted num">إقامة: {selectedEmp.iqama}</div>
                </div>
                <button onClick={() => setForm({ ...form, employeeId: '' })} className="btn-ghost p-1.5 rounded"><X size={14} /></button>
              </div>
            ) : (
              <div className="relative">
                <input className="input-base" placeholder="ابحث بالاسم أو رقم الإقامة..."
                  value={empSearch} onChange={(e) => { setEmpSearch(e.target.value); setShowPicker(true); }}
                  onFocus={() => setShowPicker(true)} />
                {showPicker && empSearch && (
                  <div className="absolute z-10 mt-1 w-full rounded-md shadow-lg max-h-60 overflow-y-auto border divider" style={{ background: '#FFFEF9' }}>
                    {filteredEmps.length === 0 && <div className="p-3 text-sm ink-muted">لا يوجد نتائج</div>}
                    {filteredEmps.slice(0, 20).map((e) => (
                      <button key={e.id}
                        onClick={() => { setForm({ ...form, employeeId: e.id }); setShowPicker(false); setEmpSearch(''); }}
                        className="w-full text-right px-3 py-2 row-hover border-b divider last:border-0">
                        <div className="ink font-medium">{e.name}</div>
                        <div className="text-xs ink-muted num">{e.iqama}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs ink-muted block mb-1">المبلغ المخصوم *</label>
            <input type="number" step="0.01" className="input-base num"
              value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs ink-muted block mb-1">نوع الخصم *</label>
            <select className="input-base" value={form.deductionType}
              onChange={(e) => setForm({ ...form, deductionType: e.target.value })}>
              {DEDUCTION_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs ink-muted block mb-1">التاريخ</label>
            <input type="date" className="input-base" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="text-xs ink-muted block mb-1">ملاحظات</label>
            <input className="input-base" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end mt-5">
          <button onClick={handleSubmit} disabled={saving} className="btn-primary px-6 py-2.5 rounded-md text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            تسجيل الخصم
          </button>
        </div>
      </div>

      <div className="card rounded-lg p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="display text-xl font-bold ink">خصومات الشهر</h3>
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="input-base !py-2 !w-auto text-sm">
            {monthsList.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b divider">
                <th className="text-right py-2 ink-muted font-medium">التاريخ</th>
                <th className="text-right py-2 ink-muted font-medium">الموظف</th>
                <th className="text-right py-2 ink-muted font-medium">نوع الخصم</th>
                <th className="text-right py-2 ink-muted font-medium hidden md:table-cell">ملاحظات</th>
                <th className="text-left py-2 ink-muted font-medium">المبلغ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deductions.map((t) => (
                <tr key={t.id} className="border-b divider row-hover">
                  <td className="py-2.5 num">{fmtDate(t.date)}</td>
                  <td className="py-2.5 ink font-medium">{empById[t.employeeId]?.name || '-'}</td>
                  <td className="py-2.5 ink-muted text-xs">{t.deductionType}</td>
                  <td className="py-2.5 ink-muted text-xs hidden md:table-cell">{t.notes || '-'}</td>
                  <td className="py-2.5 num text-left accent-burgundy font-semibold">{fmt(t.amount)}</td>
                  <td className="py-2.5 text-left">
                    <button onClick={() => deleteTransaction(t.id)} className="btn-ghost p-1.5 rounded">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {deductions.length > 0 && (
              <tfoot>
                <tr className="border-t-2 divider">
                  <td colSpan="4" className="py-3 ink font-semibold text-right">الإجمالي</td>
                  <td className="py-3 num text-left accent-burgundy font-bold text-base">
                    {fmt(deductions.reduce((s, t) => s + Number(t.amount), 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
          {deductions.length === 0 && <div className="text-center py-8 ink-muted text-sm">لا توجد خصومات في هذا الشهر</div>}
        </div>
      </div>
    </div>
  );
}

// ============== Statement Tab ==============
function StatementTab({ employees, transactions, balances, exportStatement }) {
  const [empId, setEmpId] = useState(employees[0]?.id || '');
  const [search, setSearch] = useState('');

  const filteredEmps = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      e.name.toLowerCase().includes(q) || String(e.iqama).includes(q)
    );
  }, [employees, search]);

  const emp = employees.find((e) => e.id === empId);

  const ledger = useMemo(() => {
    if (!emp) return [];
    const txs = transactions
      .filter((t) => t.employeeId === emp.id)
      .sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    return txs.map((t) => {
      const isAdv = t.type === 'advance';
      running += isAdv ? Number(t.amount) : -Number(t.amount);
      return { ...t, running };
    }).reverse();
  }, [emp, transactions]);

  const stats = useMemo(() => {
    if (!emp) return { adv: 0, ded: 0 };
    const txs = transactions.filter((t) => t.employeeId === emp.id);
    return {
      adv: txs.filter(t=>t.type==='advance').reduce((s,t)=>s+Number(t.amount),0),
      ded: txs.filter(t=>t.type==='deduction').reduce((s,t)=>s+Number(t.amount),0),
    };
  }, [emp, transactions]);

  if (employees.length === 0) {
    return (
      <div className="card rounded-lg p-12 text-center">
        <Users size={40} className="mx-auto mb-3 ink-muted" />
        <p className="ink-muted">أضف الموظفين أولاً</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card rounded-lg p-6">
        <h2 className="display text-2xl font-bold ink mb-4">كشف حساب الموظف</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 ink-muted" />
            <input className="input-base pr-10" placeholder="ابحث بالاسم أو رقم الإقامة..."
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input-base" value={empId} onChange={(e) => setEmpId(e.target.value)}>
            <option value="">— اختر موظف —</option>
            {filteredEmps.map((e) => (
              <option key={e.id} value={e.id}>{e.name} — {e.iqama}</option>
            ))}
          </select>
        </div>

        {emp && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 p-4 rounded-md border divider" style={{ background: '#FCF8EC' }}>
              <div>
                <div className="text-xs ink-muted">الموظف</div>
                <div className="ink font-semibold">{emp.name}</div>
                <div className="text-xs ink-muted num mt-0.5">{emp.iqama}</div>
              </div>
              <div>
                <div className="text-xs ink-muted">إجمالي السلف</div>
                <div className="num font-semibold accent-emerald text-lg">{fmt(stats.adv)}</div>
              </div>
              <div>
                <div className="text-xs ink-muted">إجمالي المسدد</div>
                <div className="num font-semibold text-lg" style={{ color: '#475569' }}>{fmt(stats.ded)}</div>
              </div>
              <div>
                <div className="text-xs ink-muted">الرصيد المستحق</div>
                <div className="num font-bold text-xl accent-burgundy">{fmt(balances[emp.id] || 0)}</div>
              </div>
            </div>

            <div className="flex justify-end mb-3">
              <button onClick={() => exportStatement(emp.id)} className="btn-primary px-4 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2">
                <Download size={16} /> تنزيل كشف الحساب (إكسل)
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b divider" style={{ background: '#F4F0E3' }}>
                    <th className="text-right py-2 px-2 ink-muted font-medium">التاريخ</th>
                    <th className="text-right py-2 px-2 ink-muted font-medium">البيان</th>
                    <th className="text-left py-2 px-2 ink-muted font-medium">مدين</th>
                    <th className="text-left py-2 px-2 ink-muted font-medium">دائن</th>
                    <th className="text-left py-2 px-2 ink-muted font-medium">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((t) => (
                    <tr key={t.id} className="border-b divider row-hover">
                      <td className="py-2.5 px-2 num">{fmtDate(t.date)}</td>
                      <td className="py-2.5 px-2 ink">
                        {t.type === 'advance' ? (
                          <span className="accent-emerald font-medium">سلفة</span>
                        ) : (
                          <span><span className="accent-burgundy font-medium">خصم</span> <span className="ink-muted text-xs">— {t.deductionType}</span></span>
                        )}
                        {t.notes && <div className="text-xs ink-muted mt-0.5">{t.notes}</div>}
                      </td>
                      <td className="py-2.5 px-2 num text-left accent-emerald">{t.type === 'advance' ? fmt(t.amount) : ''}</td>
                      <td className="py-2.5 px-2 num text-left accent-burgundy">{t.type === 'deduction' ? fmt(t.amount) : ''}</td>
                      <td className="py-2.5 px-2 num text-left font-semibold ink">{fmt(t.running)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ledger.length === 0 && <div className="text-center py-8 ink-muted text-sm">لا توجد حركات</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
