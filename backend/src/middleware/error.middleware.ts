import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

// Everything used to leave as 500, so a mistyped field and a crashed database looked
// identical to the client. Map the errors we raise on purpose to their own status.
export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    const first = error.issues[0]
    const field = first?.path.join('.')
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: field ? `${field}: ${first.message}` : first?.message ?? 'Invalid request.',
    })
  }

  // Errors we raise on purpose may carry the status they deserve.
  const status = (error as { status?: number })?.status
  if (typeof status === 'number' && status >= 400 && status < 600) {
    return res.status(status).json({
      code: (error as { code?: string })?.code ?? 'REQUEST_FAILED',
      message: error instanceof Error ? error.message : 'Request failed.',
    })
  }

  const code = (error as { code?: string })?.code
  if (code === 'P2025') {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found.' })
  }
  if (code === 'P2002') {
    return res.status(409).json({ code: 'ALREADY_EXISTS', message: 'That record already exists.' })
  }

  const message = error instanceof Error ? error.message : 'Internal server error'
  return res.status(500).json({ code: 'INTERNAL_SERVER_ERROR', message })
}
