import { z } from "zod";

const httpUrl = z.url().refine((value) => /^https?:\/\//i.test(value), {
  message: "must use http or https",
});

const environmentSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine((value) => /^postgres(?:ql)?:\/\//i.test(value), {
      message: "must be a PostgreSQL connection URL",
    }),
  NEXT_PUBLIC_APP_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, "is required"),
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
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
