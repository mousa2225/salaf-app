import { useState, useMemo, useEffect } from 'react';
import {
  Wallet, Calendar, Download, Search, CheckCircle2, AlertCircle,
  Trash2, Edit, RefreshCw, Save, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  fmt, fmtDate, todayISO, monthKeyOf, currentMonth, monthLabel, can,
  DEDUCTION_TYPES, uid,
} from '../lib/utils';
import {
  STYLES, cell, buildSheet, exportWorkbook, buildTitleBlock, titleBlockMerges,
} from '../lib/excel';
import { collection, writeBatch, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import Modal, { ConfirmModal } from '../components/Modal';

export default function MonthlyDeductions({
  user, employees, transactions, balances, empById, showToast,
}) {
  const [tab, setTab] = useState('apply'); // apply | view
  const [deductionDate, setDeductionDate] = useState(todayISO());
  const [deductionType, setDeductionType] = useState('من الراتب الشهري');
  const [defaultNote, setDefaultNote] = useState('');
  const [amounts, setAmounts] = useState({}); // { empId: amount }
  const [notes, setNotes] = useState({}); // { empId: note }
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [editTx, setEditTx] = useState(null);
  const [showOnlyWithDebt, setShowOnlyWithDebt] = useState(true);

  // For "view" tab
  const [viewMonth, setViewMonth] = useState(currentMonth());

  const canAdd = can(user, 'ADD_DEDUCTION');
  const canEdit = can(user, 'EDIT_DEDUCTION');
  const canDelete = can(user, 'DELETE_DEDUCTION');
  const canExport = can(user, 'EXPORT_DATA');

  // Filter active employees who have a positive balance (debtors only)
  const debtors = useMemo(() => {
    const list = employees.map((e) => ({
      ...e,
      balance: balances[e.id] || 0,
    }));
    let filtered = list;
    if (showOnlyWithDebt) {
      filtered = filtered.filter((e) => e.balance > 0);
    }
    // exclude terminated
    filtered = filtered.filter((e) => (e.status || 'active') !== 'terminated');
    // search filter
    const q = search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        String(e.iqama).includes(q)
      );
    }
    return filtered.sort((a, b) => b.balance - a.balance);
  }, [employees, balances, search, showOnlyWithDebt]);

  // Stats for "apply" tab
  const applyStats = useMemo(() => {
    let totalToDeduct = 0;
    let count = 0;
    Object.entries(amounts).forEach(([empId, val]) => {
      const v = Number(val);
      if (v > 0) {
        totalToDeduct += v;
        count++;
      }
    });
    const totalOutstanding = debtors.reduce((s, e) => s + e.balance, 0);
    return { totalToDeduct, count, totalOutstanding };
  }, [amounts, debtors]);

  // For "view" tab - deductions in selected month
  const monthDeductions = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'deduction' && monthKeyOf(t.date) === viewMonth)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, viewMonth]);

  const monthDeductionStats = useMemo(() => {
    const total = monthDeductions.reduce((s, t) => s + Number(t.amount), 0);
    const uniqueEmps = new Set(monthDeductions.map((d) => d.employeeId)).size;
    return { total, count: monthDeductions.length, uniqueEmps };
  }, [monthDeductions]);

  // Available months for view tab
  const allMonths = useMemo(() => {
    const set = new Set([currentMonth()]);
    transactions.filter((t) => t.type === 'deduction').forEach((t) => set.add(monthKeyOf(t.date)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  // Group deductions by employee for view tab
  const groupedByEmp = useMemo(() => {
    const map = {};
    monthDeductions.forEach((d) => {
      if (!map[d.employeeId]) {
        map[d.employeeId] = { emp: empById[d.employeeId], deductions: [], total: 0 };
      }
      map[d.employeeId].deductions.push(d);
      map[d.employeeId].total += Number(d.amount);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [monthDeductions, empById]);

  // Quick fill suggestions
  const fillFullBalance = () => {
    const newAmounts = { ...amounts };
    debtors.forEach((e) => {
      newAmounts[e.id] = e.balance;
    });
    setAmounts(newAmounts);
    showToast(`تم تعبئة ${debtors.length} موظف بكامل أرصدتهم`);
  };

  const fillFixedAmount = (amount) => {
    const newAmounts = { ...amounts };
    debtors.forEach((e) => {
      // Cap at current balance
      newAmounts[e.id] = Math.min(amount, e.balance);
    });
    setAmounts(newAmounts);
    showToast(`تم تعبئة ${debtors.length} موظف`);
  };

  const fillPercent = (pct) => {
    const newAmounts = { ...amounts };
    debtors.forEach((e) => {
      if (e.salary > 0) {
        const proposed = Math.round(e.salary * pct * 100) / 100;
        newAmounts[e.id] = Math.min(proposed, e.balance);
      }
    });
    setAmounts(newAmounts);
    showToast(`تم تعبئة الكل بـ ${(pct * 100).toFixed(0)}% من الراتب`);
  };

  const clearAll = () => {
    setAmounts({});
    setNotes({});
    showToast('تم مسح كل المبالغ');
  };

  const updateAmount = (empId, val) => {
    if (val === '' || val === null) {
      const next = { ...amounts };
      delete next[empId];
      setAmounts(next);
    } else {
      setAmounts({ ...amounts, [empId]: val });
    }
  };

  // Apply all deductions in one batch
  const applyAll = async () => {
    if (!canAdd) {
      showToast('ليس لديك صلاحية إضافة الخصومات', 'error');
      return;
    }
    const entries = Object.entries(amounts).filter(([_, v]) => Number(v) > 0);
    if (entries.length === 0) {
      showToast('لم تُدخل أي مبالغ', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const orgId = user.orgId;
      const txCol = collection(db, 'orgs', orgId, 'transactions');
      const batch = writeBatch(db);

      // get current count for voucher numbering
      const existingDeds = transactions.filter((t) => t.type === 'deduction').length;
      let voucherNum = existingDeds + 1;

      entries.forEach(([empId, val]) => {
        const txId = uid();
        const noteVal = (notes[empId] || defaultNote || '').trim();
        batch.set(doc(txCol, txId), {
          employeeId: empId,
          type: 'deduction',
          amount: Number(val),
          date: deductionDate,
          deductionType: deductionType,
          notes: noteVal,
          voucherNo: `D-${String(voucherNum).padStart(5, '0')}`,
          batchId: `BATCH-${Date.now()}`, // identifier for this batch run
          createdAt: new Date().toISOString(),
          createdBy: user.uid,
        });
        voucherNum++;
      });

      await batch.commit();
      showToast(`✅ تم تسجيل ${entries.length} خصم بإجمالي ${fmt(applyStats.totalToDeduct)} ر.س`);
      setAmounts({});
      setNotes({});
      setDefaultNote('');
      // Switch to view tab to see results
      setViewMonth(monthKeyOf(deductionDate));
      setTab('view');
    } catch (e) {
      console.error('Apply batch deductions failed:', e);
      showToast('فشل تسجيل الخصومات', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete a deduction
  const handleDelete = async (txId) => {
    try {
      const orgId = user.orgId;
      await deleteDoc(doc(db, 'orgs', orgId, 'transactions', txId));
      showToast('تم حذف الخصم');
    } catch (e) {
      console.error(e);
      showToast('فشل الحذف', 'error');
    }
  };

  // Update a deduction
  const handleUpdate = async (txId, updates) => {
    try {
      const orgId = user.orgId;
      await updateDoc(doc(db, 'orgs', orgId, 'transactions', txId), {
        ...updates,
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

  // Export Excel of monthly deductions
  const exportMonthlyDeductionsXLSX = () => {
    const colsCount = 8;
    const rows = [];

    const headerInfo = [
      ['تاريخ التقرير', fmtDate(todayISO())],
      ['الشهر', monthLabel(viewMonth)],
      ['عدد الخصومات', `${monthDeductionStats.count} خصم`],
      ['عدد الموظفين', `${monthDeductionStats.uniqueEmps} موظف`],
      ['إجمالي الخصومات', `${fmt(monthDeductionStats.total)} ر.س`],
      ['أعدّه', user.displayName || user.email],
    ];
    rows.push(...buildTitleBlock({
      title: '📋 خصومات الشهر التفصيلية',
      subtitle: monthLabel(viewMonth),
      info: headerInfo,
      colsCount,
    }));
    const merges = titleBlockMerges({ colsCount, hasSubtitle: true, numInfoRows: headerInfo.length });

    // Section: Per-employee summary
    const sumIdx = rows.length;
    const sumRow = Array.from({ length: colsCount }, () => cell('', STYLES.sectionHeader));
    sumRow[0] = cell('  📊 الملخص حسب الموظف', STYLES.sectionHeader);
    rows.push(sumRow);
    merges.push({ s: { r: sumIdx, c: 0 }, e: { r: sumIdx, c: colsCount - 1 } });

    rows.push([
      cell('#', STYLES.th),
      cell('اسم الموظف', STYLES.th),
      cell('رقم الإقامة', STYLES.th),
      cell('القسم', STYLES.th),
      cell('الراتب', STYLES.th),
      cell('عدد الخصومات', STYLES.th),
      cell('إجمالي المخصوم', STYLES.th),
      cell('الرصيد بعد الخصم', STYLES.th),
    ]);

    groupedByEmp.forEach((g, idx) => {
      const alt = idx % 2 === 1;
      const remaining = (balances[g.emp?.id] || 0); // current remaining balance
      rows.push([
        cell(idx + 1, STYLES.tdCenter(alt), true),
        cell(g.emp?.name || '—', STYLES.tdBold(alt)),
        cell(g.emp?.iqama || '-', STYLES.tdCenter(alt)),
        cell(g.emp?.department || '-', STYLES.tdMuted(alt)),
        cell(Number(g.emp?.salary) || 0, STYLES.num(alt), true),
        cell(g.deductions.length, STYLES.numInt(alt), true),
        cell(g.total, STYLES.numRed(alt), true),
        cell(remaining, remaining > 0 ? STYLES.numAmber(alt) : STYLES.numGreen(alt), true),
      ]);
    });

    // Total row
    rows.push([
      cell('', STYLES.totalLabel),
      cell('الإجماليات', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell(monthDeductionStats.count, STYLES.totalNum, true),
      cell(monthDeductionStats.total, STYLES.totalNum, true),
      cell('', STYLES.totalLabel),
    ]);

    // Spacer
    rows.push(Array.from({ length: colsCount }, () => null));

    // Detailed section
    const detIdx = rows.length;
    const detRow = Array.from({ length: colsCount }, () => cell('', STYLES.sectionHeader));
    detRow[0] = cell('  📋 التفاصيل الكاملة لكل خصم', STYLES.sectionHeader);
    rows.push(detRow);
    merges.push({ s: { r: detIdx, c: 0 }, e: { r: detIdx, c: colsCount - 1 } });

    rows.push([
      cell('رقم السند', STYLES.th),
      cell('التاريخ', STYLES.th),
      cell('اسم الموظف', STYLES.th),
      cell('رقم الإقامة', STYLES.th),
      cell('القسم', STYLES.th),
      cell('نوع الخصم', STYLES.th),
      cell('ملاحظات', STYLES.th),
      cell('المبلغ', STYLES.th),
    ]);

    monthDeductions.forEach((t, idx) => {
      const alt = idx % 2 === 1;
      const emp = empById[t.employeeId];
      rows.push([
        cell(t.voucherNo || '-', STYLES.tdCenter(alt)),
        cell(fmtDate(t.date), STYLES.date(alt)),
        cell(emp?.name || '—', STYLES.tdBold(alt)),
        cell(emp?.iqama || '-', STYLES.tdCenter(alt)),
        cell(emp?.department || '-', STYLES.tdMuted(alt)),
        cell(t.deductionType || '-', STYLES.tdMuted(alt)),
        cell(t.notes || '-', STYLES.tdMuted(alt)),
        cell(Number(t.amount), STYLES.numRed(alt), true),
      ]);
    });

    rows.push([
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('', STYLES.totalLabel),
      cell('الإجمالي', STYLES.totalLabel),
      cell(monthDeductionStats.total, STYLES.totalNum, true),
    ]);

    const cols = [
      { wch: 12 }, { wch: 13 }, { wch: 25 }, { wch: 14 },
      { wch: 15 }, { wch: 22 }, { wch: 25 }, { wch: 14 },
    ];
    const rowHeights = [];
    rowHeights[0] = { hpt: 32 };
    rowHeights[1] = { hpt: 22 };
    for (let i = 2; i < 2 + headerInfo.length; i++) rowHeights[i] = { hpt: 20 };

    const ws = buildSheet(rows, { cols, rows: rowHeights, merges });
    exportWorkbook(
      [{ name: 'خصومات الشهر', ws }],
      `خصومات_شهر_${viewMonth}_${todayISO()}.xlsx`
    );
    showToast('تم تنزيل تقرير خصومات الشهر');
  };

  return (
    <div className="space-y-6">
      <div className="card rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
          <div>
            <h2 className="display text-2xl font-bold ink flex items-center gap-2">
              <Wallet size={24} className="accent-emerald" />
              خصومات الشهر
            </h2>
            <p className="text-sm ink-muted">تطبيق خصومات جماعية على الموظفين المدينين دفعة واحدة</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b divider">
          <button onClick={() => setTab('apply')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'apply' ? 'border-current accent-emerald' : 'border-transparent ink-muted'}`}>
            💰 تطبيق خصومات الشهر
          </button>
          <button onClick={() => setTab('view')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'view' ? 'border-current accent-emerald' : 'border-transparent ink-muted'}`}>
            📊 عرض الخصومات المسجلة
            {monthDeductions.length > 0 && tab !== 'view' && (
              <span className="badge badge-amber mr-2">{monthDeductionStats.count}</span>
            )}
          </button>
        </div>

        {/* ========== APPLY TAB ========== */}
        {tab === 'apply' && (
          <div>
            {/* Settings row */}
            <div className="p-4 rounded-md border divider mb-4" style={{ background: '#FCF8EC' }}>
              <h3 className="font-semibold ink text-sm mb-3 flex items-center gap-2">
                <Calendar size={14} /> إعدادات الخصومات
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="تاريخ الخصم (موحّد للجميع) *">
                  <input type="date" className="input-base" value={deductionDate}
                    onChange={(e) => setDeductionDate(e.target.value)} />
                </Field>
                <Field label="نوع الخصم *">
                  <select className="input-base" value={deductionType}
                    onChange={(e) => setDeductionType(e.target.value)}>
                    {DEDUCTION_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="ملاحظات افتراضية (اختياري)">
                  <input className="input-base" value={defaultNote}
                    onChange={(e) => setDefaultNote(e.target.value)}
                    placeholder="مثال: خصم شهر يناير 2026" />
                </Field>
              </div>
            </div>

            {/* Quick actions */}
            <div className="p-4 rounded-md border divider mb-4" style={{ background: '#F4F8F5' }}>
              <h3 className="font-semibold ink text-sm mb-3">إجراءات سريعة:</h3>
              <div className="flex flex-wrap gap-2">
                <button onClick={fillFullBalance} className="btn-secondary px-3 py-1.5 rounded-md text-xs">
                  ✅ ملء كامل الرصيد لكل موظف
                </button>
                <button onClick={() => fillPercent(0.10)} className="btn-secondary px-3 py-1.5 rounded-md text-xs">
                  10% من الراتب
                </button>
                <button onClick={() => fillPercent(0.25)} className="btn-secondary px-3 py-1.5 rounded-md text-xs">
                  25% من الراتب
                </button>
                <button onClick={() => fillPercent(0.50)} className="btn-secondary px-3 py-1.5 rounded-md text-xs">
                  50% من الراتب
                </button>
                <button onClick={() => {
                  const amount = prompt('أدخل المبلغ الموحد:');
                  if (amount && !isNaN(amount) && Number(amount) > 0) {
                    fillFixedAmount(Number(amount));
                  }
                }} className="btn-secondary px-3 py-1.5 rounded-md text-xs">
                  ⚙️ مبلغ موحد للجميع
                </button>
                <button onClick={clearAll} className="btn-ghost px-3 py-1.5 rounded-md text-xs">
                  🗑️ مسح الكل
                </button>
              </div>
            </div>

            {/* Search and filter toggle */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 ink-muted" />
                <input className="input-base pr-10 !py-2 text-sm" placeholder="ابحث عن موظف..."
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm ink">
                <input type="checkbox" checked={showOnlyWithDebt}
                  onChange={(e) => setShowOnlyWithDebt(e.target.checked)}
                  className="w-4 h-4" />
                <span>المدينون فقط</span>
              </label>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatBox label="موظفون مدينون" value={debtors.length.toString()} color="#1F4D3F" plain />
              <StatBox label="إجمالي الأرصدة" value={fmt(applyStats.totalOutstanding)} color="#8B2635" />
              <StatBox label="عدد الخصومات المُدخلة" value={applyStats.count.toString()} color="#1E40AF" plain />
              <StatBox label="إجمالي ما سيُخصم" value={fmt(applyStats.totalToDeduct)} color="#B45309" emphasize />
            </div>

            {/* Employees table */}
            {debtors.length === 0 ? (
              <div className="text-center py-12 card rounded-md" style={{ background: '#F4F8F5' }}>
                <CheckCircle2 size={40} className="mx-auto mb-3 accent-emerald" />
                <div className="ink font-medium">
                  {showOnlyWithDebt ? '🎉 لا يوجد موظفون مدينون!' : 'لا يوجد موظفون'}
                </div>
                <div className="text-sm ink-muted mt-1">
                  {showOnlyWithDebt ? 'جميع الموظفين أرصدتهم صفر' : ''}
                </div>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b divider" style={{ background: '#F4F0E3' }}>
                        <th className="text-right py-2 px-2 ink-muted font-medium">#</th>
                        <th className="text-right py-2 px-2 ink-muted font-medium">الموظف</th>
                        <th className="text-right py-2 px-2 ink-muted font-medium hidden md:table-cell">الإقامة</th>
                        <th className="text-right py-2 px-2 ink-muted font-medium hidden lg:table-cell">القسم</th>
                        <th className="text-right py-2 px-2 ink-muted font-medium hidden lg:table-cell">الراتب</th>
                        <th className="text-right py-2 px-2 ink-muted font-medium">الرصيد المستحق</th>
                        <th className="text-right py-2 px-2 ink-muted font-medium" style={{ minWidth: '140px' }}>
                          مبلغ الخصم
                        </th>
                        <th className="text-right py-2 px-2 ink-muted font-medium hidden xl:table-cell">ملاحظة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debtors.map((e, idx) => {
                        const amount = amounts[e.id] || '';
                        const num = Number(amount);
                        const exceedsBalance = num > e.balance;
                        return (
                          <tr key={e.id} className="border-b divider row-hover">
                            <td className="py-2 px-2 ink-muted text-xs">{idx + 1}</td>
                            <td className="py-2 px-2 ink font-medium">{e.name}</td>
                            <td className="py-2 px-2 num ink-muted hidden md:table-cell">{e.iqama}</td>
                            <td className="py-2 px-2 ink-muted hidden lg:table-cell">{e.department || '-'}</td>
                            <td className="py-2 px-2 num ink-muted hidden lg:table-cell">
                              {e.salary ? fmt(e.salary) : '-'}
                            </td>
                            <td className="py-2 px-2 num font-semibold accent-burgundy">{fmt(e.balance)}</td>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-1">
                                <input type="number" step="0.01"
                                  className="input-base !py-1 !px-2 num text-sm"
                                  style={{
                                    width: '110px',
                                    borderColor: exceedsBalance ? '#8B2635' : '#D6CBA8',
                                    background: amount && !exceedsBalance ? '#F4F8F5' : '#FFFEF9',
                                  }}
                                  placeholder="0.00"
                                  value={amount}
                                  onChange={(ev) => updateAmount(e.id, ev.target.value)}
                                />
                                {amount && (
                                  <button onClick={() => updateAmount(e.id, '')}
                                    className="btn-ghost p-1 rounded" title="مسح">
                                    <X size={12} />
                                  </button>
                                )}
                              </div>
                              {exceedsBalance && (
                                <div className="text-xs accent-burgundy mt-0.5">يتجاوز الرصيد!</div>
                              )}
                            </td>
                            <td className="py-2 px-2 hidden xl:table-cell">
                              <input className="input-base !py-1 !px-2 text-sm"
                                placeholder="ملاحظة..."
                                value={notes[e.id] || ''}
                                onChange={(ev) => setNotes({ ...notes, [e.id]: ev.target.value })}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Apply button */}
                <div className="mt-5 pt-4 border-t divider flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm ink-muted">
                    {applyStats.count > 0 ? (
                      <span>
                        ستُسجَّل <span className="font-bold ink num">{applyStats.count}</span> خصم
                        بإجمالي <span className="font-bold accent-burgundy num">{fmt(applyStats.totalToDeduct)}</span> ر.س
                      </span>
                    ) : (
                      <span>أدخل مبالغ الخصم أمام الموظفين</span>
                    )}
                  </div>
                  <button onClick={applyAll}
                    disabled={submitting || applyStats.count === 0 || !canAdd}
                    className="btn-primary px-5 py-2.5 rounded-md text-sm font-medium inline-flex items-center gap-2">
                    {submitting ? (
                      <><RefreshCw size={16} className="animate-spin" /> جاري التطبيق...</>
                    ) : (
                      <><Save size={16} /> تطبيق جميع الخصومات</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========== VIEW TAB ========== */}
        {tab === 'view' && (
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-md border divider" style={{ background: '#FCF8EC' }}>
              <Calendar size={14} className="ink-muted" />
              <span className="text-sm ink">الشهر:</span>
              <select value={viewMonth} onChange={(e) => setViewMonth(e.target.value)}
                className="input-base !py-1.5 !w-auto text-sm">
                {allMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              {canExport && monthDeductions.length > 0 && (
                <button onClick={exportMonthlyDeductionsXLSX}
                  className="btn-secondary px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1 mr-auto"
                  style={{ background: '#F4F8F5', color: '#1F4D3F', borderColor: '#1F4D3F' }}>
                  <Download size={12} /> تنزيل Excel
                </button>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <StatBox label="عدد الخصومات" value={monthDeductionStats.count.toString()} color="#1F4D3F" plain />
              <StatBox label="عدد الموظفين" value={monthDeductionStats.uniqueEmps.toString()} color="#1E40AF" plain />
              <StatBox label="إجمالي الخصومات" value={fmt(monthDeductionStats.total)} color="#8B2635" emphasize />
            </div>

            {monthDeductions.length === 0 ? (
              <div className="text-center py-12 ink-muted text-sm">
                لا توجد خصومات في {monthLabel(viewMonth)}
              </div>
            ) : (
              <>
                {/* Grouped by employee */}
                <div className="space-y-3">
                  {groupedByEmp.map((g, idx) => (
                    <GroupCard key={g.emp?.id || idx} group={g}
                      canEdit={canEdit} canDelete={canDelete}
                      onEditTx={(tx) => setEditTx(tx)}
                      onDeleteTx={(tx) => setConfirmDel(tx)} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      <EditDeductionForm
        open={!!editTx}
        editing={editTx}
        onClose={() => setEditTx(null)}
        onSave={async (data) => {
          const ok = await handleUpdate(editTx.id, data);
          if (ok) setEditTx(null);
        }}
      />

      {/* Confirm delete */}
      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => { if (confirmDel) handleDelete(confirmDel.id); }}
        title="حذف خصم"
        message={`هل تريد حذف هذا الخصم بمبلغ ${confirmDel ? fmt(confirmDel.amount) : ''} ر.س؟ (سيؤثر على رصيد الموظف)`}
        confirmLabel="حذف"
        danger
      />
    </div>
  );
}

// Helper for input handler bug avoidance
function debtorIdToUpdate(e) { return e?.id || ''; }

function StatBox({ label, value, color, sub, plain, emphasize }) {
  return (
    <div className="rounded-md p-3 border divider" style={{ background: '#FFFEF9' }}>
      <div className="text-xs ink-muted">{label}</div>
      <div className={`num font-semibold ${emphasize ? 'text-2xl' : 'text-xl'} mt-1`} style={{ color }}>{value}</div>
      {!plain && <div className="text-xs ink-muted mt-0.5">ر.س{sub ? ` • ${sub}` : ''}</div>}
      {sub && plain && <div className="text-xs ink-muted mt-0.5">{sub}</div>}
    </div>
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

function GroupCard({ group, canEdit, canDelete, onEditTx, onDeleteTx }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="rounded-md border divider overflow-hidden" style={{ background: '#FFFEF9' }}>
      <div className="flex items-center justify-between p-3 cursor-pointer row-hover"
        onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          {expanded ? <ChevronUp size={16} className="ink-muted" /> : <ChevronDown size={16} className="ink-muted" />}
          <div>
            <div className="ink font-medium">{group.emp?.name || '—'}</div>
            <div className="text-xs ink-muted num">{group.emp?.iqama || '-'} • {group.deductions.length} خصم</div>
          </div>
        </div>
        <div className="num font-bold accent-burgundy text-lg">{fmt(group.total)}</div>
      </div>

      {expanded && (
        <div className="border-t divider">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#FCF8EC' }}>
                <th className="text-right py-1.5 px-3 ink-muted text-xs font-medium">رقم السند</th>
                <th className="text-right py-1.5 px-3 ink-muted text-xs font-medium">التاريخ</th>
                <th className="text-right py-1.5 px-3 ink-muted text-xs font-medium">نوع الخصم</th>
                <th className="text-right py-1.5 px-3 ink-muted text-xs font-medium">ملاحظات</th>
                <th className="text-left py-1.5 px-3 ink-muted text-xs font-medium">المبلغ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {group.deductions.map((d) => (
                <tr key={d.id} className="border-t divider">
                  <td className="py-2 px-3 num text-xs ink-muted">{d.voucherNo || '-'}</td>
                  <td className="py-2 px-3 num text-xs">{fmtDate(d.date)}</td>
                  <td className="py-2 px-3 ink-muted text-xs">{d.deductionType}</td>
                  <td className="py-2 px-3 ink-muted text-xs">{d.notes || '-'}</td>
                  <td className="py-2 px-3 num text-left accent-burgundy font-semibold">{fmt(d.amount)}</td>
                  <td className="py-2 px-3 text-left whitespace-nowrap">
                    {canEdit && (
                      <button onClick={() => onEditTx(d)} className="btn-ghost p-1 rounded" title="تعديل">
                        <Edit size={12} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => onDeleteTx(d)} className="btn-ghost p-1 rounded" title="حذف">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EditDeductionForm({ open, editing, onClose, onSave }) {
  const [form, setForm] = useState({ amount: '', date: '', deductionType: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && editing) {
      setForm({
        amount: editing.amount,
        date: editing.date,
        deductionType: editing.deductionType || DEDUCTION_TYPES[0],
        notes: editing.notes || '',
      });
    }
  }, [open, editing]);

  const submit = async () => {
    setSaving(true);
    await onSave({
      amount: Number(form.amount),
      date: form.date,
      deductionType: form.deductionType,
      notes: form.notes,
    });
    setSaving(false);
  };

  if (!editing) return null;

  return (
    <Modal open={open} onClose={onClose} title="تعديل خصم" size="md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="المبلغ">
          <input type="number" step="0.01" className="input-base num" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <Field label="التاريخ">
          <input type="date" className="input-base" value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="نوع الخصم">
          <select className="input-base" value={form.deductionType}
            onChange={(e) => setForm({ ...form, deductionType: e.target.value })}>
            {DEDUCTION_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="ملاحظات">
          <input className="input-base" value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
