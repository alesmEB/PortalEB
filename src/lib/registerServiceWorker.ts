import { registerSW } from 'virtual:pwa-register'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * registerType: 'autoUpdate' + workbox.skipWaiting/clientsClaim makes the new
 * service worker activate on its own; registerSW then reloads the page as
 * soon as that "activated" transition happens (default behavior, no
 * onNeedReload override needed - see node_modules/vite-plugin-pwa's
 * client/build/register.js for the exact event wiring). Polling
 * registration.update() catches a new deploy even if a tab is left open for
 * hours, which matters for technicians who don't close the browser.
 */
export function registerServiceWorker() {
  registerSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS)
    },
  })
}
