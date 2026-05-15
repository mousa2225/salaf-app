import { useState, useMemo } from 'react';
import {
  Wallet, ArrowUpCircle, ArrowDownCircle, TrendingUp,
  BookOpen, UserPlus, Calendar, Activity, Clock,
} from 'lucide-react';
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  fmt, fmtInt, fmtDate, monthKeyOf, currentMonth, monthLabel, shortMonthLabel, can,
} from '../lib/utils';

export default function Dashboard({
  user, employees, transactions, installments, balances, empById, setPage,
}) {
  const [month, setMonth] = useState(currentMonth());

  // ====== KPI ======
  const totals = useMemo(() => {
    let totalAdvances = 0, totalDeductions = 0;
    for (const t of transactions) {
      if (t.type === 'advance') totalAdvances += Number(t.amount);
      else totalDeductions += Number(t.amount);
    }
    return {
      totalAdvances,
      totalDeductions,
      outstanding: totalAdvances - totalDeductions,
      activeEmployees: employees.filter((e) => e.status !== 'terminated').length,
      totalEmployees: employees.length,
      borrowingEmployees: Object.values(balances).filter((b) => b > 0).length,
      collectionRate: totalAdvances > 0 ? (totalDeductions / totalAdvances) * 100 : 0,
    };
  }, [transactions, employees, balances]);

  // ====== Month data ======
  const monthData = useMemo(() => {
    const inMonth = transactions.filter((t) => monthKeyOf(t.date) === month);
    const advances = inMonth.filter((t) => t.type === 'advance');
    const deductions = inMonth.filter((t) => t.type === 'deduction');
    return {
      advances,
      deductions,
      advanceTotal: advances.reduce((s, t) => s + Number(t.amount), 0),
      deductionTotal: deductions.reduce((s, t) => s + Number(t.amount), 0),
      borrowedEmps: new Set(advances.map((a) => a.employeeId)).size,
    };
  }, [transactions, month]);

  // ====== Trend (last 6 months) ======
  const trendData = useMemo(() => {
    const months = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const ym = d.toISOString().slice(0, 7);
      months.push(ym);
    }
    return months.map((ym) => {
      const inMonth = transactions.filter((t) => monthKeyOf(t.date) === ym);
      return {
        month: shortMonthLabel(ym),
        ymKey: ym,
        سلف: inMonth.filter((t) => t.type === 'advance').reduce((s, t) => s + Number(t.amount), 0),
        خصومات: inMonth.filter((t) => t.type === 'deduction').reduce((s, t) => s + Number(t.amount), 0),
      };
    });
  }, [transactions]);

  // ====== Available months ======
  const availableMonths = useMemo(() => {
    const set = new Set([currentMonth()]);
    transactions.forEach((t) => set.add(monthKeyOf(t.date)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  // ====== Top outstanding ======
  const topOutstanding = useMemo(() => {
    return employees
      .map((e) => ({ ...e, balance: balances[e.id] || 0 }))
      .filter((e) => e.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);
  }, [employees, balances]);

  // ====== Pending installments (this month + overdue) ======
  const pendingInstallments = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return installments
      .filter((i) => i.status === 'pending')
      .map((i) => ({
        ...i,
        overdue: i.dueDate < todayStr,
        thisMonth: monthKeyOf(i.dueDate) === currentMonth(),
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [installments]);

  const overdueCount = pendingInstallments.filter((i) => i.overdue).length;
  const thisMonthCount = pendingInstallments.filter((i) => i.thisMonth && !i.overdue).length;

  // ====== Empty state ======
  if (employees.length === 0) {
    return (
      <div className="card rounded-lg p-12 text-center">
        <BookOpen size={48} className="mx-auto mb-4 ink-muted" />
        <h2 className="display text-2xl font-bold ink mb-2">مرحباً، {user.displayName}! 👋</h2>
        <p className="ink-muted mb-6">ابدأ بإضافة الموظفين لإدارة سلفهم وخصوماتهم</p>
        {can(user, 'ADD_EMPLOYEE') && (
          <button onClick={() => setPage('employees')} className="btn-primary px-5 py-2.5 rounded-md text-sm font-medium inline-flex items-center gap-2">
            <UserPlus size={16} /> الذهاب للموظفين
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="display text-3xl font-bold ink">مرحباً، {user.displayName?.split(' ')[0] || 'صديقي'} 👋</h1>
        <p className="ink-muted text-sm">إليك ملخص حركة السلف اليوم</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="إجمالي السلف" value={totals.totalAdvances} icon={ArrowUpCircle} color="#1F4D3F" />
        <Kpi label="إجمالي المسدد" value={totals.totalDeductions} icon={ArrowDownCircle} color="#475569" />
        <Kpi label="الرصيد المستحق" value={totals.outstanding} icon={Wallet} color="#8B2635" emphasize />
        <Kpi label="نسبة التحصيل" value={totals.collectionRate.toFixed(1) + '%'} icon={TrendingUp} color="#1E40AF" plain />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniKpi label="إجمالي الموظفين" value={totals.totalEmployees} sub={`${totals.activeEmployees} نشط`} />
        <MiniKpi label="موظفون مدينون" value={totals.borrowingEmployees} sub="عليهم سلف" />
        <MiniKpi label="أقساط هذا الشهر" value={thisMonthCount} sub="مستحقة" highlight={thisMonthCount > 0} />
        <MiniKpi label="أقساط متأخرة" value={overdueCount} sub="منذ تواريخها" danger={overdueCount > 0} />
      </div>

      {/* Trend Chart */}
      <div className="card rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="display text-xl font-bold ink">حركة الأشهر الست الماضية</h3>
            <p className="text-sm ink-muted">مقارنة السلف والخصومات</p>
          </div>
        </div>
        <div className="w-full" style={{ height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={trendData} margin={{ top: 10, right: 5, left: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" />
              <XAxis dataKey="month" tick={{ fill: '#78716C', fontSize: 12, fontFamily: 'Tajawal' }} reversed />
              <YAxis tick={{ fill: '#78716C', fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} orientation="right" />
              <Tooltip
                contentStyle={{ background: '#FFFEF9', border: '1px solid #E8DFC8', borderRadius: 6, fontFamily: 'Tajawal' }}
                formatter={(v) => fmt(v) + ' ر.س'}
              />
              <Legend wrapperStyle={{ fontFamily: 'Tajawal', fontSize: 13 }} />
              <Bar dataKey="سلف" fill="#1F4D3F" radius={[6, 6, 0, 0]} />
              <Bar dataKey="خصومات" fill="#8B2635" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly summary */}
        <div className="card rounded-lg p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="display text-xl font-bold ink">حركة الشهر</h3>
              <p className="text-sm ink-muted">سلف وخصومات في الشهر المحدد</p>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="ink-muted" />
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="input-base !py-1.5 !w-auto text-sm">
                {availableMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md p-4 border divider" style={{ background: '#F4F8F5' }}>
              <div className="text-xs ink-muted mb-1">سلف الشهر</div>
              <div className="num text-2xl font-semibold accent-emerald">{fmt(monthData.advanceTotal)}</div>
              <div className="text-xs ink-muted mt-1">{monthData.advances.length} حركة • {monthData.borrowedEmps} موظف</div>
            </div>
            <div className="rounded-md p-4 border divider" style={{ background: '#FBF4F1' }}>
              <div className="text-xs ink-muted mb-1">خصومات الشهر</div>
              <div className="num text-2xl font-semibold accent-burgundy">{fmt(monthData.deductionTotal)}</div>
              <div className="text-xs ink-muted mt-1">{monthData.deductions.length} حركة</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t divider">
            <div className="flex items-center justify-between text-sm">
              <span className="ink-muted">صافي حركة الشهر</span>
              <span className={`num font-bold ${monthData.advanceTotal - monthData.deductionTotal > 0 ? 'accent-burgundy' : 'accent-emerald'}`}>
                {fmt(monthData.advanceTotal - monthData.deductionTotal)} ر.س
              </span>
            </div>
          </div>
        </div>

        {/* Top borrowers */}
        <div className="card rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="display text-xl font-bold ink">أعلى المدينين</h3>
              <p className="text-sm ink-muted">أكثر الموظفين أرصدة مستحقة</p>
            </div>
            <Activity size={18} className="accent-burgundy" />
          </div>
          {topOutstanding.length === 0 ? (
            <div className="text-center py-8 ink-muted text-sm">لا يوجد أرصدة مستحقة</div>
          ) : (
            <div className="space-y-2">
              {topOutstanding.map((e, idx) => (
                <button
                  key={e.id}
                  onClick={() => setPage('statement')}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-md row-hover text-right"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: '#FBF4F1', color: '#8B2635' }}>
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="ink font-medium truncate">{e.name}</div>
                      <div className="text-xs ink-muted num">{e.iqama}</div>
                    </div>
                  </div>
                  <div className="num font-semibold accent-burgundy whitespace-nowrap mr-2">{fmt(e.balance)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pending installments alert */}
      {pendingInstallments.length > 0 && (overdueCount > 0 || thisMonthCount > 0) && (
        <div className="card rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={18} className="accent-amber" />
              <h3 className="display text-xl font-bold ink">أقساط مستحقة</h3>
            </div>
            <span className="text-xs ink-muted">
              {overdueCount > 0 && <span className="accent-burgundy font-semibold">{overdueCount} متأخر • </span>}
              {thisMonthCount} هذا الشهر
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b divider">
                  <th className="text-right py-2 ink-muted font-medium">الموظف</th>
                  <th className="text-right py-2 ink-muted font-medium">القسط</th>
                  <th className="text-right py-2 ink-muted font-medium">تاريخ الاستحقاق</th>
                  <th className="text-left py-2 ink-muted font-medium">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {pendingInstallments.slice(0, 8).map((i) => (
                  <tr key={i.id} className="border-b divider row-hover">
                    <td className="py-2.5 ink font-medium">{empById[i.employeeId]?.name || '-'}</td>
                    <td className="py-2.5 ink-muted text-xs num">{i.installmentNo}/{i.totalInstallments}</td>
                    <td className="py-2.5 num text-xs">
                      {fmtDate(i.dueDate)}
                      {i.overdue && <span className="badge badge-burgundy mr-2">متأخر</span>}
                      {i.thisMonth && !i.overdue && <span className="badge badge-amber mr-2">هذا الشهر</span>}
                    </td>
                    <td className="py-2.5 num text-left font-semibold accent-amber">{fmt(i.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pendingInstallments.length > 8 && (
            <button onClick={() => setPage('deductions')} className="mt-3 text-sm accent-emerald font-medium">
              عرض الكل ({pendingInstallments.length}) ←
            </button>
          )}
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

function MiniKpi({ label, value, sub, danger, highlight }) {
  return (
    <div className={`card rounded-lg p-4 ${danger ? 'border-2' : ''}`} style={danger ? { borderColor: '#8B2635' } : {}}>
      <div className="text-xs ink-muted">{label}</div>
      <div className={`num text-xl font-semibold mt-1 ${danger ? 'accent-burgundy' : highlight ? 'accent-amber' : 'ink'}`}>
        {fmtInt(value)}
      </div>
      <div className="text-xs ink-muted mt-0.5">{sub}</div>
    </div>
  );
}
