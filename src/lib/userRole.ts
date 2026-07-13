import { UserRole } from '@dataconnect/generated'

export const roleLabel: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.CLIENT]: 'Cliente',
  [UserRole.TECHNICIAN]: 'Técnico',
}
