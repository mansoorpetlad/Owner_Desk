-- ==============================================================================
-- OWNERDESK - SUPABASE POSTGRESQL SCHEMA & ROW LEVEL SECURITY (RLS)
-- Multi-Outlet Restaurant Chain Management Platform
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUM & HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 3. PROFILES TABLE (Linked with Supabase auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'staff')),
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to auto-sync profiles.updated_at
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically confirm email addresses (no email verification required)
CREATE OR REPLACE FUNCTION public.auto_confirm_new_user()
RETURNS TRIGGER AS $$
BEGIN
    NEW.email_confirmed_at = COALESCE(NEW.email_confirmed_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_auto_confirm
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_new_user();

-- Auto-confirm any existing users who might have unconfirmed emails
UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;

-- Function & Trigger to automatically create a profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'role', 'owner')
    )
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ------------------------------------------------------------------------------
-- 3.5. MANAGERS TABLE (Branch Managers created by Owners)
-- ------------------------------------------------------------------------------
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

DROP TRIGGER IF EXISTS trigger_managers_updated_at ON public.managers;
CREATE TRIGGER trigger_managers_updated_at
    BEFORE UPDATE ON public.managers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 4. BRANCHES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    manager_id UUID REFERENCES public.managers(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    address TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    manager_name TEXT,
    manager_email TEXT,
    manager_phone TEXT,
    monthly_target NUMERIC(12, 2) NOT NULL DEFAULT 0,
    opening_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Under-performing', 'Out of Stock', 'Inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trigger_branches_updated_at ON public.branches;
CREATE TRIGGER trigger_branches_updated_at
    BEFORE UPDATE ON public.branches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 5. SALES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sale_date DATE NOT NULL,
    total_orders INTEGER NOT NULL DEFAULT 0,
    gross_sales NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discounts NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
    net_sales NUMERIC(12, 2) NOT NULL DEFAULT 0,
    cash_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    card_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    upi_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_branch_sale_date UNIQUE (branch_id, sale_date)
);

DROP TRIGGER IF EXISTS trigger_sales_updated_at ON public.sales;
CREATE TRIGGER trigger_sales_updated_at
    BEFORE UPDATE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 6. EXPENSES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    expense_date DATE NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'Food Supplies', 'Salaries', 'Utilities', 'Maintenance',
        'Rent', 'Transportation', 'Marketing', 'Other'
    )),
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    description TEXT,
    payment_method TEXT NOT NULL DEFAULT 'UPI' CHECK (payment_method IN ('Cash', 'Card', 'UPI', 'Bank Transfer', 'Other')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trigger_expenses_updated_at ON public.expenses;
CREATE TRIGGER trigger_expenses_updated_at
    BEFORE UPDATE ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 7. INVENTORY TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL,
    current_quantity NUMERIC(10, 2) NOT NULL DEFAULT 0,
    unit TEXT NOT NULL,
    minimum_quantity NUMERIC(10, 2) NOT NULL DEFAULT 0,
    cost_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0,
    supplier TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trigger_inventory_updated_at ON public.inventory;
CREATE TRIGGER trigger_inventory_updated_at
    BEFORE UPDATE ON public.inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 8. DAILY REPORTS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    report_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Reviewed', 'Pending')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_branch_report_date UNIQUE (branch_id, report_date)
);

DROP TRIGGER IF EXISTS trigger_daily_reports_updated_at ON public.daily_reports;
CREATE TRIGGER trigger_daily_reports_updated_at
    BEFORE UPDATE ON public.daily_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 9. NOTIFICATIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Low Inventory', 'Out of Stock', 'Revenue Target', 'Missing Daily Report', 'Branch Performance', 'System')),
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical', 'success')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 10. INDEXES FOR HIGH-PERFORMANCE QUERIES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_branches_owner_id ON public.branches(owner_id);
CREATE INDEX IF NOT EXISTS idx_branches_status ON public.branches(status);
CREATE INDEX IF NOT EXISTS idx_sales_branch_id ON public.sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON public.expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_inventory_branch_id ON public.inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_daily_reports_branch_id ON public.daily_reports(branch_id);

-- ------------------------------------------------------------------------------
-- 11. INVENTORY ALERT TRIGGER (Automatic notifications on low/out-of-stock)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_inventory_alert()
RETURNS TRIGGER AS $$
DECLARE
    branch_owner UUID;
    branch_rec RECORD;
    alert_title TEXT;
    alert_msg TEXT;
    alert_type TEXT;
    alert_sev TEXT;
    existing_count INTEGER;
