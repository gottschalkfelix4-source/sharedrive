import { Router, Request, Response } from 'express'
import { scanSessions } from '../lib/scanSessions'

const router = Router()

// GET /api/scan/:scanId — polled by the client while a transfer is being virus-scanned
router.get('/:scanId', async (req, res, next) => {
  try {
    const session = await scanSessions.get(req.params.scanId)
    if (!session)
      return res
        .status(404)
        .json({ error: 'Scan session not found or expired' })

    res.json({
      status: session.status,
      scannedBytes: session.scannedBytes,
      totalBytes: session.pending.totalSize,
      currentFile: session.currentFile,
      phase: session.phase,
      virus: session.virus,
      infectedFile: session.infectedFile,
      message: session.errorMessage,
      result: session.result,
    })
  } catch (err) {
    next(err)
  }
})

export { router as scanRouter }
