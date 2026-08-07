import { useEffect, useState } from 'react'
import { getMyEbClient, listMyEbClientProducts, type ListMyEbClientProductsData } from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { EbAssignedCablesSection, EbControllerProductCard } from '../components/EbControllerProductCard'
import { FRESH } from '../lib/dataConnectOptions'
import { EB_LANGUAGES, EB_LANGUAGE_LABEL, ebT, useEbLanguage } from '../lib/ebI18n'

type ProductRow = ListMyEbClientProductsData['ebClientProducts'][number]

export function EbMyProductsPage() {
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductRow[] | null>(null)
  const [lang, setLang] = useEbLanguage()

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
      <BackButton to="/" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-eb-blue-dark">{ebT(lang, 'pageTitle')}</h1>
          {companyName && <p className="text-sm text-slate-500">{companyName}</p>}
        </div>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as typeof lang)}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-eb-blue"
        >
          {EB_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {EB_LANGUAGE_LABEL[code]}
            </option>
          ))}
        </select>
      </div>

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
    </div>
  )
}
