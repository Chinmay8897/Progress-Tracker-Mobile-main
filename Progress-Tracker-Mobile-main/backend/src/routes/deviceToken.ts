import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabaseAdmin } from '../services/supabase/supabaseClient.js'

const router = Router()

const registerTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  platform: z.string().optional()
})

router.post('/device-token', requireAuth, async (req, res) => {
  try {
    const parsed = registerTokenSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors })
    }

    const { token, platform } = parsed.data
    const userId = req.user!.userId

    // Upsert the token for the user
    const { error } = await supabaseAdmin
      .from('device_tokens')
      .upsert(
        { user_id: userId, token, platform, updated_at: new Date().toISOString() },
        { onConflict: 'token' }
      )

    if (error) {
      console.error('Error inserting device token:', error)
      return res.status(500).json({ error: 'Failed to register token' })
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error('device-token error', err)
    return res.status(500).json({ error: 'internal' })
  }
})

export default router
