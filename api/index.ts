import type { VercelRequest, VercelResponse } from '@vercel/node'
import app from '../server/server'

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Forward to Express app
  return app(req as any, res as any)
}

