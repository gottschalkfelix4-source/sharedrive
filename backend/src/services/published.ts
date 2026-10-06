import { prisma } from '../lib/prisma'
import { log } from './logger'
import { sendUploadConfirmationEmail } from './email'

export async function notifyPublished(
  shortId: string,
  ip?: string
): Promise<void> {
  const transfer = await prisma.transfer.findUnique({ where: { shortId } })
  if (!transfer) return
  await log('info', 'upload', `Transfer published: ${shortId}`, {
    ip,
    userId: transfer.userId ?? undefined,
  })
  if (transfer.notifyEmail)
    await sendUploadConfirmationEmail(
      transfer.notifyEmail,
      shortId,
      transfer.encrypted ? null : transfer.title,
      transfer.expiresAt
    )
}
