// ── MORALI PAY — Runtime Environment Variable Validation ──
// Validates all critical environment variables at server startup.
// In production, missing REQUIRED variables cause the app to refuse to start.
// In development/CI, warnings are logged but the app can still run.

/**
 * Environment variable schema definition.
 * Each entry describes a variable, its requirement level, and validation rules.
 */
interface EnvVarSpec {
  /** Name of the environment variable */
  name: string;
  /** Whether the variable is exposed to the client (NEXT_PUBLIC_*) */
  isPublic: boolean;
  /** Requirement level */
  required: "always" | "production" | "optional";
  /** Human-readable description of what this variable controls */
  description: string;
  /** Minimum length for string values (0 = no check) */
  minLength?: number;
  /** Custom validation function — returns error message or null if valid */
  validate?: (value: string) => string | null;
}

const ENV_SCHEMA: EnvVarSpec[] = [
  // ── Firebase Client (public) ──
  {
    name: "NEXT_PUBLIC_FIREBASE_API_KEY",
    isPublic: true,
    required: "production",
    description: "Clé API Firebase (authentification client)",
    minLength: 10,
  },
  {
    name: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    isPublic: true,
    required: "production",
    description: "Domaine d'authentification Firebase",
  },
  {
    name: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    isPublic: true,
    required: "production",
    description: "Identifiant du projet Firebase",
    minLength: 1,
  },
  {
    name: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    isPublic: true,
    required: "optional",
    description: "Bucket de stockage Firebase",
  },
  {
    name: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    isPublic: true,
    required: "optional",
    description: "ID expéditeur FCM (notifications push)",
  },
  {
    name: "NEXT_PUBLIC_FIREBASE_APP_ID",
    isPublic: true,
    required: "production",
    description: "Identifiant de l'application Firebase",
  },
  {
    name: "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
    isPublic: true,
    required: "optional",
    description: "ID de mesure Google Analytics",
  },

  // ── Firebase Admin (server-only) ──
  {
    name: "GOOGLE_APPLICATION_CREDENTIALS",
    isPublic: false,
    required: "production",
    description: "Chemin vers le fichier de clé du service Firebase Admin (compte de service JSON)",
  },

  // ── PIN Encryption (server-only) ──
  {
    name: "MORALI_PIN_MASTER_KEY",
    isPublic: false,
    required: "production",
    description: "Clé maîtresse de chiffrement des PIN (AES-256, min 32 caractères)",
    minLength: 32,
  },

  // ── Admin (server-only) ──
  {
    name: "ADMIN_EMAIL",
    isPublic: false,
    required: "production",
    description: "Email de l'administrateur principal",
    validate: (v) => (v.includes("@") ? null : `Format email invalide: "${v}"`),
  },
  {
    name: "ADMIN_PASSWORD_HASH",
    isPublic: false,
    required: "production",
    description: "Hash bcrypt du mot de passe administrateur",
    minLength: 20,
  },

  // ── Email (server-only) ──
  {
    name: "RESEND_API_KEY",
    isPublic: false,
    required: "optional",
    description: "Clé API Resend (envoi d'emails). Absent = mode démo pour les OTP.",
  },
  {
    name: "RESEND_FROM_EMAIL",
    isPublic: false,
    required: "optional",
    description: "Email expéditeur Resend (ex: Morali <noreply@morali.pay>)",
  },

  // ── SMS (server-only) ──
  {
    name: "SMS_API_KEY",
    isPublic: false,
    required: "optional",
    description: "Clé API du fournisseur SMS (Twilio, Africa's Talking, etc.). Absent = mode démo OTP.",
  },

  // ── Sentry (public) ──
  {
    name: "NEXT_PUBLIC_SENTRY_DSN",
    isPublic: true,
    required: "optional",
    description: "DSN Sentry (monitoring d'erreurs). Absent = pas de suivi d'erreurs en production.",
  },

  // ── Webhooks (server-only) ──
  {
    name: "PAYMENT_WEBHOOK_SECRET",
    isPublic: false,
    required: "optional",
    description: "Secret pour la vérification des webhooks de paiement (signature HMAC).",
  },

  // ── Security flags (server-only) ──
  {
    name: "ALLOW_INSECURE_AUTH",
    isPublic: false,
    required: "optional",
    description: "Flag de développement pour autoriser l'auth sans Firebase Admin. NE JAMAIS activer en production.",
    validate: (v) =>
      v === "true" && process.env.NODE_ENV === "production"
        ? "CRITIQUE: ALLOW_INSECURE_AUTH=true est interdit en production!"
        : null,
  },
];

export interface ValidationResult {
  /** Variables valides */
  valid: { name: string; value: string; description: string }[];
  /** Variables manquantes (requises) */
  missing: { name: string; description: string; severity: "error" | "warning" }[];
  /** Variables invalides (présentes mais format incorrect) */
  invalid: { name: string; error: string; description: string }[];
  /** Variables optionnelles manquantes (informationnel) */
  optionalMissing: { name: string; description: string }[];
  /** Résultat global */
  ok: boolean;
}

