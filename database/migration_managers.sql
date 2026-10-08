-- ==============================================================================
-- OWNERDESK - MANAGERS MIGRATION SCRIPT
-- Run this script in the Supabase SQL Editor to enable the Managers table & relations
-- ==============================================================================

-- 1. CREATE MANAGERS TABLE
CREATE TABLE IF NOT EXISTS public.managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    manager_id_code TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    mobile TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Disabled')),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_owner_manager_code UNIQUE (owner_id, manager_id_code),
    CONSTRAINT unique_owner_manager_email UNIQUE (owner_id, email)
);

-- Trigger to auto-update managers.updated_at
DROP TRIGGER IF EXISTS trigger_managers_updated_at ON public.managers;
CREATE TRIGGER trigger_managers_updated_at
    BEFORE UPDATE ON public.managers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 2. LINK BRANCHES TO MANAGERS
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.managers(id) ON DELETE SET NULL;

-- 3. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_managers_owner_id ON public.managers(owner_id);
CREATE INDEX IF NOT EXISTS idx_managers_status ON public.managers(status);
CREATE INDEX IF NOT EXISTS idx_managers_auth_user_id ON public.managers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_branches_manager_id ON public.branches(manager_id);

-- 4. ROW LEVEL SECURITY (RLS) FOR MANAGERS
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage their own managers" ON public.managers;
CREATE POLICY "Owners can manage their own managers"
    ON public.managers FOR ALL
    USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Managers can view their own record" ON public.managers;
CREATE POLICY "Managers can view their own record"
    ON public.managers FOR SELECT
    USING (auth.uid() = auth_user_id);

-- 5. UPDATE BRANCH POLICIES TO ALLOW ASSIGNED MANAGERS ACCESS
DROP POLICY IF EXISTS "Owners and assigned managers can view branches" ON public.branches;
CREATE POLICY "Owners and assigned managers can view branches"
    ON public.branches FOR SELECT
    USING (
        auth.uid() = owner_id 
        OR manager_id IN (SELECT id FROM public.managers WHERE auth_user_id = auth.uid())
        OR manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    );
