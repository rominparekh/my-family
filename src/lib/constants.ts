// Content limits enforced everywhere content is generated or accepted.
export const CONTENT_LIMITS = {
  TEXT_MAX_CHARS: 300,
  PHOTO_MAX_COUNT: 3,
  VIDEO_MAX_SECONDS: 30,
} as const;

export const RELATION_TYPES = [
  "spouse",
  "partner",
  "child",
  "parent",
  "sibling",
  "grandparent",
  "grandchild",
  "friend",
  "colleague",
  "other",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const SPECIAL_DAY_TYPES = [
  "birthday",
  "anniversary",
  "custom",
] as const;
export type SpecialDayType = (typeof SPECIAL_DAY_TYPES)[number];

export const CONTENT_KINDS = ["text", "photo", "video"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const DRAFT_STATUSES = [
  "draft",
  "pending_approval",
  "changes_requested",
  "approved",
  "scheduled",
  "sent",
  "failed",
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

// How many times we'll regenerate based on user feedback before giving up.
export const MAX_REVISION_ROUNDS = 4;
