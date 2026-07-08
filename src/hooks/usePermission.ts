import { useAuth } from '../contexts/AuthContext'

/**
 * Checks the current user's granular permission list, independent of role -
 * an ADMIN with no explicit grant for `permission` is denied just like
 * anyone else. See dataconnect/schema/schema.gql (Permission/UserPermission).
 */
export function usePermission(permission: string): boolean {
  const { permissions } = useAuth()
  return permissions.includes(permission)
}
