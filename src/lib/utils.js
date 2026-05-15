// ============== Constants ==============
export const PERMISSIONS = {
  // Dashboard
  VIEW_DASHBOARD: 'عرض الرئيسية',

  // Employees
  VIEW_EMPLOYEES: 'عرض الموظفين',
  ADD_EMPLOYEE: 'إضافة موظف',
  EDIT_EMPLOYEE: 'تعديل موظف',
  DELETE_EMPLOYEE: 'حذف موظف',
  IMPORT_EMPLOYEES: 'استيراد موظفين من إكسل',

  // Advances
  VIEW_ADVANCES: 'عرض السلف',
  ADD_ADVANCE: 'تسجيل سلفة',
  EDIT_ADVANCE: 'تعديل سلفة',
  DELETE_ADVANCE: 'حذف سلفة',

  // Deductions
  VIEW_DEDUCTIONS: 'عرض الخصومات',
  ADD_DEDUCTION: 'تسجيل خصم',
  EDIT_DEDUCTION: 'تعديل خصم',
  DELETE_DEDUCTION: 'حذف خصم',
  IMPORT_DEDUCTIONS: 'استيراد خصومات من إكسل',

  // Reports
  VIEW_STATEMENT: 'عرض كشف الحساب',
  VIEW_REPORTS: 'عرض التقارير والتحليلات',
  EXPORT_DATA: 'تصدير البيانات',

  // Admin
  MANAGE_USERS: 'إدارة المستخدمين (أدمن)',
  MANAGE_SETTINGS: 'إعدادات النظام',
};

export const PERMISSION_GROUPS = [
  {
    title: 'الرئيسية والتقارير',
    keys: ['VIEW_DASHBOARD', 'VIEW_STATEMENT', 'VIEW_REPORTS', 'EXPORT_DATA'],
  },
  {
    title: 'الموظفون',
    keys: ['VIEW_EMPLOYEES', 'ADD_EMPLOYEE', 'EDIT_EMPLOYEE', 'DELETE_EMPLOYEE', 'IMPORT_EMPLOYEES'],
  },
  {
    title: 'السلف',
    keys: ['VIEW_ADVANCES', 'ADD_ADVANCE', 'EDIT_ADVANCE', 'DELETE_ADVANCE'],
  },
  {
    title: 'الخصومات',
    keys: ['VIEW_DEDUCTIONS', 'ADD_DEDUCTION', 'EDIT_DEDUCTION', 'DELETE_DEDUCTION', 'IMPORT_DEDUCTIONS'],
  },
  {
    title: 'الإدارة',
    keys: ['MANAGE_USERS', 'MANAGE_SETTINGS'],
  },
];

// Default permissions sets
export const VIEWER_PERMISSIONS = ['VIEW_DASHBOARD', 'VIEW_EMPLOYEES', 'VIEW_ADVANCES', 'VIEW_DEDUCTIONS', 'VIEW_STATEMENT', 'VIEW_REPORTS'];
export const ACCOUNTANT_PERMISSIONS = [...VIEWER_PERMISSIONS, 'ADD_ADVANCE', 'ADD_DEDUCTION', 'EXPORT_DATA', 'IMPORT_DEDUCTIONS'];
export const MANAGER_PERMISSIONS = [...ACCOUNTANT_PERMISSIONS, 'ADD_EMPLOYEE', 'EDIT_EMPLOYEE', 'IMPORT_EMPLOYEES', 'EDIT_ADVANCE', 'EDIT_DEDUCTION'];
export const ADMIN_PERMISSIONS = Object.keys(PERMISSIONS);

export const ROLE_PRESETS = [
  { name: 'مشاهد فقط', perms: VIEWER_PERMISSIONS, color: '#475569' },
  { name: 'محاسب', perms: ACCOUNTANT_PERMISSIONS, color: '#1E40AF' },
  { name: 'مدير', perms: MANAGER_PERMISSIONS, color: '#B45309' },
  { name: 'أدمن', perms: ADMIN_PERMISSIONS, color: '#8B2635' },
];

