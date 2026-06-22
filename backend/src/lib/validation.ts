import { z } from 'zod'

// Password policy for user-chosen account passwords (register, reset, change,
// admin setup). Deliberately NOT applied to machine-generated infrastructure
// secrets (DB/MinIO passwords, JWT secret) or per-transfer share passwords —
// those are a different security category with their own rules.
export const passwordSchema = z
  .string()
  .min(8, 'Passwort muss mindestens 8 Zeichen lang sein')
  .max(128)
  .regex(/[A-Z]/, 'Passwort muss mindestens einen Großbuchstaben enthalten')
  .regex(/[0-9]/, 'Passwort muss mindestens eine Zahl enthalten')
  .regex(/[^A-Za-z0-9]/, 'Passwort muss mindestens ein Sonderzeichen enthalten')
