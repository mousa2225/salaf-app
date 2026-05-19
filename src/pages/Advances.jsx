import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Trash2, Edit, X, AlertTriangle, Info, Calendar, Download,
} from 'lucide-react';
import Modal, { ConfirmModal } from '../components/Modal';
import {
  fmt, fmtDate, todayISO, monthKeyOf, currentMonth, monthLabel, can, DEDUCTION_TYPES, addMonths,
} from '../lib/utils';
import {
  STYLES, cell, buildSheet, exportWorkbook, buildTitleBlock, titleBlockMerges,
} from '../lib/excel';

export default function Advances({
  user, employees, transactions, installments, empById, balances, showToast,
  addTransaction, updateTransaction, deleteTransaction,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [filterMode, setFilterMode] = useState('month'); // 'month' | 'range' | 'all'
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const canAdd = can(user, 'ADD_ADVANCE');
  const canEdit = can(user, 'EDIT_ADVANCE');
  const canDelete = can(user, 'DELETE_ADVANCE');

  const advances = useMemo(() => {
    let list = transactions.filter((t) => t.type === 'advance');
    if (filterMode === 'month') {
      list = list.filter((t) => monthKeyOf(t.date) === filterMonth);
    } else if (filterMode === 'range' && (fromDate || toDate)) {
      if (fromDate) list = list.filter((t) => t.date >= fromDate);
      if (toDate) list = list.filter((t) => t.date <= toDate);
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, filterMode, filterMonth, fromDate, toDate]);

  const allMonths = useMemo(() => {
    const set = new Set([currentMonth()]);
    transactions.filter((t) => t.type === 'advance').forEach((t) => set.add(monthKeyOf(t.date)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const stats = useMemo(() => {
    const total = advances.reduce((s, t) => s + Number(t.amount), 0);
    const uniqueEmps = new Set(advances.map((a) => a.employeeId)).size;
    const withInstallment = advances.filter((a) => a.installmentPlanId).length;
    return { total, count: advances.length, uniqueEmps, withInstallment };
  }, [advances]);

  // ========== Styled Excel Export ==========
  const exportAdvancesXLSX = () => {
    const colsCount = 8;
    const rows = [];

    // Build period description based on filter
    let periodText = '';
    let fileSuffix = '';
    if (filterMode === 'month') {
      periodText = monthLabel(filterMonth);
      fileSuffix = filterMonth;
    } else if (filterMode === 'range') {
      if (fromDate && toDate) {
        periodText = `من ${fmtDate(fromDate)} إلى ${fmtDate(toDate)}`;
        fileSuffix = `${fromDate}_إلى_${toDate}`;
      } else if (fromDate) {
        periodText = `من ${fmtDate(fromDate)}`;
        fileSuffix = `من_${fromDate}`;
      } else if (toDate) {
        periodText = `حتى ${fmtDate(toDate)}`;
        fileSuffix = `حتى_${toDate}`;
      } else {
        periodText = 'كل الفترات';
        fileSuffix = 'الكل';
      }
    } else {
      periodText = 'جميع السلف';
      fileSuffix = 'كامل';
    }

    const headerInfo = [
      ['تاريخ التقرير', fmtDate(todayISO())],
      ['الفترة', periodText],
      ['عدد السلف', `${stats.count} سلفة`],
      ['عدد الموظفين', `${stats.uniqueEmps} موظف`],
      ['أعدّه', user.displayName || user.email],
    ];
    rows.push(...buildTitleBlock({
      title: '💰 تقرير السلف',
      subtitle: periodText,
      info: headerInfo,
      colsCount,
    }));
    const merges = titleBlockMerges({ colsCount, hasSubtitle: true, numInfoRows: headerInfo.length });

    // Section
    const sectionIdx = rows.length;
    const sectionRow = Array.from({ length: colsCount }, () => cell('', STYLES.sectionHeader));
    sectionRow[0] = cell('  📋 تفاصيل السلف', STYLES.sectionHeader);
    rows.push(sectionRow);
    merges.push({ s: { r: sectionIdx, c: 0 }, e: { r: sectionIdx, c: colsCount - 1 } });

    // Headers
    const headers = ['رقم السند', 'التاريخ', 'اسم الموظف', 'رقم الإقامة', 'القسم', 'النوع', 'ملاحظات', 'المبلغ'];
    rows.push(headers.map((h) => cell(h, STYLES.th)));

    advances.forEach((t, idx) => {
      const alt = idx % 2 === 1;
      const emp = empById[t.employeeId];
      rows.push([
        cell(t.voucherNo || '-', STYLES.tdCenter(alt)),
        cell(fmtDate(t.date), STYLES.date(alt)),
        cell(emp?.name || '—', STYLES.tdBold(alt)),
        cell(emp?.iqama || '-', STYLES.tdCenter(alt)),
        cell(emp?.department || '-', STYLES.tdMuted(alt)),
        cell(t.installmentPlanId ? 'بالتقسيط' : 'دفعة واحدة',
             t.installmentPlanId ? STYLES.badgeBlue : STYLES.badgeGreen),
        cell(t.notes || '-', STYLES.tdMuted(alt)),
        cell(Number(t.amount), STYLES.numGreen(alt), true),
      ]);
    });

    // Total
    rows.push([
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('الإجمالي', STYLES.totalLabel),
      cell(stats.total, STYLES.totalNum, true),
    ]);

    const cols = [
      { wch: 12 }, { wch: 13 }, { wch: 25 }, { wch: 14 },
      { wch: 15 }, { wch: 13 }, { wch: 25 }, { wch: 14 },
    ];
    const rowHeights = [];
    rowHeights[0] = { hpt: 30 };
    rowHeights[1] = { hpt: 20 };
    for (let i = 2; i < 2 + headerInfo.length; i++) rowHeights[i] = { hpt: 20 };
    rowHeights[sectionIdx] = { hpt: 24 };
    rowHeights[sectionIdx + 1] = { hpt: 28 };

    const ws = buildSheet(rows, { cols, rows: rowHeights, merges });
    exportWorkbook(
      [{ name: 'السلف', ws }],
      `سلف_${fileSuffix}_${todayISO()}.xlsx`
    );
    showToast('تم تنزيل تقرير السلف');
  };

  return (
    <div className="space-y-6">
      <div className="card rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
          <div>
            <h2 className="display text-2xl font-bold ink">السلف</h2>
            <p className="text-sm ink-muted">تسجيل ومتابعة السلف الممنوحة للموظفين</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(user, 'EXPORT_DATA') && advances.length > 0 && (
              <button onClick={exportAdvancesXLSX} className="btn-secondary px-3 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2" style={{ background: '#F4F8F5', color: '#1F4D3F', borderColor: '#1F4D3F' }}>
                <Download size={16} /> تنزيل Excel
              </button>
            )}
            {canAdd && (
              <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary px-4 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2">
                <Plus size={16} /> سلفة جديدة
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="rounded-md p-3 border divider" style={{ background: '#F4F8F5' }}>
            <div className="text-xs ink-muted">إجمالي الشهر</div>
            <div className="num text-lg font-semibold accent-emerald">{fmt(stats.total)}</div>
          </div>
          <div className="rounded-md p-3 border divider">
            <div className="text-xs ink-muted">عدد السلف</div>
            <div className="num text-lg font-semibold ink">{stats.count}</div>
          </div>
          <div className="rounded-md p-3 border divider">
            <div className="text-xs ink-muted">عدد الموظفين</div>
            <div className="num text-lg font-semibold ink">{stats.uniqueEmps}</div>
          </div>
          <div className="rounded-md p-3 border divider">
            <div className="text-xs ink-muted">بأقساط</div>
            <div className="num text-lg font-semibold accent-blue">{stats.withInstallment}</div>
          </div>
        </div>

        {/* Filter */}
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-md border divider" style={{ background: '#FCF8EC' }}>
          <Calendar size={14} className="ink-muted" />
          <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} className="input-base !py-1.5 !w-auto text-sm">
            <option value="month">حسب الشهر</option>
            <option value="range">من تاريخ - إلى تاريخ</option>
            <option value="all">جميع السلف</option>
          </select>

          {filterMode === 'month' && (
            <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="input-base !py-1.5 !w-auto text-sm">
              {allMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          )}

          {filterMode === 'range' && (
            <>
              <span className="text-xs ink-muted">من:</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="input-base !py-1.5 !w-auto text-sm" />
              <span className="text-xs ink-muted">إلى:</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="input-base !py-1.5 !w-auto text-sm" />
              {(fromDate || toDate) && (
                <button onClick={() => { setFromDate(''); setToDate(''); }} className="btn-ghost text-xs px-2 py-1 rounded">
                  مسح
                </button>
              )}
            </>
          )}

          <span className="text-xs ink-muted mr-auto num">{advances.length} نتيجة</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b divider">
                <th className="text-right py-2 ink-muted font-medium">#</th>
                <th className="text-right py-2 ink-muted font-medium">التاريخ</th>
                <th className="text-right py-2 ink-muted font-medium">الموظف</th>
                <th className="text-right py-2 ink-muted font-medium hidden md:table-cell">الإقامة</th>
                <th className="text-right py-2 ink-muted font-medium hidden lg:table-cell">ملاحظات</th>
                <th className="text-right py-2 ink-muted font-medium">النوع</th>
                <th className="text-left py-2 ink-muted font-medium">المبلغ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {advances.map((t) => (
                <tr key={t.id} className="border-b divider row-hover">
                  <td className="py-2.5 num text-xs ink-muted">{t.voucherNo || '-'}</td>
                  <td className="py-2.5 num">{fmtDate(t.date)}</td>
                  <td className="py-2.5 ink font-medium">{empById[t.employeeId]?.name || '—'}</td>
                  <td className="py-2.5 num ink-muted hidden md:table-cell">{empById[t.employeeId]?.iqama || '-'}</td>
                  <td className="py-2.5 ink-muted text-xs hidden lg:table-cell">{t.notes || '-'}</td>
                  <td className="py-2.5">
                    {t.installmentPlanId ? (
                      <span className="badge badge-blue">بالتقسيط</span>
                    ) : (
                      <span className="badge badge-gray">دفعة واحدة</span>
                    )}
                  </td>
                  <td className="py-2.5 num text-left accent-emerald font-semibold">{fmt(t.amount)}</td>
                  <td className="py-2.5 text-left whitespace-nowrap">
                    {canEdit && !t.installmentPlanId && (
                      <button onClick={() => { setEditing(t); setShowForm(true); }} className="btn-ghost p-1.5 rounded">
                        <Edit size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setConfirmDel(t)} className="btn-ghost p-1.5 rounded">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {advances.length > 0 && (
              <tfoot>
                <tr className="border-t-2 divider">
                  <td colSpan="6" className="py-3 ink font-semibold text-right">الإجمالي</td>
                  <td className="py-3 num text-left accent-emerald font-bold text-base">{fmt(stats.total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
          {advances.length === 0 && (
            <div className="text-center py-8 ink-muted text-sm">لا توجد سلف في هذا الشهر</div>
          )}
        </div>
      </div>

      <AdvanceForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        editing={editing}
        employees={employees}
        balances={balances}
        onSave={async (data) => {
          if (editing) {
            const ok = await updateTransaction(editing.id, data);
            if (ok) { setShowForm(false); setEditing(null); }
          } else {
            const ok = await addTransaction({ ...data, type: 'advance' });
            if (ok) { setShowForm(false); showToast('تم تسجيل السلفة'); }
          }
        }}
      />

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => { if (confirmDel) deleteTransaction(confirmDel.id); }}
        title="حذف السلفة"
        message={confirmDel?.installmentPlanId
          ? 'هذه السلفة لها أقساط جدولية. سيتم حذفها فقط (الأقساط تبقى في الجدول، احذفها يدوياً إن لزم).'
          : `هل تريد حذف هذه السلفة بمبلغ ${confirmDel ? fmt(confirmDel.amount) : ''} ر.س؟`}
        confirmLabel="حذف"
        danger
      />
    </div>
  );
}

function AdvanceForm({ open, onClose, editing, employees, balances, onSave }) {
  const initialForm = {
    employeeId: '', amount: '', date: todayISO(), notes: '', voucherNo: '',
    useInstallments: false, installments: 3, installmentDeductionType: 'من الراتب الشهري',
    firstInstallmentDate: addMonths(todayISO(), 1),
  };
  const [form, setForm] = useState(initialForm);
  const [empSearch, setEmpSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && editing) {
      setForm({
        employeeId: editing.employeeId,
        amount: editing.amount,
        date: editing.date,
        notes: editing.notes || '',
        voucherNo: editing.voucherNo || '',
        useInstallments: false,
      });
    } else if (open) {
      setForm(initialForm);
      setEmpSearch('');
    }
    // eslint-disable-next-line
  }, [open, editing]);

  const filteredEmps = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    const list = employees.filter((e) => (e.status || 'active') !== 'terminated');
    if (!q) return list;
    return list.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      String(e.iqama).includes(q)
    );
  }, [employees, empSearch]);

  const selectedEmp = form.employeeId ? employees.find((e) => e.id === form.employeeId) : null;

  // Check limit
  const limitCheck = useMemo(() => {
    if (!selectedEmp || !form.amount) return null;
    const amount = Number(form.amount);
    const currentBalance = balances[selectedEmp.id] || 0;
    const newTotal = currentBalance + amount;
    if (selectedEmp.salary > 0 && selectedEmp.maxAdvanceRatio && selectedEmp.maxAdvanceRatio < 999) {
      const limit = selectedEmp.salary * selectedEmp.maxAdvanceRatio;
      if (newTotal > limit) {
        return {
          warning: true,
          message: `الرصيد الجديد (${fmt(newTotal)}) يتجاوز الحد المسموح (${fmt(limit)})`
        };
      }
    }
    return null;
  }, [selectedEmp, form.amount, balances]);

  const installmentPreview = useMemo(() => {
    if (!form.useInstallments || !form.amount || !form.installments) return null;
    const amount = Number(form.amount);
    const n = Number(form.installments);
    if (n < 2) return null;
    const monthly = Math.round((amount / n) * 100) / 100;
    const last = Math.round((amount - monthly * (n - 1)) * 100) / 100;
    return { monthly, last, n };
  }, [form.amount, form.installments, form.useInstallments]);

  const submit = async () => {
    setSaving(true);
    const payload = { ...form };
    if (!form.useInstallments) {
      delete payload.installments;
      delete payload.installmentDeductionType;
      delete payload.firstInstallmentDate;
    }
    await onSave(payload);
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'تعديل السلفة' : 'تسجيل سلفة جديدة'} size="lg">
      <div className="space-y-4">
        {/* Employee picker */}
        {!editing && (
          <div>
            <label className="text-xs ink-muted block mb-1">الموظف *</label>
            {selectedEmp ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-md border divider" style={{ background: '#F4F8F5' }}>
                <div className="min-w-0">
                  <div className="ink font-medium">{selectedEmp.name}</div>
                  <div className="text-xs ink-muted num">
                    إقامة: {selectedEmp.iqama}
                    {selectedEmp.salary > 0 && <> • الراتب: {fmt(selectedEmp.salary)}</>}
                  </div>
                  {selectedEmp.id in balances && balances[selectedEmp.id] > 0 && (
                    <div className="text-xs accent-burgundy mt-0.5 num">رصيد سابق مستحق: {fmt(balances[selectedEmp.id])}</div>
                  )}
                </div>
                <button onClick={() => setForm({ ...form, employeeId: '' })} className="btn-ghost p-1.5 rounded">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  className="input-base"
                  placeholder="ابحث بالاسم أو رقم الإقامة..."
                  value={empSearch}
                  onChange={(e) => { setEmpSearch(e.target.value); setShowPicker(true); }}
                  onFocus={() => setShowPicker(true)}
                />
                {showPicker && empSearch && (
                  <div className="absolute z-10 mt-1 w-full rounded-md shadow-lg max-h-60 overflow-y-auto border divider" style={{ background: '#FFFEF9' }}>
                    {filteredEmps.length === 0 && <div className="p-3 text-sm ink-muted">لا يوجد نتائج</div>}
                    {filteredEmps.slice(0, 20).map((e) => (
                      <button
                        key={e.id}
                        onClick={() => { setForm({ ...form, employeeId: e.id }); setShowPicker(false); setEmpSearch(''); }}
                        className="w-full text-right px-3 py-2 row-hover border-b divider last:border-0"
                      >
                        <div className="ink font-medium">{e.name}</div>
                        <div className="text-xs ink-muted num">{e.iqama} {e.salary > 0 && <>• راتب {fmt(e.salary)}</>}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Limit warning */}
        {limitCheck && (
          <div className="flex items-center gap-2 p-3 rounded-md text-sm" style={{ background: '#FEF3C7', color: '#B45309' }}>
            <AlertTriangle size={16} />
            <span>{limitCheck.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="مبلغ السلفة *">
            <input type="number" step="0.01" className="input-base num" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="التاريخ">
            <input type="date" className="input-base" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
        </div>

        <Field label="ملاحظات">
          <input className="input-base" value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="سبب السلفة، رقم سند، إلخ..." />
        </Field>

        {!editing && (
          <div className="border-t divider pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.useInstallments}
                onChange={(e) => setForm({ ...form, useInstallments: e.target.checked })}
                className="w-4 h-4" />
              <span className="ink font-medium">خصم على أقساط شهرية تلقائية</span>
            </label>

            {form.useInstallments && (
              <div className="mt-3 p-4 rounded-md border divider" style={{ background: '#FCF8EC' }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="عدد الأقساط">
                    <select className="input-base" value={form.installments}
                      onChange={(e) => setForm({ ...form, installments: Number(e.target.value) })}>
                      {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} أشهر</option>)}
                    </select>
                  </Field>
                  <Field label="نوع الخصم">
                    <select className="input-base" value={form.installmentDeductionType}
                      onChange={(e) => setForm({ ...form, installmentDeductionType: e.target.value })}>
                      {DEDUCTION_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="تاريخ أول قسط" full>
                    <input type="date" className="input-base" value={form.firstInstallmentDate}
                      onChange={(e) => setForm({ ...form, firstInstallmentDate: e.target.value })} />
                  </Field>
                </div>

                {installmentPreview && (
                  <div className="mt-3 p-3 rounded-md text-sm flex items-center gap-2" style={{ background: '#DBEAFE', color: '#1E40AF' }}>
                    <Info size={16} />
                    <div className="num">
                      {installmentPreview.n - 1} قسط بقيمة <strong>{fmt(installmentPreview.monthly)}</strong>
                      {installmentPreview.last !== installmentPreview.monthly && (
                        <> + قسط أخير بقيمة <strong>{fmt(installmentPreview.last)}</strong></>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t divider">
        <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-md text-sm">إلغاء</button>
        <button onClick={submit} disabled={saving || !form.employeeId || !form.amount} className="btn-primary px-5 py-2 rounded-md text-sm font-medium">
          {saving ? 'جاري الحفظ...' : (editing ? 'حفظ التعديل' : 'تسجيل السلفة')}
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, children, full }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="text-xs ink-muted block mb-1">{label}</label>
      {children}
    </div>
  );
}
