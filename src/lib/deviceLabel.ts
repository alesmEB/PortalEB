/** Short "OS · Browser" label for the admin devices list - just enough to
 * tell devices apart, not a full user-agent parser. */
export function deviceLabelFromUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Dispositivo desconocido'

  let os = 'Desconocido'
  if (/android/i.test(userAgent)) os = 'Android'
  else if (/iphone|ipad|ipod/i.test(userAgent)) os = 'iOS'
  else if (/windows/i.test(userAgent)) os = 'Windows'
  else if (/macintosh|mac os/i.test(userAgent)) os = 'Mac'
  else if (/linux/i.test(userAgent)) os = 'Linux'

  let browser = 'Desconocido'
  if (/edg\//i.test(userAgent)) browser = 'Edge'
  else if (/chrome\//i.test(userAgent)) browser = 'Chrome'
  else if (/firefox\//i.test(userAgent)) browser = 'Firefox'
  else if (/safari\//i.test(userAgent)) browser = 'Safari'

  return `${os} · ${browser}`
}
