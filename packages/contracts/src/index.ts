import { z } from 'zod';

export const roleSchema = z.enum(['owner', 'admin', 'viewer']);
export type Role = z.infer<typeof roleSchema>;
export const identifierSchema = z.uuid();
export const nameSchema = z.string().trim().min(1).max(80);
export const passwordSchema = z.string().min(12).max(128);
export const emailSchema = z.email().trim().toLowerCase();
export const timezoneSchema = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Use a valid IANA timezone');

export const createWorkspaceSchema = z.object({ name: nameSchema }).strict();
export const createProjectSchema = z
  .object({ name: nameSchema, timezone: timezoneSchema.default('UTC') })
  .strict();
export const updateProjectSchema = z
  .object({ name: nameSchema, timezone: timezoneSchema })
  .strict();
export const setupSchema = z
  .object({
    token: z.string().min(32).max(256),
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    workspaceName: nameSchema,
  })
  .strict();
export const invitationSchema = z
  .object({ email: emailSchema, role: z.enum(['admin', 'viewer']) })
  .strict();
export const acceptInvitationSchema = z
  .object({
    token: z.string().min(32).max(256),
    name: nameSchema,
    password: passwordSchema.optional(),
  })
  .strict();
export const changeRoleSchema = z.object({ role: roleSchema }).strict();
export const paginationSchema = z
  .object({
    cursor: identifierSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export interface Workspace {
  id: string;
  name: string;
  role: Role;
  createdAt: string;
}
export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  timezone: string;
  keyPrefix: string;
  createdAt: string;
}
export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
}
export interface Invitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}

export function canManageProjects(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

export * from './events.js';
