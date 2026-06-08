import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dotenv from 'dotenv'
import { GoogleAuth } from 'google-auth-library'

dotenv.config()

function buildQuotedRange(tabName: string): string {
  const safe = tabName.trim().replace(/'/g, "''")
  return `'${safe}'!A1:ZZ10000`
}

/** Em `vite dev`, expõe `/.netlify/functions/sheet-read` com service account do `.env` */
function sheetReadDevPlugin(): Plugin {
  return {
    name: 'sheet-read-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || ''
        if (!rawUrl.startsWith('/.netlify/functions/sheet-read')) return next()

        const sendJson = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }

        try {
          const parsed = new URL(rawUrl, 'http://localhost')
          const sheetId = parsed.searchParams.get('sheetId')?.trim()
          const tab = parsed.searchParams.get('tab')?.trim()

          if (!sheetId || !tab) {
            sendJson(400, { error: 'Parâmetros sheetId e tab são obrigatórios' })
            return
          }

          const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
          const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

          if (!clientEmail || !privateKey) {
            sendJson(500, { error: 'Credenciais Google não configuradas no .env (GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY)' })
            return
          }

          const auth = new GoogleAuth({
            credentials: { client_email: clientEmail, private_key: privateKey },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
          })
          const client = await auth.getClient()
          const token = await client.getAccessToken()
          if (!token.token) throw new Error('Falha ao obter token do service account')

          const range = encodeURIComponent(buildQuotedRange(tab))
          const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`
          const apiRes = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token.token}` } })
          const json = await apiRes.json() as { values?: string[][]; error?: { message?: string } }

          if (!apiRes.ok) {
            sendJson(apiRes.status, { error: json.error?.message || `Google API ${apiRes.status}` })
            return
          }

          const values: string[][] = json.values || []
          if (values.length === 0) {
            sendJson(200, { success: true, data: { headers: [], rows: [], count: 0 } })
            return
          }

          const headers = values[0].map(cell => String(cell ?? '').trim())
          const rows = values.slice(1).map(row => {
            const obj: Record<string, string> = {}
            headers.forEach((header, index) => {
              obj[header] = row[index] != null ? String(row[index]) : ''
            })
            return obj
          })

          sendJson(200, { success: true, data: { headers, rows, count: rows.length } })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Erro desconhecido'
          sendJson(500, { error: message })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), sheetReadDevPlugin()],
})
