export enum SystemRole {
  EMPLOYEE = 'EMPLOYEE',
  MANAGER = 'MANAGER',
  PM_ADMIN = 'PM_ADMIN',
  HR = 'HR',
  CTO = 'CTO',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum TaskPriority {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum TaskStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  BLOCKED = 'BLOCKED',
  DEFERRED = 'DEFERRED',
  CANCELLED = 'CANCELLED',
}

export enum RiskLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum EvidenceKind {
  LINK = 'LINK',
  FILE = 'FILE',
}

export enum CheckinType {
  IN = 'IN',
  OUT = 'OUT',
}

export enum WorkStatus {
  WFH = 'WFH',
  WFO = 'WFO',
  ONSITE = 'ONSITE',
}

export enum CheckinMode {
  TWICE = 'TWICE',
  ONCE = 'ONCE',
}

export enum EmploymentStatus {
  AKTIF = 'AKTIF',
  NONAKTIF = 'NONAKTIF',
}

export enum LeaveType {
  CUTI = 'CUTI',
  IZIN = 'IZIN',
  SAKIT = 'SAKIT',
  LEMBUR = 'LEMBUR',
  WFH_EXTRA = 'WFH_EXTRA',
  TUKAR_WFO = 'TUKAR_WFO',
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  AUTO_APPROVED = 'AUTO_APPROVED',
}

export enum PolicyScopeType {
  TENANT = 'TENANT',
  DEPARTMENT = 'DEPARTMENT',
  ROLE = 'ROLE',
}

export enum LocationType {
  OFFICE = 'OFFICE',
  CLIENT = 'CLIENT',
}

export enum KPIPeriod {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUALLY = 'ANNUALLY',
}

export enum RiskProbability {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum RiskImpact {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum RiskStatus {
  OPEN = 'OPEN',
  MITIGATED = 'MITIGATED',
  CLOSED = 'CLOSED',
  ACCEPTED = 'ACCEPTED',
}

export enum GateDecisionStatus {
  GO = 'GO',
  NO_GO = 'NO_GO',
  CONDITIONAL = 'CONDITIONAL',
}

export enum ScorecardPeriodType {
  SPRINT = 'SPRINT',
  MONTH = 'MONTH',
}

export enum RAGStatus {
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
  RED = 'RED',
  BLACK = 'BLACK',
}

export enum NotificationKind {
  MENTION = 'MENTION',
  APPROVAL_IN = 'APPROVAL_IN',
  APPROVAL_DECIDED = 'APPROVAL_DECIDED',
  REMINDER_CHECKIN = 'REMINDER_CHECKIN',
  REMINDER_CHECKOUT = 'REMINDER_CHECKOUT',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  ESCALATION = 'ESCALATION',
}

export enum BlockerStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}
