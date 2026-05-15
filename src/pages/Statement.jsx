import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Users, Search, Download, Printer } from 'lucide-react';
import { fmt, fmtDate, todayISO, can, EMPLOYEE_STATUS } from '../lib/utils';

export default function Statement({
  user, employees, transactions, installments, balances, showToast,
}) {
  const [empId, setEmpId] = useState('');
  const [search, setSearch] = useState('');

  const canExport = can(user, 'EXPORT_DATA');

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
    const txs = transactions.filter((t) => t.employeeId === emp.id)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    let running = 0;
    return txs.map((t) => {
      const isAdv = t.type === 'advance';
      running += isAdv ? Number(t.amount) : -Number(t.amount);
      return { ...t, running };
    }).reverse();
  }, [emp, transactions]);

  const empInstallments = useMemo(() => {
    if (!emp) return [];
    return installments.filter((i) => i.employeeId === emp.id)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [emp, installments]);

  const stats = useMemo(() => {
    if (!emp) return { adv: 0, ded: 0, count: 0 };
    const txs = transactions.filter((t) => t.employeeId === emp.id);
    return {
      adv: txs.filter((t) => t.type === 'advance').reduce((s, t) => s + Number(t.amount), 0),
      ded: txs.filter((t) => t.type === 'deduction').reduce((s, t) => s + Number(t.amount), 0),
      count: txs.length,
      pendingInst: empInstallments.filter((i) => i.status === 'pending').length,
    };
  }, [emp, transactions, empInstallments]);

  const exportXLSX = () => {
    if (!emp) return;
    const sortedLedger = [...ledger].reverse();
    let running = 0;
    const rows = sortedLedger.map((t) => {
      const isAdv = t.type === 'advance';
      running += isAdv ? Number(t.amount) : -Number(t.amount);
      return {
        '#': t.voucherNo || '',
        'التاريخ': t.date,
        'البيان': isAdv ? `سلفة${t.installmentPlanId ? ' (بأقساط)' : ''}` : `خصم - ${t.deductionType || ''}`,
        'مدين (سلفة)': isAdv ? Number(t.amount) : '',
        'دائن (خصم)': isAdv ? '' : Number(t.amount),
        'الرصيد': running,
        'ملاحظات': t.notes || '',
      };
    });

    rows.push({});
    rows.push({ '#': '', 'التاريخ': 'الرصيد المستحق', 'البيان': '', 'مدين (سلفة)': '', 'دائن (خصم)': '', 'الرصيد': running });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 25 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'كشف الحساب');

    const info = [
      { 'البيان': 'اسم الموظف', 'القيمة': emp.name },
      { 'البيان': 'رقم الإقامة', 'القيمة': emp.iqama },
      { 'البيان': 'الجوال', 'القيمة': emp.phone || '-' },
      { 'البيان': 'الوظيفة', 'القيمة': emp.position || '-' },
      { 'البيان': 'القسم', 'القيمة': emp.department || '-' },
      { 'البيان': 'الراتب', 'القيمة': emp.salary || '-' },
      { 'البيان': 'تاريخ التوظيف', 'القيمة': emp.hireDate || '-' },
      { 'البيان': '---', 'القيمة': '---' },
      { 'البيان': 'تاريخ الكشف', 'القيمة': todayISO() },
      { 'البيان': 'إجمالي السلف', 'القيمة': stats.adv },
      { 'البيان': 'إجمالي المخصوم', 'القيمة': stats.ded },
      { 'البيان': 'الرصيد المستحق', 'القيمة': stats.adv - stats.ded },
    ];
    const wsInfo = XLSX.utils.json_to_sheet(info);
    wsInfo['!cols'] = [{ wch: 25 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'بيانات الموظف');

    if (empInstallments.length > 0) {
      const instRows = empInstallments.map((i) => ({
        'القسط': `${i.installmentNo}/${i.totalInstallments}`,
        'تاريخ الاستحقاق': i.dueDate,
        'المبلغ': i.amount,
        'الحالة': i.status === 'paid' ? 'مسدد' : 'معلق',
        'تاريخ السداد': i.paidAt ? i.paidAt.slice(0, 10) : '',
        'نوع الخصم': i.deductionType || '',
      }));
      const wsInst = XLSX.utils.json_to_sheet(instRows);
      wsInst['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsInst, 'الأقساط');
    }

    XLSX.writeFile(wb, `كشف_${emp.name}_${todayISO()}.xlsx`);
    showToast('تم تنزيل كشف الحساب');
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
        <h2 className="display text-2xl font-bold ink mb-4">كشف حساب الموظف</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 ink-muted" />
            <input className="input-base pr-10" placeholder="ابحث بالاسم أو الإقامة..."
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
            {/* Employee Info */}
            <div className="p-4 rounded-md border divider mb-4" style={{ background: '#FCF8EC' }}>
              <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
                <div>
                  <div className="display text-xl font-bold ink">{emp.name}</div>
                  <div className="text-xs ink-muted">
                    {emp.position || 'غير محدد'}
                    {emp.department && <> • {emp.department}</>}
                  </div>
                </div>
                <span className={`badge ${EMPLOYEE_STATUS[emp.status || 'active'].class}`}>
                  {EMPLOYEE_STATUS[emp.status || 'active'].label}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Info label="رقم الإقامة" value={emp.iqama} mono />
                <Info label="الجوال" value={emp.phone || '-'} mono />
                <Info label="الراتب" value={emp.salary ? fmt(emp.salary) : '-'} mono />
                <Info label="تاريخ التوظيف" value={emp.hireDate ? fmtDate(emp.hireDate) : '-'} />
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Summary label="إجمالي السلف" value={stats.adv} color="#1F4D3F" />
              <Summary label="إجمالي المسدد" value={stats.ded} color="#475569" />
              <Summary label="الرصيد المستحق" value={stats.adv - stats.ded} color="#8B2635" big />
              <Summary label="أقساط معلقة" value={stats.pendingInst} color="#B45309" plain />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
              {canExport && (
                <>
                  <button onClick={() => window.print()} className="btn-ghost px-3 py-2 rounded-md text-sm inline-flex items-center gap-2">
                    <Printer size={14} /> طباعة
                  </button>
                  <button onClick={exportXLSX} className="btn-primary px-4 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2">
                    <Download size={14} /> تنزيل كشف الحساب
                  </button>
                </>
              )}
            </div>

            {/* Ledger */}
            <div className="overflow-x-auto">
              <h4 className="font-semibold ink mb-2">دفتر الحركات</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b divider" style={{ background: '#F4F0E3' }}>
                    <th className="text-right py-2 px-2 ink-muted font-medium">#</th>
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
                      <td className="py-2.5 px-2 num text-xs ink-muted">{t.voucherNo || '-'}</td>
                      <td className="py-2.5 px-2 num">{fmtDate(t.date)}</td>
                      <td className="py-2.5 px-2 ink">
                        {t.type === 'advance' ? (
                          <span className="accent-emerald font-medium">
                            سلفة {t.installmentPlanId && <span className="badge badge-blue mr-1">بأقساط</span>}
                          </span>
                        ) : (
                          <span>
                            <span className="accent-burgundy font-medium">خصم</span>
                            <span className="ink-muted text-xs"> — {t.deductionType}</span>
                          </span>
                        )}
                        {t.notes && <div className="text-xs ink-muted mt-0.5">{t.notes}</div>}
                      </td>
                      <td className="py-2.5 px-2 num text-left accent-emerald">
                        {t.type === 'advance' ? fmt(t.amount) : ''}
                      </td>
                      <td className="py-2.5 px-2 num text-left accent-burgundy">
                        {t.type === 'deduction' ? fmt(t.amount) : ''}
                      </td>
                      <td className="py-2.5 px-2 num text-left font-semibold ink">{fmt(t.running)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ledger.length === 0 && <div className="text-center py-8 ink-muted text-sm">لا توجد حركات</div>}
            </div>

            {/* Installments schedule */}
            {empInstallments.length > 0 && (
              <div className="mt-6">
                <h4 className="font-semibold ink mb-2">جدول الأقساط</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b divider" style={{ background: '#F4F0E3' }}>
                        <th className="text-right py-2 px-2 ink-muted font-medium">القسط</th>
                        <th className="text-right py-2 px-2 ink-muted font-medium">تاريخ الاستحقاق</th>
                        <th className="text-right py-2 px-2 ink-muted font-medium">نوع الخصم</th>
                        <th className="text-right py-2 px-2 ink-muted font-medium">الحالة</th>
                        <th className="text-left py-2 px-2 ink-muted font-medium">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empInstallments.map((i) => (
                        <tr key={i.id} className="border-b divider">
                          <td className="py-2.5 px-2 num text-xs">{i.installmentNo}/{i.totalInstallments}</td>
                          <td className="py-2.5 px-2 num">{fmtDate(i.dueDate)}</td>
                          <td className="py-2.5 px-2 ink-muted text-xs">{i.deductionType}</td>
                          <td className="py-2.5 px-2">
                            <span className={`badge ${i.status === 'paid' ? 'badge-emerald' : 'badge-amber'}`}>
                              {i.status === 'paid' ? 'مسدد' : 'معلق'}
                            </span>
                            {i.paidAt && <div className="text-xs ink-muted mt-0.5 num">{fmtDate(i.paidAt)}</div>}
                          </td>
                          <td className="py-2.5 px-2 num text-left font-medium">{fmt(i.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, mono }) {
  return (
    <div>
      <div className="text-xs ink-muted mb-0.5">{label}</div>
      <div className={`ink font-medium ${mono ? 'num' : ''}`}>{value}</div>
    </div>
  );
}

function Summary({ label, value, color, big, plain }) {
  return (
    <div className="rounded-md p-3 border divider" style={{ background: '#FFFEF9' }}>
      <div className="text-xs ink-muted">{label}</div>
      <div className={`num font-semibold ${big ? 'text-2xl' : 'text-xl'}`} style={{ color }}>
        {plain ? value : fmt(value)}
      </div>
    </div>
  );
}
