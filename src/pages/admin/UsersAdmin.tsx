import { useEffect, useMemo, useState } from 'react'
import { UserRole, listPermissions, listUsers, type ListPermissionsData, type ListUsersData } from '@dataconnect/generated'
import { HasPermission } from '../../components/HasPermission'
import { SearchInput } from '../../components/SearchInput'
import {
  adminCreatePermission,
  adminCreateUser,
  adminDeletePermission,
  adminDeleteUserDevice,
  adminListUserDevices,
  adminUpdateUser,
  type UserDevice,
} from '../../lib/adminActions'
import { deviceLabelFromUserAgent } from '../../lib/deviceLabel'
import { FRESH } from '../../lib/dataConnectOptions'
import { changeUserPassword } from '../../lib/userClaims'
import { roleLabel } from '../../lib/userRole'

type UserRow = ListUsersData['users'][number]
type Permissions = ListPermissionsData['permissions']

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'

function PermissionPicker({
  permissions,
  selected,
  onToggle,
}: {
  permissions: Permissions
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">Permisos</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {permissions.map((permission) => (
          <label
            key={permission.id}
            className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${
              selected.has(permission.id)
                ? 'border-eb-blue bg-eb-blue text-white'
                : 'border-slate-300 text-slate-600'
            }`}
          >
            <input
              type="checkbox"
              className="hidden"
              checked={selected.has(permission.id)}
              onChange={() => onToggle(permission.id)}
            />
            {permission.key}
          </label>
        ))}
      </div>
    </div>
  )
}

function CreatePermissionForm({ onCreated }: { onCreated: () => void }) {
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = /^[a-z]+:[a-z]+$/.test(key.trim()) && description.trim()

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await adminCreatePermission(key.trim(), description.trim())
      setKey('')
      setDescription('')
      onCreated()
    } catch {
      setError('No se pudo crear el permiso. Comprueba que la clave no exista ya.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3">
      <input
        placeholder="Clave (ej. orders:assignable)"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Descripción"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={inputClass}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
        className="w-full rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? 'Creando...' : 'Crear permiso'}
      </button>
    </div>
  )
}

function CreateUserForm({
  permissions,
  onCreated,
}: {
  permissions: Permissions
  onCreated: (displayName: string) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<UserRole>(UserRole.TECHNICIAN)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canSubmit = email.trim() && password.length >= 6 && displayName.trim()

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await adminCreateUser({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        role,
        permissionIds: [...selected],
      })
      onCreated(displayName.trim())
    } catch {
      setError(
        'No se pudo crear el usuario. Comprueba que el email no esté ya en uso y que la contraseña tenga al menos 6 caracteres.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3">
      <input
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Contraseña (mín. 6 caracteres)"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Nombre completo"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className={inputClass}
      />
      <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputClass}>
        {Object.values(UserRole).map((r) => (
          <option key={r} value={r}>
            {roleLabel[r]}
          </option>
        ))}
      </select>
      <PermissionPicker permissions={permissions} selected={selected} onToggle={toggle} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
        className="w-full rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? 'Creando...' : 'Crear usuario'}
      </button>
    </div>
  )
}

function ChangePasswordSection({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<'ok' | 'error' | null>(null)

  async function handleSubmit() {
    setSubmitting(true)
    setResult(null)
    try {
      await changeUserPassword(userId, newPassword)
      setResult('ok')
      setNewPassword('')
    } catch {
      setResult('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-eb-blue underline"
      >
        Cambiar contraseña
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="text-xs text-amber-800">
        Esto cambia la contraseña directamente, sin pasar por el email de restablecimiento, y
        cierra las sesiones que este usuario tenga abiertas.
      </p>
      <input
        type="password"
        placeholder="Nueva contraseña (mín. 6 caracteres)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className={`mt-2 ${inputClass}`}
      />
      {result === 'ok' && <p className="mt-1 text-xs text-eb-teal-dark">Contraseña actualizada.</p>}
      {result === 'error' && (
        <p className="mt-1 text-xs text-red-600">No se pudo cambiar la contraseña.</p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            setOpen(false)
            setNewPassword('')
            setResult(null)
          }}
          className="flex-1 rounded-lg border border-slate-300 py-1.5 text-sm text-slate-600"
        >
          Cancelar
        </button>
        <button
          disabled={newPassword.length < 6 || submitting}
          onClick={handleSubmit}
          className="flex-1 rounded-lg bg-amber-600 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Cambiando...' : 'Confirmar cambio'}
        </button>
      </div>
    </div>
  )
}

function DevicesSection({ userId }: { userId: string }) {
  const [devices, setDevices] = useState<UserDevice[] | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  function refresh() {
    adminListUserDevices(userId).then(setDevices)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function handleDelete(deviceId: string) {
    await adminDeleteUserDevice(deviceId)
    setConfirmingDeleteId(null)
    refresh()
  }

  if (devices === null) {
    return <p className="text-xs text-slate-400">Cargando dispositivos...</p>
  }

  return (
    <div>
      <p className="text-xs font-medium text-slate-500">
        Dispositivos con notificaciones ({devices.length})
      </p>
      {devices.length === 0 && (
        <p className="mt-1 text-xs text-slate-400">Ninguno registrado.</p>
      )}
      <ul className="mt-1 space-y-1">
        {devices.map((device) => (
          <li key={device.id} className="rounded-lg border border-slate-200 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-700">
                  {deviceLabelFromUserAgent(device.userAgent)}
                </p>
                <p className="text-[11px] text-slate-400">
                  Última vez: {device.updatedAt ? new Date(device.updatedAt).toLocaleString('es-ES') : 'desconocida'}
                </p>
              </div>
              <button
                onClick={() => setConfirmingDeleteId(device.id)}
                className="shrink-0 text-slate-400 hover:text-red-600"
                title="Quitar dispositivo"
              >
                ✕
              </button>
            </div>
            {confirmingDeleteId === device.id && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2">
                <p className="text-xs text-red-700">
                  Dejará de recibir notificaciones en este dispositivo hasta que vuelva a abrir la app.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setConfirmingDeleteId(null)}
                    className="flex-1 rounded-lg border border-slate-300 py-1 text-xs text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(device.id)}
                    className="flex-1 rounded-lg bg-red-600 py-1 text-xs font-semibold text-white"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function EditUserForm({
  user,
  permissions,
  onSaved,
}: {
  user: UserRow
  permissions: Permissions
  onSaved: () => void
}) {
  const [displayName, setDisplayName] = useState(user.displayName)
  const [role, setRole] = useState<UserRole>(user.role)
  const [isActive, setIsActive] = useState(user.isActive)
  const initialPermissionIds = useMemo(
    () => new Set(user.userPermissions.map((up) => up.permission.id)),
    [user],
  )
  const [selected, setSelected] = useState<Set<string>>(initialPermissionIds)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSubmitting(true)
    setError(null)
    try {
      await adminUpdateUser({
        userId: user.id,
        displayName: displayName.trim(),
        role,
        isActive,
        permissionIds: [...selected],
        expectedPermissionIds: [...initialPermissionIds],
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
      <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputClass}>
        {Object.values(UserRole).map((r) => (
          <option key={r} value={r}>
            {roleLabel[r]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Activo
      </label>
      <PermissionPicker permissions={permissions} selected={selected} onToggle={toggle} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={submitting}
        onClick={handleSave}
        className="w-full rounded-lg bg-eb-teal py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? 'Guardando...' : 'Guardar cambios'}
      </button>
      <HasPermission permission="users:changepassword">
        <ChangePasswordSection userId={user.id} />
      </HasPermission>
      <DevicesSection userId={user.id} />
    </div>
  )
}

export function UsersAdmin() {
  const [users, setUsers] = useState<ListUsersData['users'] | null>(null)
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  const [creating, setCreating] = useState(false)
  const [creatingPermission, setCreatingPermission] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeletePermissionId, setConfirmingDeletePermissionId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [createdMessage, setCreatedMessage] = useState<string | null>(null)

  async function refresh() {
    const [usersRes, permissionsRes] = await Promise.all([listUsers(FRESH), listPermissions(FRESH)])
    setUsers(usersRes.data.users)
    setPermissions(permissionsRes.data.permissions)
  }

  useEffect(() => {
    refresh()
  }, [])

  const query = search.trim().toLowerCase()
  const filteredUsers = users?.filter(
    (user) =>
      !query ||
      user.displayName.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query),
  )

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{users?.length ?? 0} usuarios</p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white"
        >
          {creating ? 'Cancelar' : '+ Nuevo usuario'}
        </button>
      </div>

      <div className="mt-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o email..." />
      </div>

      {createdMessage && (
        <p className="mt-3 rounded-lg bg-eb-teal/10 px-3 py-2 text-sm text-eb-teal-dark">
          {createdMessage}
        </p>
      )}

      {creating && permissions && (
        <CreateUserForm
          permissions={permissions}
          onCreated={(displayName) => {
            setCreating(false)
            setCreatedMessage(`Usuario "${displayName}" creado correctamente.`)
            refresh()
            setTimeout(() => setCreatedMessage(null), 4000)
          }}
        />
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white/90 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-eb-blue-dark">
            Permisos ({permissions?.length ?? 0})
          </p>
          <button
            onClick={() => setCreatingPermission((v) => !v)}
            className="rounded-lg border border-eb-blue px-3 py-1.5 text-sm font-semibold text-eb-blue"
          >
            {creatingPermission ? 'Cancelar' : '+ Nuevo permiso'}
          </button>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {permissions?.map((permission) =>
            confirmingDeletePermissionId === permission.id ? (
              <li
                key={permission.id}
                className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-700"
              >
                ¿Eliminar "{permission.key}"?
                <button
                  onClick={() =>
                    adminDeletePermission(permission.id).then(() => {
                      setConfirmingDeletePermissionId(null)
                      refresh()
                    })
                  }
                  className="font-semibold underline"
                >
                  Sí
                </button>
                <button onClick={() => setConfirmingDeletePermissionId(null)}>No</button>
              </li>
            ) : (
              <li
                key={permission.id}
                title={permission.description}
                className="flex items-center gap-1 rounded-full bg-eb-blue/10 px-2.5 py-1 text-xs text-eb-blue-dark"
              >
                {permission.key}
                <button
                  onClick={() => setConfirmingDeletePermissionId(permission.id)}
                  className="text-eb-blue-dark/50 hover:text-red-600"
                  title="Eliminar permiso"
                >
                  ✕
                </button>
              </li>
            ),
          )}
        </ul>
        {creatingPermission && (
          <CreatePermissionForm
            onCreated={() => {
              setCreatingPermission(false)
              refresh()
            }}
          />
        )}
      </div>

      <div className="mt-4 space-y-2">
        {filteredUsers?.map((user) => (
          <div key={user.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
            <button
              onClick={() => setEditingId(editingId === user.id ? null : user.id)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <p className="text-sm font-semibold text-eb-blue-dark">{user.displayName}</p>
                <p className="text-xs text-slate-500">
                  {user.email} · {roleLabel[user.role]}
                  {!user.isActive && ' · inactivo'}
                </p>
              </div>
            </button>
            {editingId === user.id && permissions && (
              <EditUserForm
                user={user}
                permissions={permissions}
                onSaved={() => {
                  setEditingId(null)
                  refresh()
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
