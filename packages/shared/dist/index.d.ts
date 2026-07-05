export declare enum SystemRole {
    EMPLOYEE = "EMPLOYEE",
    MANAGER = "MANAGER",
    PM_ADMIN = "PM_ADMIN",
    HR = "HR",
    CTO = "CTO",
    SUPER_ADMIN = "SUPER_ADMIN"
}
export declare enum ProjectStatus {
    ACTIVE = "ACTIVE",
    ARCHIVED = "ARCHIVED"
}
export declare enum TaskPriority {
    CRITICAL = "CRITICAL",
    HIGH = "HIGH",
    MEDIUM = "MEDIUM",
    LOW = "LOW"
}
export declare enum TaskStatus {
    NOT_STARTED = "NOT_STARTED",
    IN_PROGRESS = "IN_PROGRESS",
    DONE = "DONE",
    BLOCKED = "BLOCKED",
    DEFERRED = "DEFERRED",
    CANCELLED = "CANCELLED"
}
export declare enum RiskLevel {
    HIGH = "HIGH",
    MEDIUM = "MEDIUM",
    LOW = "LOW"
}
export declare enum EvidenceKind {
    LINK = "LINK",
    FILE = "FILE"
}
export declare enum CheckinType {
    IN = "IN",
    OUT = "OUT"
}
export declare enum WorkStatus {
    WFH = "WFH",
    WFO = "WFO",
    ONSITE = "ONSITE"
}
export declare enum CheckinMode {
    TWICE = "TWICE",
    ONCE = "ONCE"
}
export declare enum EmploymentStatus {
    AKTIF = "AKTIF",
    NONAKTIF = "NONAKTIF"
}
export declare enum LeaveType {
    CUTI = "CUTI",
    IZIN = "IZIN",
    SAKIT = "SAKIT",
    LEMBUR = "LEMBUR",
    WFH_EXTRA = "WFH_EXTRA",
    TUKAR_WFO = "TUKAR_WFO"
}
export declare enum LeaveStatus {
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED",
    CANCELLED = "CANCELLED",
    AUTO_APPROVED = "AUTO_APPROVED"
}
export declare enum PolicyScopeType {
    TENANT = "TENANT",
    DEPARTMENT = "DEPARTMENT",
    ROLE = "ROLE"
}
export declare enum LocationType {
    OFFICE = "OFFICE",
    CLIENT = "CLIENT"
}
export declare enum KPIPeriod {
    MONTHLY = "MONTHLY",
    QUARTERLY = "QUARTERLY",
    ANNUALLY = "ANNUALLY"
}
export declare enum RiskProbability {
    HIGH = "HIGH",
    MEDIUM = "MEDIUM",
    LOW = "LOW"
}
export declare enum RiskImpact {
    HIGH = "HIGH",
    MEDIUM = "MEDIUM",
    LOW = "LOW"
}
export declare enum RiskStatus {
    OPEN = "OPEN",
    MITIGATED = "MITIGATED",
    CLOSED = "CLOSED",
    ACCEPTED = "ACCEPTED"
}
export declare enum GateDecisionStatus {
    GO = "GO",
    NO_GO = "NO_GO",
    CONDITIONAL = "CONDITIONAL"
}
export declare enum ScorecardPeriodType {
    SPRINT = "SPRINT",
    MONTH = "MONTH"
}
export declare enum RAGStatus {
    GREEN = "GREEN",
    YELLOW = "YELLOW",
    RED = "RED",
    BLACK = "BLACK"
}
export declare enum NotificationKind {
    MENTION = "MENTION",
    APPROVAL_IN = "APPROVAL_IN",
    APPROVAL_DECIDED = "APPROVAL_DECIDED",
    REMINDER_CHECKIN = "REMINDER_CHECKIN",
    REMINDER_CHECKOUT = "REMINDER_CHECKOUT",
    TASK_ASSIGNED = "TASK_ASSIGNED",
    ESCALATION = "ESCALATION"
}
export declare enum BlockerStatus {
    OPEN = "OPEN",
    RESOLVED = "RESOLVED"
}
