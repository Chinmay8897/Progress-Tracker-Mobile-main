import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const router = Router()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data')
const ADMIN_TOKEN_FILE = path.join(DATA_DIR, 'adminExpoPushToken.json')

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

router.post('/device-token', async (req, res) => {
  try {
    const { token, role } = req.body as { token?: string; role?: string }
    if (!token) return res.status(400).json({ error: 'token is required' })
    // For now accept role 'admin' to mark this as the admin token
    const payload = {
      token,
      role: role ?? 'unknown',
      updatedAt: new Date().toISOString(),
    }

    // Write to a local file (server-only). In production, persist to DB.
    fs.writeFileSync(ADMIN_TOKEN_FILE, JSON.stringify(payload, null, 2), { encoding: 'utf8' })

    return res.json({ ok: true })
  } catch (err) {
    console.error('device-token error', err)
    return res.status(500).json({ error: 'internal' })
  }
})

// Optional GET to read the stored admin token (server-only debug)
router.get('/device-token/admin', (_req, res) => {
  try {
    if (!fs.existsSync(ADMIN_TOKEN_FILE)) return res.status(404).json({ error: 'not found' })
    const raw = fs.readFileSync(ADMIN_TOKEN_FILE, 'utf8')
    return res.type('json').send(raw)
  } catch (err) {
    console.error('device-token read error', err)
    return res.status(500).json({ error: 'internal' })
  }
})

export default router
