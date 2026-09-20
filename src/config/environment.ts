import { z } from "zod";

const httpUrl = z.url().refine((value) => /^https?:\/\//i.test(value), {
  message: "must use http or https",
});

const environmentSchema = z
  .object({
    APP_ENVIRONMENT: z
      .enum(["development", "preview", "production"])
      .optional(),
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    DATABASE_URL: z
      .url()
      .refine((value) => /^postgres(?:ql)?:\/\//i.test(value), {
        message: "must be a PostgreSQL connection URL",
      }),
    EMAIL_FROM: z.string().min(1, "is required").optional(),
    GOOGLE_CLIENT_ID: z.string().min(1, "is required").optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1, "is required").optional(),
    NEXT_PUBLIC_APP_URL: httpUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "is required"),
    NEXT_PUBLIC_SUPABASE_URL: httpUrl,
    PLATFORM_ADMIN_BOOTSTRAP_EMAIL: z
      .email("must be an email address")
      .optional(),
    PRODUCTION_DATABASE_URL: z
      .url("must be a PostgreSQL connection URL")
      .refine((value) => /^postgres(?:ql)?:\/\//i.test(value), {
        message: "must be a PostgreSQL connection URL",
      })
      .optional(),
    SMTP_HOST: z.string().min(1, "is required").optional(),
    SMTP_PASSWORD: z.string().min(1, "is required").optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().min(1, "is required").optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "is required"),
  })
  .superRefine((environment, context) => {
    const hasGoogleClientId = Boolean(environment.GOOGLE_CLIENT_ID);
    const hasGoogleClientSecret = Boolean(environment.GOOGLE_CLIENT_SECRET);

    if (hasGoogleClientId !== hasGoogleClientSecret) {
      const missingKey = hasGoogleClientId
        ? "GOOGLE_CLIENT_SECRET"
        : "GOOGLE_CLIENT_ID";
      context.addIssue({
        code: "custom",
        message: "is required when Google sign-in is configured",
        path: [missingKey],
      });
    }

    // Development and Preview must never reach production data. Declaring the
    // production connection string makes that checkable without guessing.
    if (
      environment.APP_ENVIRONMENT === "preview" &&
      environment.PRODUCTION_DATABASE_URL &&
      environment.DATABASE_URL === environment.PRODUCTION_DATABASE_URL
    ) {
      context.addIssue({
        code: "custom",
        message:
          "is the production database. A Preview deployment must use its own.",
        path: ["DATABASE_URL"],
      });
    }

    // The administrator bootstrap value is a one-time credential and must not
    // be present on a Preview deployment.
    if (
      environment.APP_ENVIRONMENT === "preview" &&
      environment.PLATFORM_ADMIN_BOOTSTRAP_EMAIL
    ) {
      context.addIssue({
        code: "custom",
        message:
          "must not be set on a Preview deployment. Provision administrators from the production environment only.",
        path: ["PLATFORM_ADMIN_BOOTSTRAP_EMAIL"],
      });
    }
  });

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(
  environment: Record<string, string | undefined>,
): AppEnvironment {
  const result = environmentSchema.safeParse(environment);

  if (result.success) {
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Invalid environment configuration:\n${details}\nCopy .env.example to .env.local and provide the missing values.`,
  );
}
