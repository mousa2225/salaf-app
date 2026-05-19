import { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Plus, Upload, Search, Trash2, Edit, FileSpreadsheet, Download,
} from 'lucide-react';
import Modal, { ConfirmModal } from '../components/Modal';
import { fmt, todayISO, fmtDate, can, EMPLOYEE_STATUS, findCol, COLS, uid } from '../lib/utils';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  STYLES, cell, buildSheet, exportWorkbook, buildTitleBlock, titleBlockMerges,
} from '../lib/excel';

export default function Employees({
  user, employees, balances, showToast, transactions = [],
  addEmployee, updateEmployee, deleteEmployee, empByIqama,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const fileRef = useRef();

  const canAdd = can(user, 'ADD_EMPLOYEE');
  const canEdit = can(user, 'EDIT_EMPLOYEE');
  const canDelete = can(user, 'DELETE_EMPLOYEE');
  const canImport = can(user, 'IMPORT_EMPLOYEES');

  const departments = useMemo(() => {
    const set = new Set();
    employees.forEach((e) => { if (e.department) set.add(e.department); });
    return Array.from(set);
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter !== 'all' && (e.status || 'active') !== statusFilter) return false;
      if (deptFilter !== 'all' && e.department !== deptFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        String(e.iqama).includes(q) ||
        (e.phone || '').includes(q) ||
        (e.position || '').toLowerCase().includes(q) ||
        (e.department || '').toLowerCase().includes(q)
      );
    });
  }, [employees, search, statusFilter, deptFilter]);

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

      let created = 0, updated = 0, advAdded = 0, errors = 0;

      for (const row of rows) {
        const name = (findCol(row, COLS.NAME) || '').toString().trim();
        const iqama = (findCol(row, COLS.IQAMA) || '').toString().trim();
        const phone = (findCol(row, COLS.PHONE) || '').toString().trim();
        const position = (findCol(row, COLS.POSITION) || '').toString().trim();
        const department = (findCol(row, COLS.DEPARTMENT) || '').toString().trim();
        const salary = Number(findCol(row, COLS.SALARY) || 0);
        const hireDate = (findCol(row, COLS.HIRE_DATE) || '').toString().trim();
        const amount = Number(findCol(row, COLS.AMOUNT) || 0);

        if (!name || !iqama) { errors++; continue; }

        let emp = localByIqama[iqama];
        if (!emp) {
          const empId = uid();
          emp = {
            id: empId, name, iqama, phone, position, department, salary,
            hireDate, status: 'active', maxAdvanceRatio: 0.5,
            createdAt: new Date().toISOString(), createdBy: user.uid,
          };
          batch.set(doc(empCol, empId), { ...emp, id: undefined });
          localByIqama[iqama] = emp;
          created++;
        } else {
          const updates = {};
          if (phone && !emp.phone) updates.phone = phone;
          if (position && !emp.position) updates.position = position;
          if (department && !emp.department) updates.department = department;
          if (salary > 0 && !emp.salary) updates.salary = salary;
          if (Object.keys(updates).length) {
            updates.updatedAt = new Date().toISOString();
            batch.update(doc(empCol, emp.id), updates);
          }
          updated++;
        }

        if (amount > 0) {
          const txId = uid();
          batch.set(doc(txCol, txId), {
            employeeId: emp.id, type: 'advance', amount, date: todayISO(),
            deductionType: null, notes: 'رصيد افتتاحي من الاستيراد',
            voucherNo: `A-IMP-${Date.now().toString(36).slice(-4).toUpperCase()}`,
            createdAt: new Date().toISOString(), createdBy: user.uid,
          });
          advAdded++;
        }
      }

      await batch.commit();
      showToast(`تم: ${created} جديد، ${updated} محدث، ${advAdded} سلفة، ${errors} متجاهل`);
    } catch (e) {
      console.error(e);
      showToast('فشل قراءة الملف', 'error');
    }
  };

  const downloadTemplate = () => {
    const data = [{
      'اسم الموظف': 'محمد أحمد',
      'رقم الإقامة': '2123456789',
      'رقم الجوال': '0500000000',
      'الوظيفة': 'فني',
      'القسم': 'الصيانة',
      'الراتب': 4000,
      'تاريخ التوظيف': '2023-01-15',
      'مبلغ السلفة': 1000,
    }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الموظفون');
    XLSX.writeFile(wb, 'قالب_الموظفين.xlsx');
  };

  // ========== Export styled XLSX ==========
  const exportEmployeesXLSX = () => {
    // Compute per-employee totals
    const empSums = {};
    employees.forEach((e) => {
      empSums[e.id] = { adv: 0, ded: 0, advCount: 0, dedCount: 0, lastTx: null };
    });
    transactions.forEach((t) => {
      const s = empSums[t.employeeId];
      if (!s) return;
      if (t.type === 'advance') { s.adv += Number(t.amount); s.advCount++; }
      else { s.ded += Number(t.amount); s.dedCount++; }
      if (!s.lastTx || t.date > s.lastTx) s.lastTx = t.date;
    });

    const totals = {
      employees: filtered.length,
      adv: 0, ded: 0, balance: 0,
    };

    const colsCount = 11;
    const rows = [];

    // Title block
    const headerInfo = [
      ['تاريخ التقرير', fmtDate(todayISO())],
      ['عدد الموظفين', `${filtered.length} موظف`],
      ['أعدّه', user.displayName || user.email],
    ];
    rows.push(...buildTitleBlock({
      title: '📋 قائمة الموظفين الشاملة',
      subtitle: 'تقرير شامل بالأرصدة والسلف والخصومات',
      info: headerInfo,
      colsCount,
    }));
    const merges = titleBlockMerges({ colsCount, hasSubtitle: true, numInfoRows: headerInfo.length });

    // Section header
    const sectionRowIdx = rows.length;
    const sectionRow = Array.from({ length: colsCount }, () => cell('', STYLES.sectionHeader));
    sectionRow[0] = cell('  📊 تفاصيل الموظفين', STYLES.sectionHeader);
    rows.push(sectionRow);
    merges.push({ s: { r: sectionRowIdx, c: 0 }, e: { r: sectionRowIdx, c: colsCount - 1 } });

    // Table header
    const headers = [
      '#', 'الاسم', 'رقم الإقامة', 'الجوال', 'الوظيفة',
      'القسم', 'الراتب', 'إجمالي السلف', 'إجمالي المسدد',
      'الرصيد المستحق', 'الحالة'
    ];
    rows.push(headers.map((h) => cell(h, STYLES.th)));

    // Body
    filtered.forEach((e, idx) => {
      const alt = idx % 2 === 1;
      const s = empSums[e.id] || { adv: 0, ded: 0 };
      const bal = (balances[e.id] || 0);
      totals.adv += s.adv; totals.ded += s.ded; totals.balance += bal;
      const status = EMPLOYEE_STATUS[e.status || 'active'];
      const statusStyle = e.status === 'terminated' ? STYLES.badgeRed
        : e.status === 'suspended' ? STYLES.badgeAmber
        : STYLES.badgeGreen;

      rows.push([
        cell(idx + 1, STYLES.tdCenter(alt), true),
        cell(e.name, STYLES.tdBold(alt)),
        cell(e.iqama, STYLES.tdCenter(alt)),
        cell(e.phone || '-', STYLES.tdMuted(alt)),
        cell(e.position || '-', STYLES.tdMuted(alt)),
        cell(e.department || '-', STYLES.tdMuted(alt)),
        cell(Number(e.salary) || 0, STYLES.num(alt), true),
        cell(s.adv, STYLES.numGreen(alt), true),
        cell(s.ded, STYLES.numRed(alt), true),
        cell(bal, bal > 0 ? STYLES.numAmber(alt) : STYLES.num(alt), true),
        cell(status.label, statusStyle),
      ]);
    });

    // Totals row
    rows.push([
      cell('', STYLES.totalLabel),
      cell('الإجماليات', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell(totals.adv, STYLES.totalNum, true),
      cell(totals.ded, STYLES.totalNum, true),
      cell(totals.balance, STYLES.totalNum, true),
      cell('', STYLES.totalLabel),
    ]);

    // Column widths
    const cols = [
      { wch: 5 },    // #
      { wch: 25 },   // name
      { wch: 14 },   // iqama
      { wch: 13 },   // phone
      { wch: 15 },   // position
      { wch: 15 },   // dept
      { wch: 12 },   // salary
      { wch: 14 },   // adv
      { wch: 14 },   // ded
      { wch: 14 },   // balance
      { wch: 12 },   // status
    ];

    // Row heights (taller header, normal body)
    const rowHeights = [];
    rowHeights[0] = { hpt: 30 }; // title
    rowHeights[1] = { hpt: 20 }; // subtitle
    // info rows ~18
    for (let i = 2; i < 2 + headerInfo.length; i++) rowHeights[i] = { hpt: 20 };
    // section header
    rowHeights[sectionRowIdx] = { hpt: 24 };
    // table header
    rowHeights[sectionRowIdx + 1] = { hpt: 28 };

    const ws = buildSheet(rows, { cols, rows: rowHeights, merges });

    exportWorkbook(
      [{ name: 'الموظفون', ws }],
      `قائمة_الموظفين_${todayISO()}.xlsx`
    );
    showToast('تم تنزيل القائمة بتنسيق احترافي');
  };

  return (
    <div className="space-y-6">
      <div className="card rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
          <div>
            <h2 className="display text-2xl font-bold ink">الموظفون</h2>
            <p className="text-sm ink-muted">{employees.length} موظف • {filtered.length} ظاهر</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(user, 'EXPORT_DATA') && employees.length > 0 && (
              <button onClick={exportEmployeesXLSX} className="btn-secondary px-3 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2" style={{ background: '#F4F8F5', color: '#1F4D3F', borderColor: '#1F4D3F' }}>
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
                <Plus size={16} /> موظف جديد
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 ink-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم، الإقامة، الجوال..."
              className="input-base pr-10" />
          </div>
          <select className="input-base" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">جميع الحالات</option>
            <option value="active">نشط</option>
            <option value="suspended">موقوف</option>
            <option value="terminated">منتهي الخدمة</option>
          </select>
          <select className="input-base" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="all">جميع الأقسام</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b divider">
                <th className="text-right py-2 ink-muted font-medium">الاسم</th>
                <th className="text-right py-2 ink-muted font-medium">رقم الإقامة</th>
                <th className="text-right py-2 ink-muted font-medium hidden md:table-cell">الوظيفة</th>
                <th className="text-right py-2 ink-muted font-medium hidden lg:table-cell">القسم</th>
                <th className="text-right py-2 ink-muted font-medium hidden lg:table-cell">الراتب</th>
                <th className="text-right py-2 ink-muted font-medium">الحالة</th>
                <th className="text-left py-2 ink-muted font-medium">الرصيد</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const bal = balances[e.id] || 0;
                const status = EMPLOYEE_STATUS[e.status || 'active'];
                return (
                  <tr key={e.id} className="border-b divider row-hover">
                    <td className="py-3 ink font-medium">
                      {e.name}
                      {e.phone && <div className="text-xs ink-muted num">{e.phone}</div>}
                    </td>
                    <td className="py-3 num ink-muted">{e.iqama}</td>
                    <td className="py-3 ink-muted hidden md:table-cell">{e.position || '-'}</td>
                    <td className="py-3 ink-muted hidden lg:table-cell">{e.department || '-'}</td>
                    <td className="py-3 num ink-muted hidden lg:table-cell">{e.salary ? fmt(e.salary) : '-'}</td>
                    <td className="py-3"><span className={`badge ${status.class}`}>{status.label}</span></td>
                    <td className={`py-3 num text-left font-semibold ${bal > 0 ? 'accent-burgundy' : 'ink-muted'}`}>{fmt(bal)}</td>
                    <td className="py-3 text-left whitespace-nowrap">
                      {canEdit && (
                        <button onClick={() => { setEditing(e); setShowForm(true); }} className="btn-ghost p-1.5 rounded" title="تعديل">
                          <Edit size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setConfirmDel(e)} className="btn-ghost p-1.5 rounded" title="حذف">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-8 ink-muted text-sm">
              {employees.length === 0 ? 'لا يوجد موظفون. ابدأ بإضافة موظف' : 'لا يوجد نتائج للبحث'}
            </div>
          )}
        </div>
      </div>

      {/* Form Modal */}
      <EmployeeForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        editing={editing}
        onSave={async (data) => {
          if (editing) {
            const ok = await updateEmployee(editing.id, data);
            if (ok) { setShowForm(false); setEditing(null); }
          } else {
            const created = await addEmployee(data);
            if (created) { setShowForm(false); showToast('تم إضافة الموظف'); }
          }
        }}
      />

      {/* Delete confirm */}
      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => { if (confirmDel) deleteEmployee(confirmDel.id); }}
        title="تأكيد الحذف"
        message={`هل تريد حذف الموظف "${confirmDel?.name}"؟ سيتم حذف جميع سلفه وخصوماته. هذا الإجراء لا يمكن التراجع عنه.`}
        confirmLabel="حذف"
        danger
      />
    </div>
  );
}

function EmployeeForm({ open, onClose, editing, onSave }) {
  const [form, setForm] = useState({
    name: '', iqama: '', phone: '', position: '', department: '',
    salary: '', hireDate: '', status: 'active', maxAdvanceRatio: 0.5,
  });
  const [saving, setSaving] = useState(false);

  // Reset on open/editing change
  useEffect(() => {
    if (open && editing) {
      setForm({
        name: editing.name || '',
        iqama: editing.iqama || '',
        phone: editing.phone || '',
        position: editing.position || '',
        department: editing.department || '',
        salary: editing.salary || '',
        hireDate: editing.hireDate || '',
        status: editing.status || 'active',
        maxAdvanceRatio: editing.maxAdvanceRatio || 0.5,
      });
    } else if (open && !editing) {
      setForm({ name: '', iqama: '', phone: '', position: '', department: '',
        salary: '', hireDate: '', status: 'active', maxAdvanceRatio: 0.5 });
    }
  }, [open, editing]);

  const submit = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'تعديل موظف' : 'موظف جديد'} size="lg">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="اسم الموظف *" >
          <input className="input-base" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="رقم الإقامة *">
          <input className="input-base num" value={form.iqama} onChange={(e) => setForm({ ...form, iqama: e.target.value })} />
        </Field>
        <Field label="رقم الجوال">
          <input className="input-base num" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="الوظيفة">
          <input className="input-base" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
        </Field>
        <Field label="القسم">
          <input className="input-base" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </Field>
        <Field label="الراتب الشهري">
          <input type="number" step="0.01" className="input-base num" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
        </Field>
        <Field label="تاريخ التوظيف">
          <input type="date" className="input-base" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
        </Field>
        <Field label="حالة الموظف">
          <select className="input-base" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">نشط</option>
            <option value="suspended">موقوف</option>
            <option value="terminated">منتهي الخدمة</option>
          </select>
        </Field>
        <Field label="الحد الأقصى للسلفة (نسبة من الراتب)" full>
          <select className="input-base" value={form.maxAdvanceRatio} onChange={(e) => setForm({ ...form, maxAdvanceRatio: Number(e.target.value) })}>
            <option value="0.25">25% من الراتب</option>
            <option value="0.5">50% من الراتب</option>
            <option value="0.75">75% من الراتب</option>
            <option value="1">100% من الراتب (راتب كامل)</option>
            <option value="2">راتبين</option>
            <option value="3">ثلاثة رواتب</option>
            <option value="999">بدون حد أقصى</option>
          </select>
          {form.salary > 0 && (
            <p className="text-xs ink-muted mt-1 num">
              الحد الأقصى: {fmt(Number(form.salary) * Number(form.maxAdvanceRatio))} ر.س
            </p>
          )}
        </Field>
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t divider">
        <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-md text-sm">إلغاء</button>
        <button onClick={submit} disabled={saving} className="btn-primary px-5 py-2 rounded-md text-sm font-medium">
          {saving ? 'جاري الحفظ...' : 'حفظ'}
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
