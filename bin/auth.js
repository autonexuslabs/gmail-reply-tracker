#!/usr/bin/env node
// One-time: get a refresh token for your mailbox.
//
// 1. Google Cloud console → APIs & Services → enable the Gmail API.
// 2. Credentials → Create OAuth client ID → type "Desktop app".
// 3. Put GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env, then:
//
//      node --env-file=.env bin/auth.js
//
// It opens a local page on 127.0.0.1, you approve in the browser, and it
// prints the GMAIL_REFRESH_TOKEN line to paste into .env. Nothing is stored
// anywhere else.

import http from 'node:http'

const { GMAIL_CLIENT_ID: clientId, GMAIL_CLIENT_SECRET: clientSecret } = process.env
if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first.')
  process.exit(1)
}

const SCOPE = 'https://www.googleapis.com/auth/gmail.modify'

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const code = url.searchParams.get('code')
  if (!code) { res.writeHead(404); return res.end() }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  })
  const data = await tokenRes.json()
  res.writeHead(200, { 'content-type': 'text/plain' })
  if (!data.refresh_token) {
    res.end('No refresh token returned. Remove the app at myaccount.google.com/permissions and try again.')
    console.error(data)
  } else {
    res.end('Done. You can close this tab and return to the terminal.')
    console.log(`\nAdd this line to .env:\n\nGMAIL_REFRESH_TOKEN=${data.refresh_token}\n`)
  }
  server.close()
})

let redirectUri
server.listen(0, '127.0.0.1', () => {
  redirectUri = `http://127.0.0.1:${server.address().port}`
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  auth.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent' })
  console.log(`Open this URL in your browser and approve access:\n\n${auth}\n`)
})
