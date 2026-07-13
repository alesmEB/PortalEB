import { useState, type ReactNode } from 'react'
import { UserRole } from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { useAuth } from '../contexts/AuthContext'
import { usePermission } from '../hooks/usePermission'
import { EbClientsTab } from './eb/EbClientsTab'
import { EbFaqTab } from './eb/EbFaqTab'
import { EbNewsTab } from './eb/EbNewsTab'
import { EbProductsTab } from './eb/EbProductsTab'

type Tab = 'clients' | 'products' | 'news' | 'faq'

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

export function EbEngineeringPage() {
  const { profile } = useAuth()
  const isLab = usePermission('admin:lab')
  const canAccess = profile?.role === UserRole.ADMIN || isLab
  const [tab, setTab] = useState<Tab>('clients')

  if (!canAccess) {
    return (
      <div className="flex-1 p-4">
        <BackButton to="/" />
        <p className="mt-4 text-sm text-slate-500">No tienes permiso para ver esta sección.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">EB Engineering</h1>
      <p className="text-sm text-slate-500">Sección en construcción - visible para admins.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <TabButton active={tab === 'clients'} onClick={() => setTab('clients')}>
          Clientes
        </TabButton>
        <TabButton active={tab === 'products'} onClick={() => setTab('products')}>
          Productos
        </TabButton>
        <TabButton active={tab === 'news'} onClick={() => setTab('news')}>
          Noticias
        </TabButton>
        <TabButton active={tab === 'faq'} onClick={() => setTab('faq')}>
          FAQ
        </TabButton>
      </div>

      <div className="mt-4">
        {tab === 'clients' && <EbClientsTab />}
        {tab === 'products' && <EbProductsTab />}
        {tab === 'news' && <EbNewsTab />}
        {tab === 'faq' && <EbFaqTab />}
      </div>
    </div>
  )
}
