"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockerStatus = exports.NotificationKind = exports.RAGStatus = exports.ScorecardPeriodType = exports.GateDecisionStatus = exports.RiskStatus = exports.RiskImpact = exports.RiskProbability = exports.KPIPeriod = exports.LocationType = exports.PolicyScopeType = exports.LeaveStatus = exports.LeaveType = exports.EmploymentStatus = exports.CheckinMode = exports.WorkStatus = exports.CheckinType = exports.EvidenceKind = exports.RiskLevel = exports.TaskStatus = exports.TaskPriority = exports.ProjectStatus = exports.SystemRole = void 0;
var SystemRole;
(function (SystemRole) {
    SystemRole["EMPLOYEE"] = "EMPLOYEE";
    SystemRole["MANAGER"] = "MANAGER";
    SystemRole["PM_ADMIN"] = "PM_ADMIN";
    SystemRole["HR"] = "HR";
    SystemRole["CTO"] = "CTO";
    SystemRole["SUPER_ADMIN"] = "SUPER_ADMIN";
})(SystemRole || (exports.SystemRole = SystemRole = {}));
var ProjectStatus;
(function (ProjectStatus) {
    ProjectStatus["ACTIVE"] = "ACTIVE";
    ProjectStatus["ARCHIVED"] = "ARCHIVED";
})(ProjectStatus || (exports.ProjectStatus = ProjectStatus = {}));
var TaskPriority;
(function (TaskPriority) {
    TaskPriority["CRITICAL"] = "CRITICAL";
    TaskPriority["HIGH"] = "HIGH";
    TaskPriority["MEDIUM"] = "MEDIUM";
    TaskPriority["LOW"] = "LOW";
})(TaskPriority || (exports.TaskPriority = TaskPriority = {}));
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["NOT_STARTED"] = "NOT_STARTED";
    TaskStatus["IN_PROGRESS"] = "IN_PROGRESS";
    TaskStatus["DONE"] = "DONE";
    TaskStatus["BLOCKED"] = "BLOCKED";
    TaskStatus["DEFERRED"] = "DEFERRED";
    TaskStatus["CANCELLED"] = "CANCELLED";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
