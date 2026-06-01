import { z } from "zod";
import { RELATION_TYPES, SPECIAL_DAY_TYPES, CONTENT_KINDS } from "@/lib/constants";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(200);

export const registerInput = z.object({
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  displayName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});

export const loginInput = z.object({
  // Accept email (preferred) or a legacy username.
  identifier: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

export const forgotPasswordInput = z.object({ email: emailSchema });

export const resetPasswordInput = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const specialDayInput = z
  .object({
    type: z.enum(SPECIAL_DAY_TYPES),
    label: z.string().trim().max(80).optional(),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    year: z.number().int().min(1900).max(2100).optional(),
    recurring: z.boolean().default(true),
  })
  .refine((d) => d.type !== "custom" || (d.label && d.label.length > 0), {
    message: "Custom days need a label",
    path: ["label"],
  });

export const relationshipInput = z.object({
  relationType: z.enum(RELATION_TYPES),
});

export const createFriendInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
  notes: z.string().trim().max(4000).optional(),
  relationType: z.enum(RELATION_TYPES).optional(),
  specialDays: z.array(specialDayInput).max(20).optional(),
});

export const updateFriendInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  preferredContentKind: z.enum(CONTENT_KINDS).optional(),
});

export type CreateFriendInput = z.infer<typeof createFriendInput>;
export type UpdateFriendInput = z.infer<typeof updateFriendInput>;
