import nodemailer from 'nodemailer'
import { getSetting } from '../routes/settings'

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!
  )
}

async function getTransport() {
  const enabled = await getSetting('email.enabled')
  if (enabled !== 'true') return null

  const host = await getSetting('email.host')
  const allowed = process.env.SMTP_ALLOWED_HOSTS?.split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
  if (allowed?.length && !allowed.includes(host.toLowerCase()))
    throw new Error('SMTP host is not allowed by the operator')
  return nodemailer.createTransport({
    host,
    port: parseInt(await getSetting('email.port')),
    secure: (await getSetting('email.secure')) === 'true',
    auth: {
      user: await getSetting('email.user'),
      pass: await getSetting('email.password'),
    },
  })
}

export async function sendTestEmail(to: string): Promise<void> {
  const transport = await getTransport()
  if (!transport) throw new Error('Email is not enabled in settings')

  const from = await getSetting('email.from')
  const appName = await getSetting('app.name')

  await transport.sendMail({
    from: { name: appName, address: from },
    to,
    subject: `${appName} – SMTP test email`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1e1e3a;">${escapeHtml(appName)}</h2>
        <p>Your SMTP configuration is working correctly. ✅</p>
        <p style="color:#64748b;font-size:13px;">This is a test email sent from the admin panel.</p>
      </div>
    `,
  })
}

export async function sendVerificationEmail(
  to: string,
  token: string
): Promise<void> {
  const transport = await getTransport()
  if (!transport) return

  const from = await getSetting('email.from')
  const appName = await getSetting('app.name')
  const base = new URL((await getSetting('app.baseUrl')) || 'http://localhost')
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error('Invalid application URL')
  const appUrl = escapeHtml(base.toString().replace(/\/$/, ''))

  await transport.sendMail({
    from: { name: appName, address: from },
    to,
    subject: `Verify your ${appName} account`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1e1e3a;">${escapeHtml(appName)}</h2>
        <p>Click the button below to verify your email address. This link expires in 24 hours.</p>
        <a href="${appUrl}/verify-email?token=${token}"
           style="display:inline-block;padding:12px 28px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:600;">
          Verify Email
        </a>
        <p style="color:#64748b;font-size:13px;">If you didn't create an account, you can ignore this email.</p>
      </div>
    `,
  })
}

export async function sendPasswordResetEmail(
  to: string,
  token: string
): Promise<void> {
  const transport = await getTransport()
  if (!transport) return

  const from = await getSetting('email.from')
  const appName = await getSetting('app.name')
  const base = new URL((await getSetting('app.baseUrl')) || 'http://localhost')
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error('Invalid application URL')
  const appUrl = escapeHtml(base.toString().replace(/\/$/, ''))

  await transport.sendMail({
    from: { name: appName, address: from },
    to,
    subject: `Reset your ${appName} password`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1e1e3a;">${escapeHtml(appName)}</h2>
        <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
        <a href="${appUrl}/reset-password?token=${token}"
           style="display:inline-block;padding:12px 28px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:600;">
          Reset Password
        </a>
        <p style="color:#64748b;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  })
}

export async function sendUploadConfirmationEmail(
  to: string,
  shortId: string,
  title: string | null,
  expiresAt: Date
): Promise<void> {
  const transport = await getTransport()
  if (!transport) return

  const from = await getSetting('email.from')
  const appName = await getSetting('app.name')
  const base = new URL((await getSetting('app.baseUrl')) || 'http://localhost')
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error('Invalid application URL')
  const appUrl = escapeHtml(base.toString().replace(/\/$/, ''))

  await transport.sendMail({
    from: { name: appName, address: from },
    to,
    subject: `Your transfer is ready to share`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1e1e3a;">${escapeHtml(appName)}</h2>
        <p>Your transfer${title ? ` "<strong>${escapeHtml(title)}</strong>"` : ''} was created successfully. Share the link below with the recipient.</p>
        <a href="${appUrl}/d/${shortId}"
           style="display:inline-block;padding:12px 28px;background:#6366f1;color:white;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:600;">
          View transfer
        </a>
        <p style="color:#64748b;font-size:13px;">This link expires on ${expiresAt.toLocaleString()}.</p>
      </div>
    `,
  })
}

export async function sendDownloadNotification(
  to: string,
  shortId: string,
  title: string | null
): Promise<void> {
  const transport = await getTransport()
  if (!transport) return

  const from = await getSetting('email.from')
  const appName = await getSetting('app.name')
  const base = new URL((await getSetting('app.baseUrl')) || 'http://localhost')
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error('Invalid application URL')
  const appUrl = escapeHtml(base.toString().replace(/\/$/, ''))

  await transport.sendMail({
    from: { name: appName, address: from },
    to,
    subject: `Your transfer was downloaded`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${escapeHtml(appName)}</h2>
        <p>Your transfer${title ? ` "<strong>${escapeHtml(title)}</strong>"` : ''} was downloaded.</p>
        <p><a href="${appUrl}/d/${shortId}">View transfer</a></p>
      </div>
    `,
  })
}