var RiskLevel;
(function (RiskLevel) {
    RiskLevel["HIGH"] = "HIGH";
    RiskLevel["MEDIUM"] = "MEDIUM";
    RiskLevel["LOW"] = "LOW";
})(RiskLevel || (exports.RiskLevel = RiskLevel = {}));
var EvidenceKind;
(function (EvidenceKind) {
    EvidenceKind["LINK"] = "LINK";
    EvidenceKind["FILE"] = "FILE";
})(EvidenceKind || (exports.EvidenceKind = EvidenceKind = {}));
var CheckinType;
(function (CheckinType) {
    CheckinType["IN"] = "IN";
    CheckinType["OUT"] = "OUT";
})(CheckinType || (exports.CheckinType = CheckinType = {}));
var WorkStatus;
(function (WorkStatus) {
    WorkStatus["WFH"] = "WFH";
    WorkStatus["WFO"] = "WFO";
    WorkStatus["ONSITE"] = "ONSITE";
})(WorkStatus || (exports.WorkStatus = WorkStatus = {}));
var CheckinMode;
(function (CheckinMode) {
    CheckinMode["TWICE"] = "TWICE";
    CheckinMode["ONCE"] = "ONCE";
})(CheckinMode || (exports.CheckinMode = CheckinMode = {}));
var EmploymentStatus;
(function (EmploymentStatus) {
    EmploymentStatus["AKTIF"] = "AKTIF";
    EmploymentStatus["NONAKTIF"] = "NONAKTIF";
})(EmploymentStatus || (exports.EmploymentStatus = EmploymentStatus = {}));
var LeaveType;
(function (LeaveType) {
    LeaveType["CUTI"] = "CUTI";
    LeaveType["IZIN"] = "IZIN";
    LeaveType["SAKIT"] = "SAKIT";
    LeaveType["LEMBUR"] = "LEMBUR";
    LeaveType["WFH_EXTRA"] = "WFH_EXTRA";
    LeaveType["TUKAR_WFO"] = "TUKAR_WFO";
})(LeaveType || (exports.LeaveType = LeaveType = {}));
var LeaveStatus;
(function (LeaveStatus) {
    LeaveStatus["PENDING"] = "PENDING";
    LeaveStatus["APPROVED"] = "APPROVED";
    LeaveStatus["REJECTED"] = "REJECTED";
    LeaveStatus["CANCELLED"] = "CANCELLED";
    LeaveStatus["AUTO_APPROVED"] = "AUTO_APPROVED";
})(LeaveStatus || (exports.LeaveStatus = LeaveStatus = {}));
var PolicyScopeType;
(function (PolicyScopeType) {
    PolicyScopeType["TENANT"] = "TENANT";
    PolicyScopeType["DEPARTMENT"] = "DEPARTMENT";
    PolicyScopeType["ROLE"] = "ROLE";
})(PolicyScopeType || (exports.PolicyScopeType = PolicyScopeType = {}));
var LocationType;
(function (LocationType) {
    LocationType["OFFICE"] = "OFFICE";
    LocationType["CLIENT"] = "CLIENT";
})(LocationType || (exports.LocationType = LocationType = {}));
var KPIPeriod;
(function (KPIPeriod) {
    KPIPeriod["MONTHLY"] = "MONTHLY";
    KPIPeriod["QUARTERLY"] = "QUARTERLY";
    KPIPeriod["ANNUALLY"] = "ANNUALLY";
})(KPIPeriod || (exports.KPIPeriod = KPIPeriod = {}));
var RiskProbability;
(function (RiskProbability) {
    RiskProbability["HIGH"] = "HIGH";
    RiskProbability["MEDIUM"] = "MEDIUM";
    RiskProbability["LOW"] = "LOW";
})(RiskProbability || (exports.RiskProbability = RiskProbability = {}));
var RiskImpact;
(function (RiskImpact) {
    RiskImpact["HIGH"] = "HIGH";
    RiskImpact["MEDIUM"] = "MEDIUM";
    RiskImpact["LOW"] = "LOW";
})(RiskImpact || (exports.RiskImpact = RiskImpact = {}));
var RiskStatus;
(function (RiskStatus) {
    RiskStatus["OPEN"] = "OPEN";
    RiskStatus["MITIGATED"] = "MITIGATED";
    RiskStatus["CLOSED"] = "CLOSED";
    RiskStatus["ACCEPTED"] = "ACCEPTED";
})(RiskStatus || (exports.RiskStatus = RiskStatus = {}));
var GateDecisionStatus;
(function (GateDecisionStatus) {
    GateDecisionStatus["GO"] = "GO";
    GateDecisionStatus["NO_GO"] = "NO_GO";
    GateDecisionStatus["CONDITIONAL"] = "CONDITIONAL";
})(GateDecisionStatus || (exports.GateDecisionStatus = GateDecisionStatus = {}));
var ScorecardPeriodType;
(function (ScorecardPeriodType) {
    ScorecardPeriodType["SPRINT"] = "SPRINT";
    ScorecardPeriodType["MONTH"] = "MONTH";
})(ScorecardPeriodType || (exports.ScorecardPeriodType = ScorecardPeriodType = {}));
var RAGStatus;
(function (RAGStatus) {
    RAGStatus["GREEN"] = "GREEN";
    RAGStatus["YELLOW"] = "YELLOW";
    RAGStatus["RED"] = "RED";
    RAGStatus["BLACK"] = "BLACK";
})(RAGStatus || (exports.RAGStatus = RAGStatus = {}));
var NotificationKind;
(function (NotificationKind) {
    NotificationKind["MENTION"] = "MENTION";
    NotificationKind["APPROVAL_IN"] = "APPROVAL_IN";
    NotificationKind["APPROVAL_DECIDED"] = "APPROVAL_DECIDED";
    NotificationKind["REMINDER_CHECKIN"] = "REMINDER_CHECKIN";
    NotificationKind["REMINDER_CHECKOUT"] = "REMINDER_CHECKOUT";
    NotificationKind["TASK_ASSIGNED"] = "TASK_ASSIGNED";
    NotificationKind["ESCALATION"] = "ESCALATION";
})(NotificationKind || (exports.NotificationKind = NotificationKind = {}));
var BlockerStatus;
(function (BlockerStatus) {
    BlockerStatus["OPEN"] = "OPEN";
    BlockerStatus["RESOLVED"] = "RESOLVED";
})(BlockerStatus || (exports.BlockerStatus = BlockerStatus = {}));
