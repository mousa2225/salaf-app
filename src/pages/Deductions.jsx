import { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Plus, Trash2, Edit, X, Upload, FileSpreadsheet,
  Calendar, Check, CheckCircle, Download,
} from 'lucide-react';
import Modal, { ConfirmModal } from '../components/Modal';
import {
  fmt, fmtDate, todayISO, monthKeyOf, currentMonth, monthLabel, can,
  DEDUCTION_TYPES, findCol, COLS, uid,
} from '../lib/utils';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  STYLES, cell, buildSheet, exportWorkbook, buildTitleBlock, titleBlockMerges,
} from '../lib/excel';

export default function Deductions({
  user, employees, transactions, installments, empById, empByIqama, showToast,
  addTransaction, updateTransaction, deleteTransaction, payInstallment,
}) {
  const [tab, setTab] = useState('list'); // list | installments
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [filterMode, setFilterMode] = useState('month');
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const fileRef = useRef();

  const canAdd = can(user, 'ADD_DEDUCTION');
  const canEdit = can(user, 'EDIT_DEDUCTION');
  const canDelete = can(user, 'DELETE_DEDUCTION');
  const canImport = can(user, 'IMPORT_DEDUCTIONS');

  const deductions = useMemo(() => {
    let list = transactions.filter((t) => t.type === 'deduction');
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
    transactions.filter((t) => t.type === 'deduction').forEach((t) => set.add(monthKeyOf(t.date)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const pendingInstallments = useMemo(() => {
    const todayStr = todayISO();
    return installments
      .filter((i) => i.status === 'pending')
      .map((i) => ({
        ...i,
        overdue: i.dueDate < todayStr,
        thisMonth: monthKeyOf(i.dueDate) === currentMonth(),
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [installments]);

  const handleImport = async (file) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const orgId = user.orgId;
      const empCol = collection(db, 'orgs', orgId, 'employees');
      const txCol = collection(db, 'orgs', orgId, 'transactions');
      const batch = writeBatch(db);
      const localByIqama = { ...empByIqama };

      let added = 0, errors = 0, autoCreated = 0;

      for (const row of rows) {
        const name = (findCol(row, COLS.NAME) || '').toString().trim();
        const iqama = (findCol(row, COLS.IQAMA) || '').toString().trim();
        const amount = Number(findCol(row, COLS.DEDUCT_AMOUNT) || 0);
        const dtype = (findCol(row, COLS.DEDUCT_TYPE) || 'من الراتب الشهري').toString().trim();
        const dateRaw = findCol(row, COLS.DATE);
        const notes = (findCol(row, COLS.NOTES) || '').toString().trim();

        if (!iqama || amount <= 0) { errors++; continue; }

        let emp = localByIqama[iqama];
        if (!emp) {
          if (!name) { errors++; continue; }
          const empId = uid();
          emp = { id: empId, name, iqama };
          batch.set(doc(empCol, empId), {
            name, iqama, phone: '', position: '', department: '',
            salary: 0, status: 'active', maxAdvanceRatio: 0.5,
            createdAt: new Date().toISOString(), createdBy: user.uid,
          });
          localByIqama[iqama] = emp;
          autoCreated++;
        }

        let date = todayISO();
        if (dateRaw) {
          if (typeof dateRaw === 'number') {
            const d = XLSX.SSF.parse_date_code(dateRaw);
            if (d) date = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
          } else {
            const parsed = new Date(dateRaw);
            if (!isNaN(parsed)) date = parsed.toISOString().slice(0, 10);
          }
        }

        const txId = uid();
        batch.set(doc(txCol, txId), {
          employeeId: emp.id, type: 'deduction', amount, date,
          deductionType: dtype, notes,
          voucherNo: `D-IMP-${Date.now().toString(36).slice(-4).toUpperCase()}-${added}`,
          createdAt: new Date().toISOString(), createdBy: user.uid,
        });
        added++;
      }

      await batch.commit();
      showToast(`تم: ${added} خصم، ${autoCreated} موظف جديد، ${errors} متجاهل`);
    } catch (e) {
      console.error(e);
      showToast('فشل قراءة الملف', 'error');
    }
  };

  const downloadTemplate = () => {
    const data = [{
      'اسم الموظف': 'محمد أحمد',
      'رقم الإقامة': '2123456789',
      'المبلغ': 500,
      'نوع الخصم': 'من الراتب الشهري',
      'التاريخ': todayISO(),
      'ملاحظات': '',
    }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الخصومات');
    XLSX.writeFile(wb, 'قالب_الخصومات.xlsx');
  };

  // ========== Styled Excel Export ==========
  const exportDeductionsXLSX = () => {
    const totalAmount = deductions.reduce((s, t) => s + Number(t.amount), 0);
    const uniqueEmps = new Set(deductions.map((d) => d.employeeId)).size;

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
      periodText = 'جميع الخصومات';
      fileSuffix = 'كامل';
    }

    const colsCount = 7;
    const rows = [];

    const headerInfo = [
      ['تاريخ التقرير', fmtDate(todayISO())],
      ['الفترة', periodText],
      ['عدد الخصومات', `${deductions.length} خصم`],
      ['عدد الموظفين', `${uniqueEmps} موظف`],
      ['أعدّه', user.displayName || user.email],
    ];
    rows.push(...buildTitleBlock({
      title: '➖ تقرير الخصومات',
      subtitle: periodText,
      info: headerInfo,
      colsCount,
    }));
    const merges = titleBlockMerges({ colsCount, hasSubtitle: true, numInfoRows: headerInfo.length });

    // Section
    const sectionIdx = rows.length;
    const sectionRow = Array.from({ length: colsCount }, () => cell('', STYLES.sectionHeader));
    sectionRow[0] = cell('  📋 تفاصيل الخصومات', STYLES.sectionHeader);
    rows.push(sectionRow);
    merges.push({ s: { r: sectionIdx, c: 0 }, e: { r: sectionIdx, c: colsCount - 1 } });

    // Headers
    const headers = ['رقم السند', 'التاريخ', 'اسم الموظف', 'رقم الإقامة', 'نوع الخصم', 'ملاحظات', 'المبلغ'];
    rows.push(headers.map((h) => cell(h, STYLES.th)));

    deductions.forEach((t, idx) => {
      const alt = idx % 2 === 1;
      const emp = empById[t.employeeId];
      rows.push([
        cell(t.voucherNo || '-', STYLES.tdCenter(alt)),
        cell(fmtDate(t.date), STYLES.date(alt)),
        cell(emp?.name || '—', STYLES.tdBold(alt)),
        cell(emp?.iqama || '-', STYLES.tdCenter(alt)),
        cell(t.deductionType || '-', STYLES.tdMuted(alt)),
        cell(t.notes || '-', STYLES.tdMuted(alt)),
        cell(Number(t.amount), STYLES.numRed(alt), true),
      ]);
    });

    // Total
    rows.push([
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('الإجمالي', STYLES.totalLabel),
      cell(totalAmount, STYLES.totalNum, true),
    ]);

    const cols = [
      { wch: 14 }, { wch: 13 }, { wch: 25 }, { wch: 14 },
      { wch: 22 }, { wch: 25 }, { wch: 14 },
    ];
    const rowHeights = [];
    rowHeights[0] = { hpt: 30 };
    rowHeights[1] = { hpt: 20 };
    for (let i = 2; i < 2 + headerInfo.length; i++) rowHeights[i] = { hpt: 20 };
    rowHeights[sectionIdx] = { hpt: 24 };
    rowHeights[sectionIdx + 1] = { hpt: 28 };

    const ws = buildSheet(rows, { cols, rows: rowHeights, merges });
    exportWorkbook(
      [{ name: 'الخصومات', ws }],
      `خصومات_${fileSuffix}_${todayISO()}.xlsx`
    );
    showToast('تم تنزيل تقرير الخصومات');
  };

  return (
    <div className="space-y-6">
      <div className="card rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
          <div>
            <h2 className="display text-2xl font-bold ink">الخصومات</h2>
            <p className="text-sm ink-muted">تسجيل ومتابعة الخصومات والأقساط</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(user, 'EXPORT_DATA') && deductions.length > 0 && (
              <button onClick={exportDeductionsXLSX} className="btn-secondary px-3 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2" style={{ background: '#F4F8F5', color: '#1F4D3F', borderColor: '#1F4D3F' }}>
                <Download size={16} /> تنزيل Excel
              </button>
            )}
            {canImport && (
              <>
                <button onClick={downloadTemplate} className="btn-ghost px-3 py-2 rounded-md text-sm inline-flex items-center gap-2">
                  <FileSpreadsheet size={16} /> القالب
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }} />
                <button onClick={() => fileRef.current?.click()} className="btn-secondary px-3 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2">
                  <Upload size={16} /> رفع إكسل
                </button>
              </>
            )}
            {canAdd && (
              <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary px-4 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2">
                <Plus size={16} /> خصم جديد
              </button>
            )}
          </div>
        </div>

        {/* Sub tabs */}
        <div className="flex gap-1 mb-4 border-b divider">
          <button onClick={() => setTab('list')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'list' ? 'border-current accent-emerald' : 'border-transparent ink-muted'}`}>
            الخصومات المسجلة
          </button>
          <button onClick={() => setTab('installments')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'installments' ? 'border-current accent-emerald' : 'border-transparent ink-muted'}`}>
            الأقساط المعلقة
            {pendingInstallments.length > 0 && (
              <span className="badge badge-amber mr-2">{pendingInstallments.length}</span>
            )}
          </button>
        </div>

        {tab === 'list' && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-md border divider" style={{ background: '#FCF8EC' }}>
              <Calendar size={14} className="ink-muted" />
              <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} className="input-base !py-1.5 !w-auto text-sm">
                <option value="month">حسب الشهر</option>
                <option value="range">من تاريخ - إلى تاريخ</option>
                <option value="all">جميع الخصومات</option>
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

              <span className="text-xs ink-muted mr-auto num">{deductions.length} نتيجة</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b divider">
                    <th className="text-right py-2 ink-muted font-medium">#</th>
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
                      <td className="py-2.5 num text-xs ink-muted">{t.voucherNo || '-'}</td>
                      <td className="py-2.5 num">{fmtDate(t.date)}</td>
                      <td className="py-2.5 ink font-medium">{empById[t.employeeId]?.name || '—'}</td>
                      <td className="py-2.5 ink-muted text-xs">{t.deductionType}</td>
                      <td className="py-2.5 ink-muted text-xs hidden md:table-cell">{t.notes || '-'}</td>
                      <td className="py-2.5 num text-left accent-burgundy font-semibold">{fmt(t.amount)}</td>
                      <td className="py-2.5 text-left whitespace-nowrap">
                        {canEdit && (
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
                {deductions.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 divider">
                      <td colSpan="5" className="py-3 ink font-semibold text-right">الإجمالي</td>
                      <td className="py-3 num text-left accent-burgundy font-bold text-base">
                        {fmt(deductions.reduce((s, t) => s + Number(t.amount), 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {deductions.length === 0 && (
                <div className="text-center py-8 ink-muted text-sm">لا توجد خصومات في هذا الشهر</div>
              )}
            </div>
          </>
        )}

        {tab === 'installments' && (
          <div className="overflow-x-auto">
            {pendingInstallments.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle size={40} className="mx-auto mb-3 accent-emerald" />
                <div className="ink font-medium">لا توجد أقساط معلقة</div>
                <div className="text-sm ink-muted mt-1">جميع الأقساط تم تسديدها</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b divider">
                    <th className="text-right py-2 ink-muted font-medium">الموظف</th>
                    <th className="text-right py-2 ink-muted font-medium">القسط</th>
                    <th className="text-right py-2 ink-muted font-medium">تاريخ الاستحقاق</th>
                    <th className="text-right py-2 ink-muted font-medium hidden md:table-cell">نوع الخصم</th>
                    <th className="text-left py-2 ink-muted font-medium">المبلغ</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInstallments.map((i) => (
                    <tr key={i.id} className="border-b divider row-hover">
                      <td className="py-2.5 ink font-medium">{empById[i.employeeId]?.name || '—'}</td>
                      <td className="py-2.5 ink-muted text-xs num">{i.installmentNo}/{i.totalInstallments}</td>
                      <td className="py-2.5 num text-xs">
                        {fmtDate(i.dueDate)}
                        {i.overdue && <span className="badge badge-burgundy mr-2">متأخر</span>}
                        {i.thisMonth && !i.overdue && <span className="badge badge-amber mr-2">هذا الشهر</span>}
                      </td>
                      <td className="py-2.5 ink-muted text-xs hidden md:table-cell">{i.deductionType}</td>
                      <td className="py-2.5 num text-left accent-amber font-semibold">{fmt(i.amount)}</td>
                      <td className="py-2.5 text-left">
                        {canAdd && (
                          <button onClick={() => payInstallment(i)}
                            className="btn-primary px-3 py-1.5 rounded text-xs font-medium inline-flex items-center gap-1">
                            <Check size={12} /> تسجيل التسديد
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <DeductionForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        editing={editing}
        employees={employees}
        onSave={async (data) => {
          if (editing) {
            const ok = await updateTransaction(editing.id, data);
            if (ok) { setShowForm(false); setEditing(null); }
          } else {
            const ok = await addTransaction({ ...data, type: 'deduction' });
            if (ok) { setShowForm(false); showToast('تم تسجيل الخصم'); }
          }
        }}
      />

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => { if (confirmDel) deleteTransaction(confirmDel.id); }}
        title="حذف الخصم"
        message={`هل تريد حذف هذا الخصم بمبلغ ${confirmDel ? fmt(confirmDel.amount) : ''} ر.س؟`}
        confirmLabel="حذف"
        danger
      />
    </div>
  );
}

function DeductionForm({ open, onClose, editing, employees, onSave }) {
  const initial = {
    employeeId: '', amount: '', date: todayISO(),
    deductionType: DEDUCTION_TYPES[0], notes: '',
  };
  const [form, setForm] = useState(initial);
  const [empSearch, setEmpSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && editing) {
      setForm({
        employeeId: editing.employeeId,
        amount: editing.amount,
        date: editing.date,
        deductionType: editing.deductionType || DEDUCTION_TYPES[0],
        notes: editing.notes || '',
      });
    } else if (open) {
      setForm(initial);
      setEmpSearch('');
    }
    // eslint-disable-next-line
  }, [open, editing]);

  const filteredEmps = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      e.name.toLowerCase().includes(q) || String(e.iqama).includes(q)
    );
  }, [employees, empSearch]);

  const selectedEmp = form.employeeId ? employees.find((e) => e.id === form.employeeId) : null;

  const submit = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'تعديل خصم' : 'تسجيل خصم جديد'} size="md">
      <div className="space-y-4">
        {!editing && (
          <div>
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
                <input className="input-base" placeholder="ابحث بالاسم أو الإقامة..."
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
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="المبلغ *">
            <input type="number" step="0.01" className="input-base num" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="نوع الخصم *">
            <select className="input-base" value={form.deductionType}
              onChange={(e) => setForm({ ...form, deductionType: e.target.value })}>
              {DEDUCTION_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="التاريخ">
            <input type="date" className="input-base" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="ملاحظات">
            <input className="input-base" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t divider">
        <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-md text-sm">إلغاء</button>
        <button onClick={submit} disabled={saving || !form.employeeId || !form.amount} className="btn-primary px-5 py-2 rounded-md text-sm font-medium">
          {saving ? 'جاري الحفظ...' : (editing ? 'حفظ التعديل' : 'تسجيل الخصم')}
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs ink-muted block mb-1">{label}</label>
      {children}
    </div>
  );
}
