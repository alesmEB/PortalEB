import { useEffect, useState, type ReactNode } from 'react'
import { getMyEbClient, listMyEbClientProducts, type ListMyEbClientProductsData } from '@dataconnect/generated'
import { EbAssignedCablesSection, EbControllerProductCard } from '../components/EbControllerProductCard'
import { useAuth } from '../contexts/AuthContext'
import { FRESH } from '../lib/dataConnectOptions'
import { EB_LANGUAGES, EB_LANGUAGE_LABEL, ebT, useEbLanguage } from '../lib/ebI18n'
import { EbFaqTab } from './eb/EbFaqTab'
import { EbNewsTab } from './eb/EbNewsTab'

type ProductRow = ListMyEbClientProductsData['ebClientProducts'][number]
type Tab = 'products' | 'news' | 'faq'

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

/** The real page an EB Engineering client sees after logging in (see the
 * auto-redirect in DashboardPage): their purchased units, plus read-only
 * access to Noticias/FAQ - the same content admins manage under EB
 * Engineering > Productos/Noticias/FAQ, just without the edit controls. */
export function EbMyProductsPage() {
  const { signOut } = useAuth()
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductRow[] | null>(null)
  const [lang, setLang] = useEbLanguage()
  const [tab, setTab] = useState<Tab>('products')

  useEffect(() => {
    getMyEbClient(FRESH).then((res) => {
      const client = res.data.ebClients[0]
      if (!client) {
        setProducts([])
        return
      }
      setCompanyName(client.companyName)
      listMyEbClientProducts({ clientId: client.id }, FRESH).then((productsRes) =>
        setProducts(productsRes.data.ebClientProducts),
      )
    })
  }, [])

  return (
    <div className="flex-1 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-eb-blue-dark">{ebT(lang, 'pageTitle')}</h1>
          {companyName && <p className="text-sm text-slate-500">{companyName}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as typeof lang)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-eb-blue"
          >
            {EB_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {EB_LANGUAGE_LABEL[code]}
              </option>
            ))}
          </select>
          <button
            onClick={() => signOut()}
            className="rounded-lg border border-slate-300 bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-eb-blue hover:text-eb-blue"
          >
            {ebT(lang, 'signOut')}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <TabButton active={tab === 'products'} onClick={() => setTab('products')}>
          {ebT(lang, 'tabProducts')}
        </TabButton>
        <TabButton active={tab === 'news'} onClick={() => setTab('news')}>
          {ebT(lang, 'tabNews')}
        </TabButton>
        <TabButton active={tab === 'faq'} onClick={() => setTab('faq')}>
          {ebT(lang, 'tabFaq')}
        </TabButton>
      </div>

      {tab === 'products' && (
        <>
          {products === null && <p className="mt-4 text-sm text-slate-500">{ebT(lang, 'loading')}</p>}

          {products !== null && companyName === null && (
            <p className="mt-4 text-sm text-slate-500">{ebT(lang, 'noLinkedClient')}</p>
          )}

          {products !== null && companyName !== null && (
            <div className="mt-4 space-y-2">
              {products.length === 0 && (
                <p className="text-sm text-slate-400">{ebT(lang, 'noProducts')}</p>
              )}
              {products.map((product) => (
                <div key={product.id} className="space-y-2">
                  <EbControllerProductCard
                    productName={product.productName}
                    purchasedAt={product.purchasedAt}
                    hardwareNumber={product.hardwareNumber}
                    serialNumber={product.serialNumber}
                    softwareVersion={product.softwareVersion}
                    lang={lang}
                  />
                  <EbAssignedCablesSection
                    cables={product.cables}
                    registeredCables={product.registeredCables}
                    lang={lang}
                  />
                  {product.programFileUrl && (
                    <a
                      href={product.programFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-xs font-medium text-eb-blue underline"
                    >
                      {ebT(lang, 'downloadProgram')}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'news' && (
        <div className="mt-4">
          <EbNewsTab readOnly />
        </div>
      )}

      {tab === 'faq' && (
        <div className="mt-4">
          <EbFaqTab readOnly />
        </div>
      )}
    </div>
  )
}
