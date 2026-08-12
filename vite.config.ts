import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dotenv from 'dotenv'
import { GoogleAuth } from 'google-auth-library'

const appRoot = path.dirname(fileURLToPath(import.meta.url))
const repoEnvDir = appRoot

// .env na raiz do repositório
dotenv.config({ path: path.join(repoEnvDir, '.env') })

function parseCSV(csvText: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i]
    const nextChar = csvText[i + 1]
    if (char === '"') {
      if (inQuotes && nextChar === '"') { currentCell += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim()); currentCell = ''
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentCell.trim())
      if (currentRow.some(c => c !== '')) rows.push(currentRow)
      currentRow = []; currentCell = ''
    } else if (char !== '\r') {
      currentCell += char
    }
  }
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim())
    if (currentRow.some(c => c !== '')) rows.push(currentRow)
  }
  return rows
}

/** Em `vite dev`, expõe `/.netlify/functions/sheet-read` via gviz + service account */
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
          const range = parsed.searchParams.get('range')?.trim()

          if (!sheetId || !tab) {
            sendJson(400, { error: 'Parâmetros sheetId e tab são obrigatórios' })
            return
          }

          const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
          const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

          if (!clientEmail || !privateKey) {
            sendJson(500, {
              error: 'Fallback local indisponível: configure GOOGLE_CLIENT_EMAIL e GOOGLE_PRIVATE_KEY no .env (raiz do repositório ou pasta do app). A aba Carteira usa o Gateway — faça login e confira VITE_API_ORIGIN.',
            })
            return
          }

          const auth = new GoogleAuth({
            credentials: { client_email: clientEmail, private_key: privateKey },
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
          })
          const client = await auth.getClient()
          const tokenResult = await client.getAccessToken()
          if (!tokenResult.token) throw new Error('Falha ao obter token')

          const tabVariants = [...new Set([tab, 'CD_TODOS_DESEMPENHO', 'CD_TODOS_NOVOS_FORMATADO'])]
          let lastError = 'Aba não encontrada'

          for (const tabName of tabVariants) {
            try {
              let gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`
              if (range) gvizUrl += `&range=${encodeURIComponent(range)}`
              const apiRes = await fetch(gvizUrl, { headers: { Authorization: `Bearer ${tokenResult.token}` }, redirect: 'follow' })
              if (!apiRes.ok) {
                lastError = `gviz ${apiRes.status}`
                continue
              }
              const values = parseCSV(await apiRes.text())
              if (values.length === 0) continue

              const headers = values[0].map(cell => String(cell ?? '').trim())
              const rows = values.slice(1).map(row => {
                const obj: Record<string, string> = {}
                headers.forEach((header, index) => { obj[header] = row[index] != null ? String(row[index]) : '' })
                return obj
              })
              sendJson(200, { success: true, data: { headers, rows, count: rows.length, values } })
              return
            } catch (err: unknown) {
              lastError = err instanceof Error ? err.message : lastError
            }
          }

          sendJson(404, { error: lastError })
        } catch (err: unknown) {
          sendJson(500, { error: err instanceof Error ? err.message : 'Erro desconhecido' })
        }
      })
    },
  }
}

/**
 * Em `vite dev`, expõe as Netlify Functions que batem no banco (ex.: cs-kpis)
 * reaproveitando o handler REAL via ssrLoadModule (transpila o .ts na hora).
 * Só ativo em desenvolvimento — em produção a própria Netlify serve as functions.
 */
function dbFunctionsDevPlugin(): Plugin {
  const FN_PREFIX = '/.netlify/functions/'
  const DB_FNS = new Set([
    'cs-kpis', 'parceiros-ativos', 'ativacoes-campanhas', 'ativacoes-mensal', 'campanhas',
    'funcionamento', 'parceiros-status', 'logos', 'crm-base', 'crm-cupons', 'crm-gmv', 'carteira', 'pedido-mensal', 'jornada',
  ])
  return {
    name: 'db-functions-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || ''
        if (!rawUrl.startsWith(FN_PREFIX)) return next()
        const parsed = new URL(rawUrl, 'http://localhost')
        const fnName = parsed.pathname.slice(FN_PREFIX.length).split('/')[0]
        if (!DB_FNS.has(fnName)) return next()

        try {
          const mod = await server.ssrLoadModule(`/netlify/functions/${fnName}.ts`)
          const queryStringParameters = Object.fromEntries(parsed.searchParams.entries())
          const result = await mod.handler(
            {
              httpMethod: req.method || 'GET',
              queryStringParameters,
              headers: { origin: 'http://localhost' },
            },
            {},
          )
          res.statusCode = result.statusCode ?? 200
          for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v as string)
          res.end(result.body ?? '')
        } catch (err: unknown) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Erro no dev plugin' }))
        }
      })
    },
  }
}

export default defineConfig({
  envDir: repoEnvDir,
  plugins: [react(), tailwindcss(), sheetReadDevPlugin(), dbFunctionsDevPlugin()],
})
