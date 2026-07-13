import { useEffect, useState } from 'react'
import { getMyEbClient, listMyEbClientProducts, type ListMyEbClientProductsData } from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { FRESH } from '../lib/dataConnectOptions'

type ProductRow = ListMyEbClientProductsData['ebClientProducts'][number]

export function EbMyProductsPage() {
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductRow[] | null>(null)

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
      <h1 className="text-lg font-semibold text-eb-blue-dark">Mis productos</h1>
      {companyName && <p className="text-sm text-slate-500">{companyName}</p>}

      {products === null && <p className="mt-4 text-sm text-slate-500">Cargando...</p>}

      {products !== null && companyName === null && (
        <p className="mt-4 text-sm text-slate-500">
          Tu usuario no tiene ningún cliente EB Engineering vinculado.
        </p>
      )}

      {products !== null && companyName !== null && (
        <div className="mt-4 space-y-2">
          {products.length === 0 && (
            <p className="text-sm text-slate-400">Todavía no tienes productos registrados.</p>
          )}
          {products.map((product) => (
            <div key={product.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
              <p className="text-sm font-semibold text-eb-blue-dark">{product.productName}</p>
              <p className="text-xs text-slate-500">
                Nº de serie: {product.serialNumber} · Nº de hardware: {product.hardwareNumber}
              </p>
              {product.cables.length > 0 && (
                <p className="text-xs text-slate-500">
                  Cables: {product.cables.map((c) => c.cableType.name).join(', ')}
                </p>
              )}
              {product.purchasedAt && (
                <p className="text-xs text-slate-400">Comprado: {product.purchasedAt}</p>
              )}
              {product.programFileUrl && (
                <a
                  href={product.programFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-eb-blue underline"
                >
                  Descargar programa personalizado
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