/**
 * Validate all environment variables against the schema.
 *
 * In production: missing REQUIRED variables return `ok: false`.
 * In development/CI: warnings are logged, `ok: true` (graceful degradation).
 */
export function validateEnv(): ValidationResult {
  const isProduction = process.env.NODE_ENV === "production";
  const isCI = !!process.env.CI;

  const result: ValidationResult = {
    valid: [],
    missing: [],
    invalid: [],
    optionalMissing: [],
    ok: true,
  };

  for (const spec of ENV_SCHEMA) {
    const value = process.env[spec.name];

    // Variable not set
    if (!value) {
      if (spec.required === "always") {
        result.missing.push({
          name: spec.name,
          description: spec.description,
          severity: "error",
        });
        result.ok = false;
      } else if (spec.required === "production" && isProduction) {
        result.missing.push({
          name: spec.name,
          description: spec.description,
          severity: "error",
        });
        result.ok = false;
      } else if (spec.required === "production" && !isCI) {
        // Warn in development
        result.missing.push({
          name: spec.name,
          description: spec.description,
          severity: "warning",
        });
      } else {
        result.optionalMissing.push({
          name: spec.name,
          description: spec.description,
        });
      }
      continue;
    }

    // Variable set — validate format
    if (spec.minLength && value.length < spec.minLength) {
      const error = `Trop court: ${value.length} caractères (minimum ${spec.minLength})`;
      result.invalid.push({ name: spec.name, error, description: spec.description });
      if (spec.required === "always" || (spec.required === "production" && isProduction)) {
        result.ok = false;
      }
      continue;
    }

    if (spec.validate) {
      const validationError = spec.validate(value);
      if (validationError) {
        result.invalid.push({ name: spec.name, error: validationError, description: spec.description });
        if (spec.required !== "optional") {
          result.ok = false;
        }
        continue;
      }
    }

    // Valid
    result.valid.push({ name: spec.name, value: maskSecret(value, spec), description: spec.description });
  }

  return result;
}

/**
 * Mask sensitive values for logging.
 * Public variables (NEXT_PUBLIC_*) show first 8 chars + masked.
 * Server-only variables are fully masked.
 */
function maskSecret(value: string, spec: EnvVarSpec): string {
  if (spec.isPublic) {
    if (value.length <= 8) return value;
    return `${value.slice(0, 8)}${"*".repeat(Math.min(value.length - 8, 20))}`;
  }
  return `${"*".repeat(Math.min(value.length, 8))}`;
}

/**
 * Validate environment and log results.
 * In production, throws if validation fails (prevents server start).
 * In development/CI, logs warnings and continues.
 */
export function validateEnvOrThrow(): ValidationResult {
  const result = validateEnv();
  const isProduction = process.env.NODE_ENV === "production";

  // Log valid variables
  if (result.valid.length > 0) {
    console.log(`[env] ${result.valid.length} variable(s) validée(s)`);
  }

  // Log missing variables
  for (const m of result.missing) {
    if (m.severity === "error") {
      console.error(`[env] CRITICAL: ${m.name} est requis — ${m.description}`);
    } else {
      console.warn(`[env] WARNING: ${m.name} manquant — ${m.description}`);
    }
  }

  // Log invalid variables
  for (const inv of result.invalid) {
    console.error(`[env] INVALID: ${inv.name} — ${inv.error} (${inv.description})`);
  }

  // Log optional missing (dev only)
  if (!isProduction && result.optionalMissing.length > 0) {
    console.log(`[env] ${result.optionalMissing.length} variable(s) optionnelle(s) non configurée(s) (mode démo activé):`);
    for (const opt of result.optionalMissing) {
      console.log(`       - ${opt.name}: ${opt.description}`);
    }
  }

  // In production, crash if critical variables are missing
  if (isProduction && !result.ok) {
    const criticalMissing = result.missing.filter((m) => m.severity === "error");
    const criticalInvalid = result.invalid.filter((inv) => {
      const spec = ENV_SCHEMA.find((s) => s.name === inv.name);
      return spec && spec.required !== "optional";
    });
    console.error(
      `\n[env] ═══════════════════════════════════════════════════` +
      `\n[env]  DÉMARRAGE INTERDIT EN PRODUCTION` +
      `\n[env]  ${criticalMissing.length} variable(s) requise(s) manquante(s), ${criticalInvalid.length} invalide(s).` +
      `\n[env]  Configurez-les dans .env.production ou dans les paramètres Vercel.` +
      `\n[env] ═══════════════════════════════════════════════════\n`,
    );
    throw new Error(
      `Environment validation failed: ${criticalMissing.map((m) => m.name).join(", ")}` +
      (criticalInvalid.length ? `, ${criticalInvalid.map((i) => i.name).join(", ")}` : ""),
    );
  }

  if (!isProduction && result.missing.some((m) => m.severity === "warning")) {
    console.warn(
      `[env] Mode développement: certaines variables de production sont manquantes. L'app fonctionnera en mode dégradé/démo.`,
    );
  }

  return result;
}

export { ENV_SCHEMA };
