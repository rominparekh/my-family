import { z } from "zod";
import { RELATION_TYPES, SPECIAL_DAY_TYPES, CONTENT_KINDS } from "@/lib/constants";

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
