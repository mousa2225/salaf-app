import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import {
  Home, Users, FileText, BookOpen, LogOut, ArrowUpCircle,
  ArrowDownCircle, BarChart3, Settings, Menu, X, UserCog
} from 'lucide-react';
import { can } from '../lib/utils';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'الرئيسية', icon: Home, perm: 'VIEW_DASHBOARD' },
  { id: 'employees', label: 'الموظفون', icon: Users, perm: 'VIEW_EMPLOYEES' },
  { id: 'advances', label: 'السلف', icon: ArrowUpCircle, perm: 'VIEW_ADVANCES' },
  { id: 'deductions', label: 'الخصومات', icon: ArrowDownCircle, perm: 'VIEW_DEDUCTIONS' },
  { id: 'statement', label: 'كشف حساب', icon: FileText, perm: 'VIEW_STATEMENT' },
  { id: 'reports', label: 'التقارير والتحليل', icon: BarChart3, perm: 'VIEW_REPORTS' },
  { id: 'users', label: 'المستخدمون', icon: UserCog, perm: 'MANAGE_USERS' },
];

export default function Layout({ user, currentPage, setPage, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const availableNav = NAV_ITEMS.filter((n) => can(user, n.perm));

  return (
    <div className="min-h-screen flex" dir="rtl">
      {/* Sidebar */}
      <aside className={`fixed sm:sticky top-0 right-0 h-screen w-64 z-40 flex-shrink-0 border-l divider transform transition-transform sm:transform-none ${mobileOpen ? 'translate-x-0' : 'translate-x-full sm:translate-x-0'}`} style={{ background: '#FFFEF9' }}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-5 border-b divider flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: '#1F4D3F' }}>
                <BookOpen size={20} color="#F7F3E9" />
              </div>
              <div>
                <h1 className="display text-lg font-bold ink leading-tight">دفتر السلف</h1>
                <p className="text-xs ink-muted">Pro</p>
              </div>
            </div>
            <button onClick={() => setMobileOpen(false)} className="sm:hidden btn-ghost p-1 rounded">
              <X size={18} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {availableNav.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setPage(id); setMobileOpen(false); }}
                className={`tab-pill w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-right ${currentPage === id ? 'active' : 'ink'}`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-3 border-t divider">
            <div className="px-3 py-2 mb-2">
              <div className="text-xs ink-muted">المسجّل دخوله</div>
              <div className="text-sm font-medium ink truncate">{user.displayName || user.email}</div>
              <div className="text-xs ink-muted truncate">{user.email}</div>
              {user.role && (
                <span className={`badge mt-1.5 ${user.isAdmin ? 'badge-burgundy' : 'badge-blue'}`}>
                  {user.isAdmin ? 'أدمن' : user.role}
                </span>
              )}
            </div>
            <button
              onClick={async () => { if (confirm('تسجيل الخروج؟')) await signOut(auth); }}
              className="btn-ghost w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm"
            >
              <LogOut size={14} /> تسجيل الخروج
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="sm:hidden fixed top-0 left-0 right-0 h-14 border-b divider z-30 flex items-center justify-between px-4" style={{ background: '#FFFEF9' }}>
        <button onClick={() => setMobileOpen(true)} className="btn-ghost p-2 rounded">
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: '#1F4D3F' }}>
            <BookOpen size={16} color="#F7F3E9" />
          </div>
          <span className="display font-bold ink">دفتر السلف</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && <div className="sm:hidden fixed inset-0 bg-black/40 z-30" onClick={() => setMobileOpen(false)} />}

      {/* Main content */}
      <main className="flex-1 min-w-0 mt-14 sm:mt-0">
        <div className="max-w-7xl mx-auto p-4 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export function PermissionDenied({ permName }) {
  return (
    <div className="card rounded-lg p-12 text-center">
      <Settings size={48} className="mx-auto mb-4 ink-muted" />
      <h2 className="display text-2xl font-bold ink mb-2">صلاحية مطلوبة</h2>
      <p className="ink-muted mb-1">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
      {permName && <p className="text-sm ink-muted">الصلاحية المطلوبة: <span className="font-semibold">{permName}</span></p>}
      <p className="text-xs ink-muted mt-4">تواصل مع الأدمن لتفعيل الصلاحية</p>
    </div>
  );
}
