import { useState, useMemo, useEffect } from 'react';
import {
  UserPlus, Trash2, Edit, Mail, Shield, Info,
} from 'lucide-react';
import Modal, { ConfirmModal } from '../components/Modal';
import { fmtDate } from '../lib/utils';
import {
  PERMISSIONS, PERMISSION_GROUPS, ROLE_PRESETS, ADMIN_PERMISSIONS,
} from '../lib/utils';

export default function UsersPage({
  user, members, invitations, showToast,
  inviteUser, updateMemberPermissions, removeMember, removeInvitation,
}) {
  const [tab, setTab] = useState('members');
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState(null); // member to edit
  const [confirmDel, setConfirmDel] = useState(null);

  return (
    <div className="space-y-6">
      <div className="card rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
          <div>
            <h2 className="display text-2xl font-bold ink">إدارة المستخدمين</h2>
            <p className="text-sm ink-muted">إضافة وإدارة الأعضاء وتحديد صلاحياتهم</p>
          </div>
          <button onClick={() => setShowInvite(true)} className="btn-primary px-4 py-2 rounded-md text-sm font-medium inline-flex items-center gap-2">
            <UserPlus size={16} /> دعوة مستخدم
          </button>
        </div>

        <div className="flex gap-1 mb-4 border-b divider">
          <button onClick={() => setTab('members')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'members' ? 'border-current accent-emerald' : 'border-transparent ink-muted'}`}>
            الأعضاء النشطون
            <span className="badge badge-emerald mr-2">{members.length}</span>
          </button>
          <button onClick={() => setTab('invitations')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'invitations' ? 'border-current accent-emerald' : 'border-transparent ink-muted'}`}>
            الدعوات المعلقة
            {invitations.length > 0 && <span className="badge badge-amber mr-2">{invitations.length}</span>}
          </button>
        </div>

        {tab === 'members' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b divider">
                  <th className="text-right py-2 ink-muted font-medium">الاسم</th>
                  <th className="text-right py-2 ink-muted font-medium">البريد</th>
                  <th className="text-right py-2 ink-muted font-medium">الدور</th>
                  <th className="text-right py-2 ink-muted font-medium hidden md:table-cell">الصلاحيات</th>
                  <th className="text-right py-2 ink-muted font-medium hidden lg:table-cell">تاريخ الانضمام</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.uid} className="border-b divider row-hover">
                    <td className="py-3 ink font-medium">
                      {m.displayName || '-'}
                      {m.uid === user.uid && <span className="badge badge-blue mr-2">أنت</span>}
                    </td>
                    <td className="py-3 ink-muted text-xs num">{m.email}</td>
                    <td className="py-3">
                      <span className={`badge ${m.isAdmin ? 'badge-burgundy' : 'badge-blue'}`}>
                        {m.isAdmin ? '👑 أدمن' : (m.role || 'عضو')}
                      </span>
                    </td>
                    <td className="py-3 ink-muted text-xs hidden md:table-cell num">
                      {m.isAdmin ? 'كل الصلاحيات' : `${m.permissions?.length || 0} صلاحية`}
                    </td>
                    <td className="py-3 ink-muted text-xs hidden lg:table-cell num">
                      {m.createdAt ? fmtDate(m.createdAt) : '-'}
                    </td>
                    <td className="py-3 text-left whitespace-nowrap">
                      {m.uid !== user.uid && (
                        <>
                          <button onClick={() => setEditing(m)} className="btn-ghost p-1.5 rounded" title="تعديل الصلاحيات">
                            <Edit size={14} />
                          </button>
                          <button onClick={() => setConfirmDel({ kind: 'member', data: m })} className="btn-ghost p-1.5 rounded" title="إزالة">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'invitations' && (
          <div className="overflow-x-auto">
            {invitations.length === 0 ? (
              <div className="text-center py-12">
                <Mail size={40} className="mx-auto mb-3 ink-muted" />
                <div className="ink font-medium">لا توجد دعوات معلقة</div>
                <div className="text-sm ink-muted mt-1">اضغط "دعوة مستخدم" لإنشاء دعوة جديدة</div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 p-3 mb-3 rounded-md text-sm" style={{ background: '#DBEAFE', color: '#1E40AF' }}>
                  <Info size={14} />
                  <span>الدعوات تنشط تلقائياً حين يفتح الشخص حساب بنفس البريد</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b divider">
                      <th className="text-right py-2 ink-muted font-medium">البريد</th>
                      <th className="text-right py-2 ink-muted font-medium">الاسم المقترح</th>
                      <th className="text-right py-2 ink-muted font-medium">الدور</th>
                      <th className="text-right py-2 ink-muted font-medium">تاريخ الإنشاء</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((inv) => (
                      <tr key={inv.invId} className="border-b divider row-hover">
                        <td className="py-3 num text-xs ink">{inv.email}</td>
                        <td className="py-3 ink-muted text-xs">{inv.displayName || '-'}</td>
                        <td className="py-3">
                          <span className={`badge ${inv.role === 'admin' ? 'badge-burgundy' : 'badge-blue'}`}>
                            {inv.role === 'admin' ? '👑 أدمن' : inv.role}
                          </span>
                        </td>
                        <td className="py-3 ink-muted text-xs num">{fmtDate(inv.createdAt)}</td>
                        <td className="py-3 text-left">
                          <button onClick={() => setConfirmDel({ kind: 'invitation', data: inv })} className="btn-ghost p-1.5 rounded">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>

      {/* Invite modal */}
      <InviteUserForm
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onSave={async (data) => {
          const ok = await inviteUser(data);
          if (ok) setShowInvite(false);
        }}
      />

      {/* Edit permissions */}
      <EditMemberForm
        open={!!editing}
        member={editing}
        onClose={() => setEditing(null)}
        onSave={async (data) => {
          const ok = await updateMemberPermissions(editing.uid, data);
          if (ok) setEditing(null);
        }}
      />

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => {
          if (!confirmDel) return;
          if (confirmDel.kind === 'member') removeMember(confirmDel.data.uid);
          else if (confirmDel.kind === 'invitation') removeInvitation(confirmDel.data.invId);
        }}
        title={confirmDel?.kind === 'member' ? 'إزالة عضو' : 'حذف دعوة'}
        message={confirmDel?.kind === 'member'
          ? `هل تريد إزالة "${confirmDel.data.displayName || confirmDel.data.email}" من النظام؟ سيفقد الوصول. (لإزالة حسابه من Firebase نهائياً، اذهب لـ Firebase Console)`
          : `هل تريد حذف دعوة "${confirmDel?.data.email}"؟`}
        confirmLabel="تأكيد"
        danger
      />
    </div>
  );
}

function InviteUserForm({ open, onClose, onSave }) {
  const [form, setForm] = useState({
    email: '', displayName: '', preset: 1, // accountant
    permissions: ROLE_PRESETS[1].perms,
    role: 'محاسب',
    isAdmin: false,
  });
  const [saving, setSaving] = useState(false);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        email: '', displayName: '', preset: 1,
        permissions: ROLE_PRESETS[1].perms,
        role: 'محاسب',
        isAdmin: false,
      });
      setCustom(false);
    }
  }, [open]);

  const setPreset = (idx) => {
    const preset = ROLE_PRESETS[idx];
    setForm({
      ...form,
      preset: idx,
      permissions: preset.perms,
      role: preset.name,
      isAdmin: idx === 3,
    });
  };

  const togglePerm = (key) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((k) => k !== key)
        : [...f.permissions, key],
    }));
  };

  const submit = async () => {
    if (!form.email) return;
    setSaving(true);
    await onSave({
      email: form.email,
      displayName: form.displayName,
      role: form.isAdmin ? 'admin' : form.role,
      permissions: form.isAdmin ? ADMIN_PERMISSIONS : form.permissions,
      isAdmin: form.isAdmin,
    });
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="دعوة مستخدم جديد" size="lg">
      <div className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-md text-sm" style={{ background: '#FCF8EC', color: '#B45309' }}>
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <strong>كيف تعمل الدعوة؟</strong>
            <ol className="list-decimal mr-4 mt-1 text-xs space-y-0.5">
              <li>أنشئ دعوة بالبريد والصلاحيات</li>
              <li>أعطِ المستخدم الرابط واطلب منه فتح حساب بنفس البريد</li>
              <li>سيحصل تلقائياً على الصلاحيات التي حددتها</li>
            </ol>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="البريد الإلكتروني *">
            <input type="email" className="input-base num" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="user@example.com" />
          </Field>
          <Field label="الاسم المقترح">
            <input className="input-base" value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="(يمكن للمستخدم تغييره)" />
          </Field>
        </div>

        <div>
          <label className="text-xs ink-muted block mb-2">قالب الصلاحيات</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {ROLE_PRESETS.map((p, idx) => (
              <button key={idx} onClick={() => { setPreset(idx); setCustom(false); }}
                className={`p-3 rounded-md border-2 text-sm font-medium transition-all ${
                  form.preset === idx && !custom ? 'shadow-sm' : 'border-transparent'
                }`}
                style={{
                  background: form.preset === idx && !custom ? '#F4F8F5' : '#FFFEF9',
                  borderColor: form.preset === idx && !custom ? '#1F4D3F' : '#E8DFC8',
                  color: form.preset === idx && !custom ? '#1F4D3F' : '#57534e',
                }}>
                {p.name}
                <div className="text-xs mt-0.5 opacity-70 num">{p.perms.length} صلاحية</div>
              </button>
            ))}
          </div>
          <button onClick={() => setCustom(!custom)} className="text-xs accent-emerald font-medium mt-2">
            {custom ? '← العودة للقوالب' : 'مخصص (اختيار يدوي للصلاحيات) ←'}
          </button>
        </div>

        {custom && !form.isAdmin && (
          <div className="border divider rounded-md p-4 max-h-72 overflow-y-auto" style={{ background: '#FCF8EC' }}>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.title} className="mb-3 last:mb-0">
                <div className="font-semibold ink text-sm mb-1.5">{group.title}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  {group.keys.map((k) => (
                    <label key={k} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                      <input type="checkbox" checked={form.permissions.includes(k)}
                        onChange={() => togglePerm(k)} className="w-3.5 h-3.5" />
                      <span className="ink">{PERMISSIONS[k]}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t divider">
        <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-md text-sm">إلغاء</button>
        <button onClick={submit} disabled={saving || !form.email}
          className="btn-primary px-5 py-2 rounded-md text-sm font-medium">
          {saving ? 'جاري الحفظ...' : 'إنشاء الدعوة'}
        </button>
      </div>
    </Modal>
  );
}

function EditMemberForm({ open, member, onClose, onSave }) {
  const [form, setForm] = useState({ permissions: [], isAdmin: false, role: 'محاسب' });
  const [custom, setCustom] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && member) {
      setForm({
        permissions: member.permissions || [],
        isAdmin: member.isAdmin || false,
        role: member.role || 'محاسب',
      });
      setCustom(true);
    }
  }, [open, member]);

  const setPreset = (idx) => {
    const preset = ROLE_PRESETS[idx];
    setForm({
      permissions: preset.perms,
      role: preset.name,
      isAdmin: idx === 3,
    });
    setCustom(false);
  };

  const togglePerm = (key) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((k) => k !== key)
        : [...f.permissions, key],
    }));
  };

  const submit = async () => {
    setSaving(true);
    await onSave({
      role: form.isAdmin ? 'admin' : form.role,
      permissions: form.isAdmin ? ADMIN_PERMISSIONS : form.permissions,
      isAdmin: form.isAdmin,
    });
    setSaving(false);
  };

  if (!member) return null;

  return (
    <Modal open={open} onClose={onClose} title={`تعديل صلاحيات: ${member.displayName || member.email}`} size="lg">
      <div className="space-y-4">
        <label className="flex items-center gap-2 cursor-pointer p-3 rounded-md border divider" style={{ background: form.isAdmin ? '#FBF4F1' : '#FFFEF9' }}>
          <input type="checkbox" checked={form.isAdmin}
            onChange={(e) => setForm({ ...form, isAdmin: e.target.checked, role: e.target.checked ? 'admin' : 'محاسب' })}
            className="w-4 h-4" />
          <Shield size={16} className="accent-burgundy" />
          <span className="ink font-medium">منح صلاحية أدمن كاملة</span>
        </label>

        {!form.isAdmin && (
          <>
            <div>
              <label className="text-xs ink-muted block mb-2">قوالب الصلاحيات</label>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_PRESETS.slice(0, 3).map((p, idx) => (
                  <button key={idx} onClick={() => setPreset(idx)}
                    className="p-3 rounded-md border-2 text-sm font-medium border-transparent hover:bg-stone-50"
                    style={{ background: '#FFFEF9', borderColor: '#E8DFC8' }}>
                    {p.name}
                    <div className="text-xs mt-0.5 ink-muted num">{p.perms.length} صلاحية</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border divider rounded-md p-4 max-h-72 overflow-y-auto" style={{ background: '#FCF8EC' }}>
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.title} className="mb-3 last:mb-0">
                  <div className="font-semibold ink text-sm mb-1.5">{group.title}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {group.keys.map((k) => (
                      <label key={k} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                        <input type="checkbox" checked={form.permissions.includes(k)}
                          onChange={() => togglePerm(k)} className="w-3.5 h-3.5" />
                        <span className="ink">{PERMISSIONS[k]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {form.isAdmin && (
          <div className="text-center p-6 rounded-md" style={{ background: '#FBF4F1' }}>
            <Shield size={32} className="mx-auto mb-2 accent-burgundy" />
            <div className="ink font-medium">سيحصل المستخدم على كل الصلاحيات</div>
            <div className="text-sm ink-muted mt-1">بما فيها إضافة وحذف مستخدمين آخرين</div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t divider">
        <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-md text-sm">إلغاء</button>
        <button onClick={submit} disabled={saving} className="btn-primary px-5 py-2 rounded-md text-sm font-medium">
          {saving ? 'جاري الحفظ...' : 'حفظ التعديل'}
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
