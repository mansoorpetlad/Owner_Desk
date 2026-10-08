-- ==============================================================================
-- OWNERDESK - OPTIONAL SEED DEMO DATA
-- Realistic Multi-Outlet Indian Restaurant Chain Data
-- ==============================================================================

-- INSTRUCTIONS:
-- 1. If you have signed up in the application, replace 'YOUR_USER_UUID_HERE' below
--    with your actual user ID from the Supabase auth.users or profiles table.
-- 2. Run this script in the Supabase SQL Editor.
-- 3. You can safely clear this seed data anytime by deleting the branches.

DO $$
DECLARE
    target_user_id UUID;
    b_pune_id UUID;
    b_nashik_id UUID;
    b_mumbai_id UUID;
    b_ahmedabad_id UUID;
    i INTEGER;
    curr_date DATE;
BEGIN
    -- Pick the first available profile, or a placeholder if running before signup
    SELECT id INTO target_user_id FROM public.profiles LIMIT 1;
    
    IF target_user_id IS NULL THEN
        RAISE NOTICE 'No profile found yet. Please sign up an account in OwnerDesk first, then run this seed script!';
        RETURN;
    END IF;

    RAISE NOTICE 'Seeding OwnerDesk data for user: %', target_user_id;

    -- 1. INSERT BRANCHES
    -- Branch 1: Pune Central
    INSERT INTO public.branches (
        owner_id, name, code, address, city, state, 
        manager_name, manager_email, manager_phone, monthly_target, opening_date, status
    ) VALUES (
        target_user_id, 'Pune Central', 'PUN-01', 'Shop 4-6, FC Road, Shivajinagar', 'Pune', 'Maharashtra',
        'Rohan Sharma', 'rohan.pune@ownerdesk.in', '+91 98220 12345', 1200000.00, '2023-01-15', 'Active'
    ) RETURNING id INTO b_pune_id;

    -- Branch 2: Nashik Road
    INSERT INTO public.branches (
        owner_id, name, code, address, city, state, 
        manager_name, manager_email, manager_phone, monthly_target, opening_date, status
    ) VALUES (
        target_user_id, 'Nashik Road', 'NSK-02', 'Plot 12, College Road, Gangapur', 'Nashik', 'Maharashtra',
        'Amit Patel', 'amit.nsk@ownerdesk.in', '+91 98221 23456', 850000.00, '2023-06-10', 'Under-performing'
    ) RETURNING id INTO b_nashik_id;

    -- Branch 3: Mumbai West
    INSERT INTO public.branches (
        owner_id, name, code, address, city, state, 
        manager_name, manager_email, manager_phone, monthly_target, opening_date, status
    ) VALUES (
        target_user_id, 'Mumbai West', 'MUM-03', 'Hill Road Junction, Bandra West', 'Mumbai', 'Maharashtra',
        'Priya Nair', 'priya.mum@ownerdesk.in', '+91 98222 34567', 1600000.00, '2022-11-20', 'Active'
    ) RETURNING id INTO b_mumbai_id;

    -- Branch 4: Ahmedabad Main
    INSERT INTO public.branches (
        owner_id, name, code, address, city, state, 
        manager_name, manager_email, manager_phone, monthly_target, opening_date, status
    ) VALUES (
        target_user_id, 'Ahmedabad Main', 'AMD-04', 'Near Municipal Market, CG Road', 'Ahmedabad', 'Gujarat',
        'Jayesh Joshi', 'jayesh.amd@ownerdesk.in', '+91 98223 45678', 1050000.00, '2023-08-05', 'Out of Stock'
    ) RETURNING id INTO b_ahmedabad_id;

    -- 2. INSERT INVENTORY FOR EACH BRANCH
    -- Pune Central Inventory (Mostly healthy, 1 low)
    INSERT INTO public.inventory (branch_id, item_name, category, current_quantity, unit, minimum_quantity, cost_per_unit, supplier) VALUES
    (b_pune_id, 'Daawat Basmati Rice', 'Grains & Pulses', 180.00, 'kg', 50.00, 110.00, 'Sahyadri Agro Foods'),
    (b_pune_id, 'Fresh Malai Paneer', 'Dairy', 35.00, 'kg', 20.00, 340.00, 'Katraj Dairy Cooperative'),
    (b_pune_id, 'Fresh Broiler Chicken', 'Meat & Poultry', 55.00, 'kg', 30.00, 210.00, 'Venkys Poultry'),
    (b_pune_id, 'Fortune Sunflower Oil', 'Cooking Oils', 12.00, 'L', 25.00, 145.00, 'Metro Cash & Carry'), -- Low stock
    (b_pune_id, 'Whole Garam Masala Mix', 'Spices & Condiments', 18.00, 'kg', 10.00, 480.00, 'Everest Wholesale'),
    (b_pune_id, 'Eco Meal Meal Boxes 750ml', 'Packaging', 1200.00, 'units', 500.00, 6.50, 'PackWell Solutions');

    -- Nashik Road Inventory (1 Low stock, 1 Out of Stock)
    INSERT INTO public.inventory (branch_id, item_name, category, current_quantity, unit, minimum_quantity, cost_per_unit, supplier) VALUES
    (b_nashik_id, 'Daawat Basmati Rice', 'Grains & Pulses', 75.00, 'kg', 40.00, 108.00, 'Nashik Grain Merchants'),
    (b_nashik_id, 'Fresh Malai Paneer', 'Dairy', 14.00, 'kg', 15.00, 335.00, 'Godavari Dairy'), -- Low stock
    (b_nashik_id, 'Fresh Broiler Chicken', 'Meat & Poultry', 0.00, 'kg', 25.00, 205.00, 'Venkys Poultry'), -- OUT OF STOCK
    (b_nashik_id, 'Fortune Sunflower Oil', 'Cooking Oils', 40.00, 'L', 20.00, 145.00, 'Metro Cash & Carry'),
    (b_nashik_id, 'Fresh Red Onions & Potatoes', 'Vegetables', 95.00, 'kg', 50.00, 32.00, 'Lasalgaon Mandi');

    -- Mumbai West Inventory (Healthy)
    INSERT INTO public.inventory (branch_id, item_name, category, current_quantity, unit, minimum_quantity, cost_per_unit, supplier) VALUES
    (b_mumbai_id, 'Daawat Basmati Rice', 'Grains & Pulses', 250.00, 'kg', 80.00, 115.00, 'APMC Vashi Wholesale'),
    (b_mumbai_id, 'Fresh Malai Paneer', 'Dairy', 45.00, 'kg', 25.00, 360.00, 'Amul Distributor Bandra'),
    (b_mumbai_id, 'Fresh Broiler Chicken', 'Meat & Poultry', 80.00, 'kg', 40.00, 220.00, 'Zorabian Chicken'),
    (b_mumbai_id, 'Fortune Sunflower Oil', 'Cooking Oils', 60.00, 'L', 30.00, 148.00, 'Reliance Smart B2B'),
    (b_mumbai_id, 'Eco Meal Meal Boxes 750ml', 'Packaging', 1800.00, 'units', 600.00, 7.00, 'PackWell Solutions');

    -- Ahmedabad Main Inventory (1 Out of stock, 1 low)
    INSERT INTO public.inventory (branch_id, item_name, category, current_quantity, unit, minimum_quantity, cost_per_unit, supplier) VALUES
    (b_ahmedabad_id, 'Daawat Basmati Rice', 'Grains & Pulses', 20.00, 'kg', 40.00, 105.00, 'Kalupur Grain Market'), -- Low stock
    (b_ahmedabad_id, 'Fresh Malai Paneer', 'Dairy', 0.00, 'kg', 25.00, 330.00, 'Sumul Dairy Distribution'), -- OUT OF STOCK
    (b_ahmedabad_id, 'Fortune Cottonseed Oil', 'Cooking Oils', 70.00, 'L', 30.00, 135.00, 'Tirupati Edible Oils'),
    (b_ahmedabad_id, 'Fresh Green Vegetables', 'Vegetables', 110.00, 'kg', 40.00, 45.00, 'APMC Jamalpur');

    -- 3. INSERT RECENT 14 DAYS SALES RECORDS
    FOR i IN 0..13 LOOP
        curr_date := CURRENT_DATE - i;

        -- Pune Central Daily Sale
        INSERT INTO public.sales (
            branch_id, submitted_by, sale_date, total_orders, 
            gross_sales, discounts, tax, net_sales, 
            cash_amount, card_amount, upi_amount, notes
        ) VALUES (
            b_pune_id, target_user_id, curr_date, 
            90 + (i * 3) % 25, 
            42000.00 + ((i * 1230) % 8000), 
            1500.00, 
            2025.00, 
            (42000.00 + ((i * 1230) % 8000) - 1500.00 + 2025.00),
            8000.00, 12000.00, (42000.00 + ((i * 1230) % 8000) - 1500.00 + 2025.00 - 20000.00),
            'Daily sales report verified by Rohan'
        );

        -- Nashik Road Daily Sale
        INSERT INTO public.sales (
            branch_id, submitted_by, sale_date, total_orders, 
            gross_sales, discounts, tax, net_sales, 
            cash_amount, card_amount, upi_amount, notes
        ) VALUES (
            b_nashik_id, target_user_id, curr_date, 
            55 + (i * 2) % 18, 
            24000.00 + ((i * 910) % 5000), 
            800.00, 
            1160.00, 
            (24000.00 + ((i * 910) % 5000) - 800.00 + 1160.00),
            6000.00, 7500.00, (24000.00 + ((i * 910) % 5000) - 800.00 + 1160.00 - 13500.00),
            'Sales close for evening shift'
        );

        -- Mumbai West Daily Sale
        INSERT INTO public.sales (
            branch_id, submitted_by, sale_date, total_orders, 
            gross_sales, discounts, tax, net_sales, 
            cash_amount, card_amount, upi_amount, notes
        ) VALUES (
            b_mumbai_id, target_user_id, curr_date, 
            130 + (i * 4) % 30, 
            58000.00 + ((i * 1850) % 12000), 
            2200.00, 
            2790.00, 
            (58000.00 + ((i * 1850) % 12000) - 2200.00 + 2790.00),
            7000.00, 22000.00, (58000.00 + ((i * 1850) % 12000) - 2200.00 + 2790.00 - 29000.00),
            'High volume weekend dine-in & takeaway'
        );

        -- Ahmedabad Main Daily Sale
        INSERT INTO public.sales (
            branch_id, submitted_by, sale_date, total_orders, 
            gross_sales, discounts, tax, net_sales, 
            cash_amount, card_amount, upi_amount, notes
        ) VALUES (
            b_ahmedabad_id, target_user_id, curr_date, 
            70 + (i * 3) % 20, 
            31000.00 + ((i * 1100) % 6000), 
            1100.00, 
            1495.00, 
            (31000.00 + ((i * 1100) % 6000) - 1100.00 + 1495.00),
            8500.00, 9000.00, (31000.00 + ((i * 1100) % 6000) - 1100.00 + 1495.00 - 17500.00),
            'Smooth shift operation'
        );

        -- Daily report log for each branch
        INSERT INTO public.daily_reports (branch_id, submitted_by, report_date, status, notes)
        VALUES 
        (b_pune_id, target_user_id, curr_date, 'Submitted', 'Kitchen inventory audited. Peak hours 8 PM - 10 PM handled smoothly.'),
        (b_mumbai_id, target_user_id, curr_date, 'Submitted', 'Full staff present. Customer feedback 4.8/5.');
    END LOOP;

    -- 4. INSERT EXPENSES
    INSERT INTO public.expenses (branch_id, created_by, expense_date, category, amount, description, payment_method, notes) VALUES
    (b_pune_id, target_user_id, CURRENT_DATE - 1, 'Food Supplies', 14200.00, 'Weekly raw chicken & dairy delivery', 'UPI', 'Invoice #SF-4019'),
    (b_pune_id, target_user_id, CURRENT_DATE - 3, 'Utilities', 8400.00, 'MSEDCL Commercial Electricity Bill', 'Bank Transfer', 'Paid online'),
    (b_pune_id, target_user_id, CURRENT_DATE - 6, 'Maintenance', 3200.00, 'Kitchen deep freezer gas refill & service', 'Cash', 'Technician Suresh'),
    (b_pune_id, target_user_id, CURRENT_DATE - 10, 'Marketing', 6000.00, 'Zomato & Instagram local promotion', 'Card', 'Pune foodies campaign'),

    (b_nashik_id, target_user_id, CURRENT_DATE - 2, 'Food Supplies', 9800.00, 'Local vegetable and spice purchase', 'UPI', 'Lasalgaon Mandi invoice'),
    (b_nashik_id, target_user_id, CURRENT_DATE - 5, 'Rent', 35000.00, 'Monthly outlet lease payment', 'Bank Transfer', 'Paid to property owner Mr. Joshi'),
    (b_nashik_id, target_user_id, CURRENT_DATE - 8, 'Utilities', 5200.00, 'Gas cylinder commercial delivery (4 cylinders)', 'UPI', 'HP Gas Agency'),

    (b_mumbai_id, target_user_id, CURRENT_DATE - 1, 'Food Supplies', 24500.00, 'Premium meat, paneer & sauces batch', 'Bank Transfer', 'Vashi APMC bulk'),
    (b_mumbai_id, target_user_id, CURRENT_DATE - 4, 'Salaries', 85000.00, 'Bi-weekly kitchen & service staff advance', 'Bank Transfer', 'Staff payroll batch #1'),
    (b_mumbai_id, target_user_id, CURRENT_DATE - 7, 'Transportation', 4200.00, 'Emergency dry stock transfer from warehouse', 'UPI', 'Porter logistics'),

    (b_ahmedabad_id, target_user_id, CURRENT_DATE - 2, 'Food Supplies', 11200.00, 'Dairy products and cooking oil', 'UPI', 'Sumul wholesale'),
    (b_ahmedabad_id, target_user_id, CURRENT_DATE - 6, 'Utilities', 7100.00, 'Torrent Power commercial power bill', 'Card', 'Paid on portal');

    -- 5. INSERT NOTIFICATIONS
    INSERT INTO public.notifications (user_id, branch_id, title, message, type, severity, is_read, created_at) VALUES
    (target_user_id, b_nashik_id, 'Out of Stock: Fresh Broiler Chicken', 'Fresh Broiler Chicken is completely out of stock at Nashik Road.', 'Out of Stock', 'critical', FALSE, NOW() - INTERVAL '2 hours'),
    (target_user_id, b_ahmedabad_id, 'Out of Stock: Fresh Malai Paneer', 'Fresh Malai Paneer is completely out of stock at Ahmedabad Main.', 'Out of Stock', 'critical', FALSE, NOW() - INTERVAL '5 hours'),
    (target_user_id, b_pune_id, 'Low Inventory: Fortune Sunflower Oil', 'Fortune Sunflower Oil stock is running low (12.00 L remaining) at Pune Central.', 'Low Inventory', 'warning', FALSE, NOW() - INTERVAL '1 day'),
    (target_user_id, b_nashik_id, 'Revenue Target Warning', 'Nashik Road is pacing at 42% of monthly target, below benchmark for mid-month.', 'Revenue Target', 'warning', FALSE, NOW() - INTERVAL '2 days'),
    (target_user_id, b_mumbai_id, 'Target Milestone Reached', 'Mumbai West crossed ₹10,00,000 monthly revenue milestone today!', 'Branch Performance', 'success', TRUE, NOW() - INTERVAL '3 days');

    RAISE NOTICE 'Demo data successfully seeded for 4 outlets!';
END $$;
