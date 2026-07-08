import { useState, type ReactNode } from 'react'
import { BackButton } from '../components/BackButton'
import { BoatsAdmin } from './admin/BoatsAdmin'
import { CustomersAdmin } from './admin/CustomersAdmin'
import { UsersAdmin } from './admin/UsersAdmin'

type Tab = 'users' | 'boats' | 'customers'

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm ${
        active ? 'border-eb-blue bg-eb-blue text-white' : 'border-slate-300 text-slate-600'
      }`}
    >
      {children}
    </button>
  )
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Administración</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
          Usuarios
        </TabButton>
        <TabButton active={tab === 'boats'} onClick={() => setTab('boats')}>
          Embarcaciones / máquinas
        </TabButton>
        <TabButton active={tab === 'customers'} onClick={() => setTab('customers')}>
          Clientes
        </TabButton>
      </div>

      <div className="mt-4">
        {tab === 'users' && <UsersAdmin />}
        {tab === 'boats' && <BoatsAdmin />}
        {tab === 'customers' && <CustomersAdmin />}
      </div>
    </div>
  )
}
