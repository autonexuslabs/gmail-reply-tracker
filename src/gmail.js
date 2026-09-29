// gmail.js — the four Gmail API calls this project needs, over plain fetch.
//
// Auth is an OAuth refresh token for ONE mailbox (see bin/auth.js). The access
// token is refreshed on demand and cached until a minute before it expires.
// Scope: gmail.modify, the narrowest scope that allows starring a thread.

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export function gmailClient({ clientId, clientSecret, refreshToken, fetchFn = fetch }) {
  let token = null
  let expiresAt = 0

  async function accessToken() {
    if (token && Date.now() < expiresAt - 60_000) return token
    const res = await fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    })
    if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`)
    const data = await res.json()
    token = data.access_token
    expiresAt = Date.now() + data.expires_in * 1000
    return token
  }

  async function call(path, init = {}) {
    const res = await fetchFn(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json', ...init.headers },
    })
    if (!res.ok) throw new Error(`Gmail ${init.method || 'GET'} ${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`)
    return res.json()
  }

  return {
    /** Message ids matching a Gmail search, newest first, up to `max`. */
    async listIds(q, max = 200) {
      const ids = []
      let pageToken
      do {
        const params = new URLSearchParams({ q, maxResults: String(Math.min(100, max - ids.length)) })
        if (pageToken) params.set('pageToken', pageToken)
        const data = await call(`/messages?${params}`)
        ids.push(...(data.messages || []).map((m) => m.id))
        pageToken = data.nextPageToken
      } while (pageToken && ids.length < max)
      return ids
    },
    getMessage: (id) => call(`/messages/${id}?format=full`),
    star: (threadId) => call(`/threads/${threadId}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: ['STARRED'] }) }),
  }
}
