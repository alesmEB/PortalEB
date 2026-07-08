import type { ReactNode } from 'react'
import { usePermission } from '../hooks/usePermission'

interface HasPermissionProps {
  permission: string
  children: ReactNode
  /** Rendered instead when the permission is missing, e.g. a disabled button. Defaults to hiding. */
  fallback?: ReactNode
}

export function HasPermission({ permission, children, fallback = null }: HasPermissionProps) {
  const allowed = usePermission(permission)
  return <>{allowed ? children : fallback}</>
}
