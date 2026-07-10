import { createHash } from 'crypto'
import { describe, expect, it } from 'vitest'
import { buildAuthUrl, generatePkce } from '../src/main/google/pkce'

describe('generatePkce', () => {
  it('produces url-safe verifier of RFC length and matching S256 challenge', () => {
    const { verifier, challenge } = generatePkce()
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/)
    const expected = createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
  })

  it('is random across calls', () => {
    expect(generatePkce().verifier).not.toBe(generatePkce().verifier)
  })
})

describe('buildAuthUrl', () => {
  it('encodes all required params', () => {
    const url = new URL(
      buildAuthUrl({
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:43110/callback',
        challenge: 'chal',
        scopes: ['openid', 'email'],
        state: 'xyz'
      })
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:43110/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge')).toBe('chal')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe('openid email')
    expect(url.searchParams.get('state')).toBe('xyz')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
  })
})
