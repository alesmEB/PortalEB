/**
 * Data Connect queries default to fetchPolicy "PREFER_CACHE", which can
 * return stale results right after a mutation (e.g. a just-created row
 * missing from the next list refresh). Pass this to every query call so
 * reads always reflect the latest committed state.
 */
export const FRESH = { fetchPolicy: 'SERVER_ONLY' } as const
