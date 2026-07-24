import { z } from 'zod';

export const userRoleSchema = z.enum([
  'ADMINISTRATOR',
  'MANAGER',
  'OPERATOR',
  'VIEWER',
]);

export type UserRole = z.infer<typeof userRoleSchema>;

export const loginRequestSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(128),
});

export const setupAdminSchema = z
  .object({
    username: z.string().trim().min(3).max(64),
    password: z.string().min(12).max(128),
    confirmPassword: z.string().min(12).max(128),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords must match.',
      });
    }
  });

export const protectConnectionSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(443),
  username: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(255),
  allowSelfSignedCertificate: z.boolean().default(true),
});

export const farmProfileSchema = z.object({
  farmName: z.string().trim().min(2).max(120),
  owner: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(2).max(80),
  location: z.string().trim().min(2).max(120),
  logoUrl: z.string().trim().url().optional().or(z.literal('')),
});

export const dashboardPreferencesSchema = z.object({
  themeMode: z.enum(['light', 'dark']).default('dark'),
  defaultLayout: z.enum(['operations', 'overview', 'alerts']).default('operations'),
});

export const setupCompletionSchema = z.object({
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  setupComplete: z.boolean(),
});

export const bootstrapStateSchema = z.object({
  productName: z.literal('Protect Broker'),
  phase: z.literal('phase-1'),
  setupComplete: z.boolean(),
  administratorCreated: z.boolean(),
  protectConfigured: z.boolean(),
  farmConfigured: z.boolean(),
  dashboardConfigured: z.boolean(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type SetupAdminInput = z.infer<typeof setupAdminSchema>;
export type ProtectConnectionInput = z.infer<typeof protectConnectionSchema>;
export type FarmProfileInput = z.infer<typeof farmProfileSchema>;
export type DashboardPreferencesInput = z.infer<typeof dashboardPreferencesSchema>;
export type BootstrapState = z.infer<typeof bootstrapStateSchema>;
