-- Policy.scope_id is polymorphic: it holds a tenant id (TENANT scope), a
-- department id (DEPARTMENT scope), or a functional_role id (ROLE scope),
-- resolved ROLE > DEPARTMENT > TENANT. The original schema constrained it with
-- a blanket FK to Department, which made TENANT- and ROLE-scoped rows
-- un-insertable and turned the app's own tenant/role policy lookup into dead
-- code. Drop that FK (expand-contract: constraint-only drop, column unchanged).
ALTER TABLE "Policy" DROP CONSTRAINT IF EXISTS "Policy_scope_id_fkey_dept";
