import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart3, Calendar, Download, TrendingUp, Users, AlertTriangle, PieChart as PieIcon,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  fmt, fmtInt, fmtDate, monthKeyOf, yearKeyOf, currentMonth, currentYear,
  monthLabel, shortMonthLabel, todayISO, can,
} from '../lib/utils';

const COLORS = ['#1F4D3F', '#8B2635', '#B45309', '#1E40AF', '#475569', '#7C3AED', '#0891B2', '#BE185D'];

export default function Reports({
  user, employees, transactions, installments, empById, balances, showToast,
}) {
  const [reportType, setReportType] = useState('monthly'); // monthly | yearly | top | dept | aging
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(currentMonth());

  const canExport = can(user, 'EXPORT_DATA');

  // ===== Available periods =====
  const availableYears = useMemo(() => {
    const set = new Set([currentYear()]);
    transactions.forEach((t) => set.add(yearKeyOf(t.date)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  // ===== Monthly trend (12 months of selected year) =====
  const yearlyTrend = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, '0')}`
    );
    return months.map((ym) => {
      const inMonth = transactions.filter((t) => monthKeyOf(t.date) === ym);
      const advances = inMonth.filter((t) => t.type === 'advance').reduce((s, t) => s + Number(t.amount), 0);
      const deductions = inMonth.filter((t) => t.type === 'deduction').reduce((s, t) => s + Number(t.amount), 0);
      return {
        month: shortMonthLabel(ym),
        ymKey: ym,
        سلف: advances,
        خصومات: deductions,
        صافي: advances - deductions,
      };
    });
  }, [transactions, year]);

  const yearStats = useMemo(() => {
    const inYear = transactions.filter((t) => yearKeyOf(t.date) === year);
    const adv = inYear.filter((t) => t.type === 'advance').reduce((s, t) => s + Number(t.amount), 0);
    const ded = inYear.filter((t) => t.type === 'deduction').reduce((s, t) => s + Number(t.amount), 0);
    return {
      adv, ded, net: adv - ded,
      txCount: inYear.length,
      collectionRate: adv > 0 ? (ded / adv) * 100 : 0,
    };
  }, [transactions, year]);

  // ===== Month detail =====
  const monthDetail = useMemo(() => {
    const inMonth = transactions.filter((t) => monthKeyOf(t.date) === month);
    const adv = inMonth.filter((t) => t.type === 'advance');
    const ded = inMonth.filter((t) => t.type === 'deduction');

    // By deduction type
    const dedByType = {};
    ded.forEach((t) => {
      const key = t.deductionType || 'أخرى';
      dedByType[key] = (dedByType[key] || 0) + Number(t.amount);
    });
    const dedTypeData = Object.entries(dedByType).map(([name, value]) => ({ name, value }));

    return {
      adv: adv.reduce((s, t) => s + Number(t.amount), 0),
      ded: ded.reduce((s, t) => s + Number(t.amount), 0),
      advCount: adv.length,
      dedCount: ded.length,
      dedTypeData,
    };
  }, [transactions, month]);

  // ===== Top 10 borrowers =====
  const topBorrowers = useMemo(() => {
    return employees
      .map((e) => {
        const txs = transactions.filter((t) => t.employeeId === e.id);
        const adv = txs.filter((t) => t.type === 'advance').reduce((s, t) => s + Number(t.amount), 0);
        const ded = txs.filter((t) => t.type === 'deduction').reduce((s, t) => s + Number(t.amount), 0);
        return { ...e, totalAdv: adv, totalDed: ded, balance: adv - ded };
      })
      .sort((a, b) => b.totalAdv - a.totalAdv)
      .slice(0, 10);
  }, [employees, transactions]);

  // ===== By department =====
  const byDepartment = useMemo(() => {
    const m = {};
    for (const e of employees) {
      const dept = e.department || 'بدون قسم';
      if (!m[dept]) m[dept] = { name: dept, employees: 0, totalAdv: 0, balance: 0 };
      m[dept].employees++;
      m[dept].balance += balances[e.id] || 0;
    }
    for (const t of transactions) {
      const e = empById[t.employeeId];
      if (!e) continue;
      const dept = e.department || 'بدون قسم';
      if (t.type === 'advance' && m[dept]) m[dept].totalAdv += Number(t.amount);
    }
    return Object.values(m).filter((d) => d.totalAdv > 0 || d.balance > 0).sort((a, b) => b.totalAdv - a.totalAdv);
  }, [employees, transactions, empById, balances]);

  // ===== Aging report (overdue installments) =====
  const aging = useMemo(() => {
    const todayStr = todayISO();
    const buckets = { current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b90plus: 0 };
    const detail = [];
    for (const i of installments) {
      if (i.status !== 'pending') continue;
      const due = new Date(i.dueDate);
      const today = new Date(todayStr);
      const days = Math.floor((today - due) / (1000 * 60 * 60 * 24));
      let bucket = 'current';
      if (days > 90) bucket = 'b90plus';
      else if (days > 60) bucket = 'b61_90';
      else if (days > 30) bucket = 'b31_60';
      else if (days > 0) bucket = 'b1_30';
      buckets[bucket] += Number(i.amount);
      if (days > 0) {
        detail.push({ ...i, daysOverdue: days, bucket });
      }
    }
    return { buckets, detail: detail.sort((a, b) => b.daysOverdue - a.daysOverdue) };
  }, [installments]);

  const agingChartData = [
    { name: 'حالية', value: aging.buckets.current, color: '#1F4D3F' },
    { name: '1-30 يوم', value: aging.buckets.b1_30, color: '#B45309' },
    { name: '31-60 يوم', value: aging.buckets.b31_60, color: '#D97706' },
    { name: '61-90 يوم', value: aging.buckets.b61_90, color: '#DC2626' },
    { name: '+90 يوم', value: aging.buckets.b90plus, color: '#8B2635' },
  ].filter((d) => d.value > 0);

  // ===== Yearly comparison =====
  const yearlyComparison = useMemo(() => {
    const allYears = Array.from(new Set(transactions.map((t) => yearKeyOf(t.date)))).sort();
    return allYears.map((y) => {
      const inYear = transactions.filter((t) => yearKeyOf(t.date) === y);
      return {
        year: y,
        سلف: inYear.filter((t) => t.type === 'advance').reduce((s, t) => s + Number(t.amount), 0),
        خصومات: inYear.filter((t) => t.type === 'deduction').reduce((s, t) => s + Number(t.amount), 0),
      };
    });
  }, [transactions]);

  // ===== Export =====
  const exportAll = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Yearly trend
    const trendSheet = XLSX.utils.json_to_sheet(yearlyTrend.map((m) => ({
      'الشهر': m.month, 'السلف': m.سلف, 'الخصومات': m.خصومات, 'الصافي': m.صافي,
    })));
    trendSheet['!cols'] = [{ wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, trendSheet, `تحليل ${year}`);

    // Sheet 2: Top borrowers
    const topSheet = XLSX.utils.json_to_sheet(topBorrowers.map((e, idx) => ({
      '#': idx + 1,
      'الاسم': e.name,
      'الإقامة': e.iqama,
      'القسم': e.department || '-',
      'الراتب': e.salary || 0,
      'إجمالي السلف': e.totalAdv,
      'إجمالي المخصوم': e.totalDed,
      'الرصيد': e.balance,
    })));
    topSheet['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 14 }, { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, topSheet, 'أعلى المدينين');

    // Sheet 3: By department
    const deptSheet = XLSX.utils.json_to_sheet(byDepartment.map((d) => ({
      'القسم': d.name,
      'عدد الموظفين': d.employees,
      'إجمالي السلف': d.totalAdv,
      'الرصيد المستحق': d.balance,
    })));
    deptSheet['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, deptSheet, 'حسب القسم');

    // Sheet 4: Aging
    const agingSheet = XLSX.utils.json_to_sheet(aging.detail.map((i) => ({
      'الموظف': empById[i.employeeId]?.name || '-',
      'الإقامة': empById[i.employeeId]?.iqama || '-',
      'القسط': `${i.installmentNo}/${i.totalInstallments}`,
      'تاريخ الاستحقاق': i.dueDate,
      'المبلغ': i.amount,
      'أيام التأخير': i.daysOverdue,
    })));
    agingSheet['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, agingSheet, 'الأقساط المتأخرة');

    // Sheet 5: Yearly comparison
    const yrSheet = XLSX.utils.json_to_sheet(yearlyComparison.map((y) => ({
      'السنة': y.year, 'إجمالي السلف': y.سلف, 'إجمالي الخصومات': y.خصومات,
    })));
    yrSheet['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, yrSheet, 'مقارنة سنوية');

    XLSX.writeFile(wb, `تقرير_شامل_${todayISO()}.xlsx`);
    showToast('تم تنزيل التقرير الشامل');
  };

  if (transactions.length === 0) {
    return (
      <div className="card rounded-lg p-12 text-center">
        <BarChart3 size={48} className="mx-auto mb-4 ink-muted" />
        <h2 className="display text-xl font-bold ink mb-2">لا توجد بيانات بعد</h2>
        <p className="ink-muted text-sm">سجّل بعض السلف والخصومات لتظهر التقارير والتحليلات</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="display text-2xl font-bold ink">التقارير والتحليلات</h2>
            <p className="text-sm ink-muted">تحليل شامل للسلف والخصومات والاتجاهات</p>
          </div>
          {canExport && (
            <button onClick={exportAll} className="btn-primary px-4 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2">
              <Download size={16} /> تصدير التقرير الشامل
            </button>
          )}
        </div>

        {/* Tab pills */}
        <div className="flex flex-wrap gap-1 mt-5 border-b divider">
          {[
            { id: 'monthly', label: 'تحليل شهري', icon: Calendar },
            { id: 'yearly', label: 'مقارنة سنوية', icon: TrendingUp },
            { id: 'top', label: 'أعلى المدينين', icon: Users },
            { id: 'dept', label: 'حسب الأقسام', icon: PieIcon },
            { id: 'aging', label: 'الأعمار (المتأخر)', icon: AlertTriangle },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setReportType(id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-2 ${reportType === id ? 'border-current accent-emerald' : 'border-transparent ink-muted'}`}>
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* === MONTHLY === */}
      {reportType === 'monthly' && (
        <>
          {/* Year selector + KPIs */}
          <div className="card rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm ink-muted">السنة:</span>
              <select className="input-base !py-1.5 !w-auto text-sm" value={year} onChange={(e) => setYear(e.target.value)}>
                {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <StatBox label={`سلف ${year}`} value={fmt(yearStats.adv)} color="#1F4D3F" />
              <StatBox label={`مخصوم ${year}`} value={fmt(yearStats.ded)} color="#475569" />
              <StatBox label={`الصافي ${year}`} value={fmt(yearStats.net)} color="#8B2635" />
              <StatBox label="نسبة التحصيل" value={yearStats.collectionRate.toFixed(1) + '%'} color="#1E40AF" plain />
            </div>

            <h3 className="font-semibold ink mb-3">حركة السلف والخصومات الشهرية</h3>
            <div className="w-full" style={{ height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={yearlyTrend} margin={{ top: 10, right: 5, left: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" />
                  <XAxis dataKey="month" tick={{ fill: '#78716C', fontSize: 11, fontFamily: 'Tajawal' }} reversed />
                  <YAxis tick={{ fill: '#78716C', fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} orientation="right" />
                  <Tooltip contentStyle={{ background: '#FFFEF9', border: '1px solid #E8DFC8', borderRadius: 6, fontFamily: 'Tajawal' }} formatter={(v) => fmt(v) + ' ر.س'} />
                  <Legend wrapperStyle={{ fontFamily: 'Tajawal', fontSize: 13 }} />
                  <Bar dataKey="سلف" fill="#1F4D3F" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="خصومات" fill="#8B2635" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6">
              <h3 className="font-semibold ink mb-3">صافي الحركة الشهرية</h3>
              <div className="w-full" style={{ height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={yearlyTrend} margin={{ top: 10, right: 5, left: 5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" />
                    <XAxis dataKey="month" tick={{ fill: '#78716C', fontSize: 11, fontFamily: 'Tajawal' }} reversed />
                    <YAxis tick={{ fill: '#78716C', fontSize: 11 }} orientation="right" />
                    <Tooltip contentStyle={{ background: '#FFFEF9', border: '1px solid #E8DFC8', borderRadius: 6, fontFamily: 'Tajawal' }} formatter={(v) => fmt(v) + ' ر.س'} />
                    <Line type="monotone" dataKey="صافي" stroke="#1E40AF" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Month detail */}
          <div className="card rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="font-semibold ink">تفاصيل شهر</h3>
              <select className="input-base !py-1.5 !w-auto text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
                {yearlyTrend.map((m) => <option key={m.ymKey} value={m.ymKey}>{monthLabel(m.ymKey)}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <StatBox label="سلف الشهر" value={fmt(monthDetail.adv)} sub={`${monthDetail.advCount} حركة`} color="#1F4D3F" />
                  <StatBox label="خصومات الشهر" value={fmt(monthDetail.ded)} sub={`${monthDetail.dedCount} حركة`} color="#8B2635" />
                </div>
              </div>

              {monthDetail.dedTypeData.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium ink mb-2">توزيع الخصومات حسب النوع</h4>
                  <div className="w-full" style={{ height: 200 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={monthDetail.dedTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(d) => d.name}>
                          {monthDetail.dedTypeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => fmt(v) + ' ر.س'} contentStyle={{ fontFamily: 'Tajawal', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* === YEARLY === */}
      {reportType === 'yearly' && (
        <div className="card rounded-lg p-6">
          <h3 className="font-semibold ink mb-4">مقارنة بين السنوات</h3>
          <div className="w-full" style={{ height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={yearlyComparison} margin={{ top: 10, right: 5, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" />
                <XAxis dataKey="year" tick={{ fill: '#78716C', fontSize: 12, fontFamily: 'IBM Plex Mono' }} />
                <YAxis tick={{ fill: '#78716C', fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} orientation="right" />
                <Tooltip contentStyle={{ background: '#FFFEF9', border: '1px solid #E8DFC8', borderRadius: 6, fontFamily: 'Tajawal' }} formatter={(v) => fmt(v) + ' ر.س'} />
                <Legend wrapperStyle={{ fontFamily: 'Tajawal', fontSize: 13 }} />
                <Bar dataKey="سلف" fill="#1F4D3F" radius={[6, 6, 0, 0]} />
                <Bar dataKey="خصومات" fill="#8B2635" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b divider">
                  <th className="text-right py-2 ink-muted font-medium">السنة</th>
                  <th className="text-left py-2 ink-muted font-medium">إجمالي السلف</th>
                  <th className="text-left py-2 ink-muted font-medium">إجمالي الخصومات</th>
                  <th className="text-left py-2 ink-muted font-medium">الصافي</th>
                  <th className="text-left py-2 ink-muted font-medium">نسبة التحصيل</th>
                </tr>
              </thead>
              <tbody>
                {yearlyComparison.map((y) => {
                  const rate = y.سلف > 0 ? (y.خصومات / y.سلف) * 100 : 0;
                  return (
                    <tr key={y.year} className="border-b divider row-hover">
                      <td className="py-2.5 num font-medium">{y.year}</td>
                      <td className="py-2.5 num text-left accent-emerald">{fmt(y.سلف)}</td>
                      <td className="py-2.5 num text-left accent-burgundy">{fmt(y.خصومات)}</td>
                      <td className="py-2.5 num text-left font-semibold">{fmt(y.سلف - y.خصومات)}</td>
                      <td className="py-2.5 num text-left">{rate.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === TOP BORROWERS === */}
      {reportType === 'top' && (
        <div className="card rounded-lg p-6">
          <h3 className="font-semibold ink mb-4">أعلى 10 موظفين سلفاً</h3>
          {topBorrowers.length === 0 ? (
            <div className="text-center py-8 ink-muted">لا توجد بيانات</div>
          ) : (
            <>
              <div className="w-full mb-6" style={{ height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={topBorrowers} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" />
                    <XAxis type="number" tick={{ fill: '#78716C', fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <YAxis dataKey="name" type="category" tick={{ fill: '#1C1917', fontSize: 11, fontFamily: 'Tajawal' }} width={120} orientation="right" />
                    <Tooltip contentStyle={{ background: '#FFFEF9', border: '1px solid #E8DFC8', borderRadius: 6, fontFamily: 'Tajawal' }} formatter={(v) => fmt(v) + ' ر.س'} />
                    <Bar dataKey="totalAdv" fill="#1F4D3F" radius={[0, 6, 6, 0]} name="إجمالي السلف" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b divider">
                      <th className="text-right py-2 ink-muted font-medium">#</th>
                      <th className="text-right py-2 ink-muted font-medium">الموظف</th>
                      <th className="text-right py-2 ink-muted font-medium hidden md:table-cell">القسم</th>
                      <th className="text-right py-2 ink-muted font-medium hidden md:table-cell">الراتب</th>
                      <th className="text-left py-2 ink-muted font-medium">إجمالي السلف</th>
                      <th className="text-left py-2 ink-muted font-medium hidden lg:table-cell">المسدد</th>
                      <th className="text-left py-2 ink-muted font-medium">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topBorrowers.map((e, idx) => (
                      <tr key={e.id} className="border-b divider row-hover">
                        <td className="py-2.5 ink-muted text-xs">{idx + 1}</td>
                        <td className="py-2.5 ink font-medium">
                          {e.name}
                          <div className="text-xs ink-muted num">{e.iqama}</div>
                        </td>
                        <td className="py-2.5 ink-muted text-xs hidden md:table-cell">{e.department || '-'}</td>
                        <td className="py-2.5 num text-right ink-muted text-xs hidden md:table-cell">{e.salary ? fmt(e.salary) : '-'}</td>
                        <td className="py-2.5 num text-left accent-emerald font-semibold">{fmt(e.totalAdv)}</td>
                        <td className="py-2.5 num text-left ink-muted hidden lg:table-cell">{fmt(e.totalDed)}</td>
                        <td className={`py-2.5 num text-left font-semibold ${e.balance > 0 ? 'accent-burgundy' : 'ink-muted'}`}>{fmt(e.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* === BY DEPARTMENT === */}
      {reportType === 'dept' && (
        <div className="card rounded-lg p-6">
          <h3 className="font-semibold ink mb-4">تحليل حسب الأقسام</h3>
          {byDepartment.length === 0 ? (
            <div className="text-center py-8 ink-muted">لا توجد بيانات أقسام</div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div>
                  <h4 className="text-sm font-medium ink mb-2">توزيع السلف</h4>
                  <div className="w-full" style={{ height: 260 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={byDepartment} dataKey="totalAdv" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(d) => d.name}>
                          {byDepartment.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => fmt(v) + ' ر.س'} contentStyle={{ fontFamily: 'Tajawal', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium ink mb-2">الأرصدة المستحقة</h4>
                  <div className="w-full" style={{ height: 260 }}>
                    <ResponsiveContainer>
                      <BarChart data={byDepartment} margin={{ top: 5, right: 5, left: 5, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" />
                        <XAxis dataKey="name" tick={{ fill: '#78716C', fontSize: 10, fontFamily: 'Tajawal' }} angle={-30} textAnchor="end" />
                        <YAxis tick={{ fill: '#78716C', fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} orientation="right" />
                        <Tooltip formatter={(v) => fmt(v) + ' ر.س'} contentStyle={{ fontFamily: 'Tajawal', fontSize: 12 }} />
                        <Bar dataKey="balance" fill="#8B2635" radius={[6, 6, 0, 0]} name="الرصيد" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b divider">
                      <th className="text-right py-2 ink-muted font-medium">القسم</th>
                      <th className="text-right py-2 ink-muted font-medium">عدد الموظفين</th>
                      <th className="text-left py-2 ink-muted font-medium">إجمالي السلف</th>
                      <th className="text-left py-2 ink-muted font-medium">الرصيد المستحق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byDepartment.map((d) => (
                      <tr key={d.name} className="border-b divider row-hover">
                        <td className="py-2.5 ink font-medium">{d.name}</td>
                        <td className="py-2.5 num ink-muted">{fmtInt(d.employees)}</td>
                        <td className="py-2.5 num text-left accent-emerald font-semibold">{fmt(d.totalAdv)}</td>
                        <td className="py-2.5 num text-left accent-burgundy font-semibold">{fmt(d.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* === AGING === */}
      {reportType === 'aging' && (
        <div className="card rounded-lg p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle size={20} className="accent-burgundy mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold ink">تقرير أعمار الذمم (الأقساط المتأخرة)</h3>
              <p className="text-xs ink-muted">توزيع الأقساط المعلقة حسب مدة التأخير</p>
            </div>
          </div>

          {agingChartData.length === 0 ? (
            <div className="text-center py-8 ink-muted text-sm">لا توجد أقساط معلقة</div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
                {agingChartData.map((b) => (
                  <div key={b.name} className="rounded-md p-3 border divider" style={{ background: '#FFFEF9' }}>
                    <div className="text-xs ink-muted">{b.name}</div>
                    <div className="num text-lg font-semibold" style={{ color: b.color }}>{fmt(b.value)}</div>
                  </div>
                ))}
              </div>

              <div className="w-full mb-6" style={{ height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={agingChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" />
                    <XAxis dataKey="name" tick={{ fill: '#78716C', fontSize: 12, fontFamily: 'Tajawal' }} reversed />
                    <YAxis tick={{ fill: '#78716C', fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} orientation="right" />
                    <Tooltip formatter={(v) => fmt(v) + ' ر.س'} contentStyle={{ fontFamily: 'Tajawal', fontSize: 12 }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {agingChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {aging.detail.length > 0 && (
                <div className="overflow-x-auto">
                  <h4 className="text-sm font-medium ink mb-2">تفاصيل الأقساط المتأخرة</h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b divider">
                        <th className="text-right py-2 ink-muted font-medium">الموظف</th>
                        <th className="text-right py-2 ink-muted font-medium">القسط</th>
                        <th className="text-right py-2 ink-muted font-medium">تاريخ الاستحقاق</th>
                        <th className="text-right py-2 ink-muted font-medium">أيام التأخير</th>
                        <th className="text-left py-2 ink-muted font-medium">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aging.detail.map((i) => (
                        <tr key={i.id} className="border-b divider row-hover">
                          <td className="py-2.5 ink font-medium">{empById[i.employeeId]?.name || '-'}</td>
                          <td className="py-2.5 num text-xs ink-muted">{i.installmentNo}/{i.totalInstallments}</td>
                          <td className="py-2.5 num text-xs">{fmtDate(i.dueDate)}</td>
                          <td className="py-2.5 num accent-burgundy font-semibold text-xs">{i.daysOverdue} يوم</td>
                          <td className="py-2.5 num text-left accent-burgundy font-semibold">{fmt(i.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color, sub, plain }) {
  return (
    <div className="rounded-md p-4 border divider" style={{ background: '#FFFEF9' }}>
      <div className="text-xs ink-muted">{label}</div>
      <div className={`num font-semibold text-2xl mt-1`} style={{ color }}>{value}</div>
      {!plain && <div className="text-xs ink-muted mt-0.5">ر.س{sub ? ` • ${sub}` : ''}</div>}
      {sub && plain && <div className="text-xs ink-muted mt-0.5">{sub}</div>}
    </div>
  );
}
