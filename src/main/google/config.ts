import { promises as fs } from 'fs'

export interface GoogleClientConfig {
  clientId: string
  clientSecret?: string
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
    return null
  } catch {
    return null
  }
}