BEGIN
    SELECT owner_id, name INTO branch_rec FROM public.branches WHERE id = NEW.branch_id;
    branch_owner := branch_rec.owner_id;

    IF NEW.current_quantity = 0 THEN
        alert_title := 'Out of Stock: ' || NEW.item_name;
        alert_msg := NEW.item_name || ' is completely out of stock at ' || branch_rec.name || '.';
        alert_type := 'Out of Stock';
        alert_sev := 'critical';
    ELSIF NEW.current_quantity <= NEW.minimum_quantity THEN
        alert_title := 'Low Inventory: ' || NEW.item_name;
        alert_msg := NEW.item_name || ' stock is running low (' || NEW.current_quantity || ' ' || NEW.unit || ' remaining) at ' || branch_rec.name || '.';
        alert_type := 'Low Inventory';
        alert_sev := 'warning';
    ELSE
        RETURN NEW;
    END IF;

    -- Avoid creating duplicate unread notifications for the same item at the same branch
    SELECT COUNT(*) INTO existing_count
    FROM public.notifications
    WHERE user_id = branch_owner
      AND branch_id = NEW.branch_id
      AND title = alert_title
      AND is_read = FALSE;

    IF existing_count = 0 AND branch_owner IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, branch_id, title, message, type, severity, is_read)
        VALUES (branch_owner, NEW.branch_id, alert_title, alert_msg, alert_type, alert_sev, FALSE);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_inventory_alert ON public.inventory;
CREATE TRIGGER trigger_inventory_alert
    AFTER INSERT OR UPDATE OF current_quantity, minimum_quantity ON public.inventory
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_inventory_alert();

-- ------------------------------------------------------------------------------
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- PROFILES Policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- BRANCHES Policies
DROP POLICY IF EXISTS "Owners can view their own branches" ON public.branches;
CREATE POLICY "Owners can view their own branches"
    ON public.branches FOR SELECT
    USING (
        auth.uid() = owner_id 
        OR manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Owners can insert their own branches" ON public.branches;
CREATE POLICY "Owners can insert their own branches"
    ON public.branches FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update their own branches" ON public.branches;
CREATE POLICY "Owners can update their own branches"
    ON public.branches FOR UPDATE
    USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete their own branches" ON public.branches;
CREATE POLICY "Owners can delete their own branches"
    ON public.branches FOR DELETE
    USING (auth.uid() = owner_id);

-- SALES Policies
DROP POLICY IF EXISTS "Branch members and owners can view sales" ON public.sales;
CREATE POLICY "Branch members and owners can view sales"
    ON public.sales FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = sales.branch_id
            AND (b.owner_id = auth.uid() OR b.manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS "Branch members and owners can insert sales" ON public.sales;
CREATE POLICY "Branch members and owners can insert sales"
    ON public.sales FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = sales.branch_id
            AND (b.owner_id = auth.uid() OR b.manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS "Owners and managers can update sales" ON public.sales;
CREATE POLICY "Owners and managers can update sales"
    ON public.sales FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = sales.branch_id
            AND (b.owner_id = auth.uid() OR b.manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS "Owners can delete sales" ON public.sales;
CREATE POLICY "Owners can delete sales"
    ON public.sales FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = sales.branch_id
            AND b.owner_id = auth.uid()
        )
    );

-- EXPENSES Policies
DROP POLICY IF EXISTS "Branch members and owners can view expenses" ON public.expenses;
CREATE POLICY "Branch members and owners can view expenses"
    ON public.expenses FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = expenses.branch_id
            AND (b.owner_id = auth.uid() OR b.manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS "Branch members and owners can insert expenses" ON public.expenses;
CREATE POLICY "Branch members and owners can insert expenses"
    ON public.expenses FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = expenses.branch_id
            AND (b.owner_id = auth.uid() OR b.manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS "Owners and managers can update expenses" ON public.expenses;
CREATE POLICY "Owners and managers can update expenses"
    ON public.expenses FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = expenses.branch_id
            AND (b.owner_id = auth.uid() OR b.manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS "Owners can delete expenses" ON public.expenses;
CREATE POLICY "Owners can delete expenses"
    ON public.expenses FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = expenses.branch_id
            AND b.owner_id = auth.uid()
        )
    );

-- INVENTORY Policies
DROP POLICY IF EXISTS "Branch members and owners can view inventory" ON public.inventory;
CREATE POLICY "Branch members and owners can view inventory"
    ON public.inventory FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = inventory.branch_id
            AND (b.owner_id = auth.uid() OR b.manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS "Branch members and owners can insert/update inventory" ON public.inventory;
CREATE POLICY "Branch members and owners can insert/update inventory"
    ON public.inventory FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = inventory.branch_id
            AND (b.owner_id = auth.uid() OR b.manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
        )
    );

-- DAILY REPORTS Policies
DROP POLICY IF EXISTS "Branch members and owners can view and submit daily reports" ON public.daily_reports;
CREATE POLICY "Branch members and owners can view and submit daily reports"
    ON public.daily_reports FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = daily_reports.branch_id
            AND (b.owner_id = auth.uid() OR b.manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid()))
        )
    );

-- NOTIFICATIONS Policies
DROP POLICY IF EXISTS "Users can view and update their own notifications" ON public.notifications;
CREATE POLICY "Users can view and update their own notifications"
    ON public.notifications FOR ALL
    USING (auth.uid() = user_id);
