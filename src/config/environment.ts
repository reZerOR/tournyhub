import { z } from "zod";

const httpUrl = z.url().refine((value) => /^https?:\/\//i.test(value), {
  message: "must use http or https",
});

const environmentSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  DATABASE_URL: z
    .url()
    .refine((value) => /^postgres(?:ql)?:\/\//i.test(value), {
      message: "must be a PostgreSQL connection URL",
    }),
  EMAIL_FROM: z.string().min(1, "is required").optional(),
  NEXT_PUBLIC_APP_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "is required"),
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  SMTP_HOST: z.string().min(1, "is required").optional(),
  SMTP_PASSWORD: z.string().min(1, "is required").optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1, "is required").optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "is required"),
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