export const DEDUCTION_TYPES = [
  'من الراتب الشهري',
  'من رصيد الإجازة',
  'من مكافأة نهاية الخدمة',
  'من الساعات الإضافية',
  'من المكافأة / البونص',
  'تسديد نقدي مباشر',
  'تسديد بنكي',
  'أخرى',
];

export const EMPLOYEE_STATUS = {
  active: { label: 'نشط', class: 'badge-emerald' },
  suspended: { label: 'موقوف', class: 'badge-amber' },
  terminated: { label: 'منتهي الخدمة', class: 'badge-gray' },
};

export const ADVANCE_STATUS = {
  active: { label: 'نشطة', class: 'badge-blue' },
  partial: { label: 'مسددة جزئيًا', class: 'badge-amber' },
  paid: { label: 'مسددة كاملًا', class: 'badge-emerald' },
};

// ============== Helpers ==============
export const fmt = (n) => {
  const num = Number(n) || 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export const fmtInt = (n) => {
  const num = Number(n) || 0;
  return new Intl.NumberFormat('en-US').format(Math.round(num));
};

export const fmtDate = (d) => {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('ar-SA-u-ca-gregory', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return d; }
};

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const monthKeyOf = (d) => new Date(d).toISOString().slice(0, 7);
export const yearKeyOf = (d) => new Date(d).toISOString().slice(0, 4);
export const currentMonth = () => new Date().toISOString().slice(0, 7);
export const currentYear = () => String(new Date().getFullYear());

export const monthLabel = (ym) => {
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('ar-SA-u-ca-gregory', { month: 'long', year: 'numeric' });
};

export const shortMonthLabel = (ym) => {
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('ar-SA-u-ca-gregory', { month: 'short' });
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Add months to ISO date string
export const addMonths = (isoDate, months) => {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

// Excel column matching
export const findCol = (row, candidates) => {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const k = keys.find((x) => x && x.toString().trim().toLowerCase() === cand.toLowerCase());
    if (k) return row[k];
  }
  for (const cand of candidates) {
    const k = keys.find((x) => x && x.toString().toLowerCase().includes(cand.toLowerCase()));
    if (k) return row[k];
  }
  return undefined;
};

export const COLS = {
  NAME: ['اسم الموظف', 'الاسم', 'name', 'employee', 'موظف'],
  IQAMA: ['رقم الإقامة', 'الإقامة', 'iqama', 'id', 'هوية', 'الهوية'],
  PHONE: ['رقم الجوال', 'الجوال', 'phone', 'mobile', 'الهاتف'],
  POSITION: ['الوظيفة', 'المسمى', 'position', 'job', 'title'],
  DEPARTMENT: ['القسم', 'department', 'الإدارة'],
  SALARY: ['الراتب', 'salary', 'الراتب الشهري'],
  HIRE_DATE: ['تاريخ التوظيف', 'hire date', 'التاريخ', 'date of hire'],
  AMOUNT: ['المبلغ', 'مبلغ السلفة', 'amount', 'value', 'سلفة'],
  DEDUCT_AMOUNT: ['المبلغ', 'المبلغ المخصوم', 'amount', 'خصم'],
  DEDUCT_TYPE: ['نوع الخصم', 'الخصم', 'type', 'النوع', 'مصدر الخصم'],
  DATE: ['التاريخ', 'date', 'يوم'],
  NOTES: ['ملاحظات', 'notes', 'بيان', 'الملاحظات'],
  INSTALLMENTS: ['الأقساط', 'عدد الأقساط', 'installments'],
};

// Permission check
export const can = (user, permKey) => {
  if (!user) return false;
  if (user.role === 'admin' || user.isAdmin) return true;
  return (user.permissions || []).includes(permKey);
};
