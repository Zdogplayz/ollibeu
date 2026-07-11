import { promises as fs } from 'fs'

export interface GoogleClientConfig {
  clientId: string
  clientSecret?: string
}

// Injected at build time (electron-vite `define`) so release installers ship
// Google-ready. Desktop-app OAuth credentials are non-confidential by design
// (the flow is protected by PKCE); they live in CI secrets only to keep them
// out of the public repo. Absent in dev/test builds unless the env provides them.
declare const __OLLIBEU_GID__: string | undefined
declare const __OLLIBEU_GSECRET__: string | undefined

function embeddedConfig(): GoogleClientConfig | null {
  const clientId = typeof __OLLIBEU_GID__ === 'string' ? __OLLIBEU_GID__ : ''
  if (!clientId) return null
  const clientSecret = typeof __OLLIBEU_GSECRET__ === 'string' ? __OLLIBEU_GSECRET__ : undefined
  return { clientId, ...(clientSecret ? { clientSecret } : {}) }
}

export async function loadGoogleConfig(
  env: NodeJS.ProcessEnv,
  jsonPath: string
): Promise<GoogleClientConfig | null> {
  if (env.GOOGLE_CLIENT_ID) {
    return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
  }
  try {
    const parsed = JSON.parse(await fs.readFile(jsonPath, 'utf8'))
    if (typeof parsed.clientId === 'string' && parsed.clientId) {
      return { clientId: parsed.clientId, clientSecret: parsed.clientSecret }
    }
    return embeddedConfig()
  } catch {
    return embeddedConfig()
  }
}
