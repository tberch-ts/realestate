// Firestore document shapes + typed collection refs for the SmartInvestorCRM
// dashboard. Every doc carries `ownerId` (set once at creation, never
// changed) so firestore.rules can enforce per-user isolation — this matches
// the field name used by the original production Firestore schema (verified
// directly against the deployed rules/indexes, not guessed).

// Stored at users/{uid} — created at sign-up (see SignUp.tsx), extended here
// with the PostGrid sender/return address used on outgoing postal mail.
export interface PostgridSender {
  companyName?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  stateCode?: string
  zip?: string
}

export interface UserProfile {
  uid?: string
  email?: string
  displayName?: string
  createdAt?: unknown
  postgridSender?: PostgridSender
}

export const DEAL_STATUSES = ['sourcing', 'loi', 'due_diligence', 'financing', 'closing', 'closed'] as const
export type DealStatus = (typeof DEAL_STATUSES)[number]

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  sourcing: 'Sourcing',
  loi: 'LOI',
  due_diligence: 'Due Diligence',
  financing: 'Financing',
  closing: 'Closing',
  closed: 'Closed',
}

export interface Deal {
  id: string
  ownerId: string
  // Other signed-in users who can view/edit (not delete) this deal. Schema-
  // compatible with the real app's team-sharing model; no invite UI exists
  // yet to actually populate this beyond an empty array.
  members?: string[]
  address: string
  units?: number
  price?: number
  capRate?: number
  status: DealStatus
  notes?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export const CAPITAL_RAISE_STATUSES = ['planning', 'open', 'funded', 'closed'] as const
export type CapitalRaiseStatus = (typeof CAPITAL_RAISE_STATUSES)[number]

export const CAPITAL_RAISE_STATUS_LABELS: Record<CapitalRaiseStatus, string> = {
  planning: 'Planning',
  open: 'Open',
  funded: 'Funded',
  closed: 'Closed',
}

// Stored at capital_raises/{raiseId}. Tracks an equity raise (from LPs) for a
// deal — separate from `Deal` since not every deal needs outside capital, and
// a raise can span/outlive a single deal's own status field. Same ownerId +
// members team-sharing pattern as deals/lois (see firestore.rules).
export interface CapitalRaise {
  id: string
  ownerId: string
  members?: string[]
  dealName: string
  address?: string
  targetAmount?: number
  raisedAmount?: number
  minInvestment?: number
  status: CapitalRaiseStatus
  targetCloseDate?: string
  notes?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export const LP_STAGES = ['verbal', 'soft_commit', 'signed', 'funded'] as const
export type LpStage = (typeof LP_STAGES)[number]

export const LP_STAGE_LABELS: Record<LpStage, string> = {
  verbal: 'Verbal',
  soft_commit: 'Soft commit',
  signed: 'Signed',
  funded: 'Funded',
}

// Stored at capital_raises/{raiseId}/lp_commitments/{lpId}. ownerId is
// denormalized from the parent raise so firestore.rules can check it
// directly without a get() lookup (same pattern as contacts/{id}/interactions).
export interface LpCommitment {
  id: string
  ownerId: string
  raiseId: string
  investorName: string
  committedAmount?: number
  stage: LpStage
  notes?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export const CONTACT_KINDS = ['broker', 'seller', 'investor', 'firm', 'other'] as const
export type ContactKind = (typeof CONTACT_KINDS)[number]

export interface Contact {
  id: string
  ownerId: string
  name: string
  kind: ContactKind
  firmName?: string
  email?: string
  phone?: string
  // Mailing address — required before a postal letter can be sent.
  addressLine1?: string
  addressLine2?: string
  city?: string
  stateCode?: string
  zip?: string
  notes?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export const INTERACTION_KINDS = ['call', 'email', 'meeting', 'note', 'outreach_sent', 'reply_received'] as const
export type InteractionKind = (typeof INTERACTION_KINDS)[number]

export const INTERACTION_KIND_LABELS: Record<InteractionKind, string> = {
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  note: 'Note',
  outreach_sent: 'Outreach sent',
  reply_received: 'Reply received',
}

// Stored at contacts/{contactId}/interactions/{id}. ownerId is denormalized
// (not just inherited from the parent contact) so firestore.rules can check
// ownership directly on the subcollection doc.
export interface Interaction {
  id: string
  ownerId: string
  kind: InteractionKind
  subject?: string
  body?: string
  occurredAt?: unknown
  createdAt?: unknown
}

// Mirrors packages/shared's LoiInput + the subset of DealInput actually used
// by apps/api's renderLoiPdf, flattened into one Firestore doc rather than
// nested — apps/crm assembles the DealInput/LoiInput shapes at call time
// when hitting /api/loi or /api/postgrid/letters/inline.
export interface Loi {
  id: string
  ownerId: string
  members?: string[]

  // Deal-level (subset renderLoiPdf actually reads)
  address: string
  dealName?: string
  assetClass?: 'A' | 'B' | 'C' | 'D' | 'unknown'
  purchasePrice?: number
  units?: number

  // Parties
  buyerEntity?: string
  buyerContact?: string
  buyerAddress?: string
  buyerEmail?: string
  buyerPhone?: string
  sellerEntity?: string
  sellerContact?: string
  sellerAddress?: string

  // Deal terms
  effectiveDate?: string
  expirationDate?: string
  closingDays?: number
  inspectionDays?: number
  financingDays?: number
  earnestMoney?: number
  additionalDeposit?: number
  earnestMoneyRefundable?: boolean
  assignmentRights?: boolean
  financingContingency?: boolean
  inspectionContingency?: boolean
  titleReviewDays?: number
  ddMaterials?: string[]
  specialTerms?: string
  brokerFee?: string

  // Optional link to a contact — if set, a mailed letter also logs an
  // interaction on that contact's timeline.
  contactId?: string

  // PostGrid mail tracking (set after a successful send)
  postgridLetterId?: string
  postgridStatus?: string
  mailedAt?: unknown

  notes?: string
  createdAt?: unknown
  updatedAt?: unknown
}
