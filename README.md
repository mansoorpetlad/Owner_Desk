# OwnerDesk — Centralized Multi-Outlet Restaurant Management Platform

**Manage every outlet from one desk.**

OwnerDesk is a full-stack B2B SaaS web application designed for restaurant chain owners who manage multiple branches from one centralized interface. It gives executives real-time visibility into multi-outlet sales reconciliation, operational expenses, inventory thresholds, branch performance, and automated stockout alerts.

---

## 1. Project Overview

Running a multi-branch restaurant business usually involves fragmented communication across WhatsApp messages, paper logs, and disparate POS systems. OwnerDesk centralizes this governance into an executive desk with:

- **Centralized Multi-Outlet Governance:** Create and monitor branches across cities (e.g., Pune Central, Mumbai West, Nashik Road, Ahmedabad Main).
- **Daily Sales Reconciliation:** Record gross sales, customer discounts, taxes, net revenues, and payment method splits (Cash, UPI, Card).
- **Automated Inventory Thresholds:** Continuous inventory tracking that automatically flags low stock items (`current <= min`) and critical out-of-stock items (`current == 0`).
- **P&L & Expense Control:** Track ingredient supplies, salaries, utility bills, maintenance, and leases with category breakdown visualizations.
- **Consolidated Financial Reports:** Track monthly targets, target pacing percentages, operating profit margins, and export performance data to CSV.
- **Enterprise Security:** Supabase Authentication and PostgreSQL Row Level Security (RLS) guaranteeing tenant data isolation.

---

## 2. Technology Stack

### Frontend
- **HTML5 & CSS3:** Semantic markup with modern light-mode B2B design.
- **Vanilla JavaScript (ES6+):** Modular, readable client-side code without framework bloat.
- **Bootstrap 5 & Bootstrap Icons:** Professional responsive grid, modals, and toasts.
- **Chart.js:** Responsive data visualization for revenue trends, branch comparisons, and expense distributions.

### Backend
- **Node.js & Express.js:** Fast REST API handling reporting aggregation, operational alert auditing, and static hosting.

### Database & Security
- **Supabase PostgreSQL:** Relational cloud database.
- **Supabase Authentication:** Secure Email/Password authentication.
- **PostgreSQL Row Level Security (RLS):** Table-level isolation policies so restaurant owners only access their own outlets.

---

## 3. Folder Structure

```text
ownerdesk/
│
├── database/
│   ├── schema.sql              # Supabase tables, triggers, indexes, and RLS policies
│   └── seed.sql                # Realistic Indian multi-outlet demo seed data
│
├── server/
│   ├── server.js               # Main Express application entry point
│   ├── config/
│   │   └── supabase.js         # Supabase client bridge & environment config
│   ├── middleware/
│   │   └── auth.js             # Bearer token JWT authentication & role enforcement
│   ├── routes/
│   │   ├── branches.js         # Branch CRUD, metrics, and pacing calculations
│   │   ├── sales.js            # Sales submission with duplicate prevention
│   │   ├── expenses.js         # Expense categorization and overhead breakdown
│   │   ├── inventory.js        # Inventory register and availability calculations
│   │   ├── reports.js          # Consolidated P&L statements & CSV exports
│   │   └── notifications.js    # Operational notifications & read tracking
│   └── services/
│       └── alertService.js     # Automatic background auditing for stockout alerts
│
├── public/
│   ├── index.html              # Landing page with hero animation & preview mockup
│   ├── login.html              # Sign in page
│   ├── register.html           # Owner registration page
│   ├── dashboard.html          # Executive dashboard with 6 KPI cards & charts
│   ├── branches.html           # Branch management & Add/Edit modal
│   ├── branch-details.html     # Outlet deep-dive analytics & logs
│   ├── sales.html              # Daily sales tracking & CSV download
│   ├── expenses.html           # Overhead expenses & category chart
│   ├── inventory.html          # Stock threshold management & availability bars
│   ├── reports.html            # Financial summary & branch performance
│   ├── notifications.html      # Operational alerts register
│   ├── settings.html           # Profile & password management
│   │
│   ├── css/
│   │   ├── style.css           # Global SaaS tokens, Inter typography, badges, skeletons
│   │   └── dashboard.css       # Sidebar, topbar, KPI cards, timeline, responsive grid
│   │
│   └── js/
│       ├── config.js           # Client configuration loader
│       ├── supabase-client.js  # Supabase client bridge & authenticated fetch
│       ├── auth.js             # Authentication controller & route protection
│       ├── ui.js               # Toast alerts, modals, currency & date formatting
│       ├── dashboard.js        # Dashboard KPIs & Chart.js instances
│       ├── branches.js         # Branches logic & modal handling
│       ├── branch-details.js   # Single outlet deep-dive analytics
│       ├── sales.js            # Sales calculations & reconciliation
│       ├── expenses.js         # Expense breakdown logic
│       ├── inventory.js        # Stock auditing & status calculation
│       ├── reports.js          # Reports aggregation & CSV exporter
│       ├── notifications.js    # Alert filters & status updater
│       └── settings.js         # Account & password controller
│
├── .env.example                # Documented environment variable template
├── .env                        # Local environment file
├── package.json                # Project dependencies and run scripts
└── README.md                   # Documentation and setup guide
```

---

## 4. Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- Free [Supabase](https://supabase.com) account

### Step 1: Install Dependencies
Open your terminal in the project directory and run:

```bash
npm install
```

### Step 2: Supabase Database Configuration
1. Go to [supabase.com](https://supabase.com) and create a new project (e.g., `OwnerDesk-DB`).
2. In your Supabase project dashboard, navigate to the **SQL Editor**.
3. Open `database/schema.sql` from this repository, copy its entire contents, paste it into the Supabase SQL Editor, and click **Run**.
   - This creates all 7 tables (`profiles`, `branches`, `sales`, `expenses`, `inventory`, `daily_reports`, `notifications`).
   - It sets up automatic user profile creation on signup.
   - It enables Row Level Security (RLS) policies for complete data privacy.
   - It installs automated stockout triggers.
4. *(Optional Demo Data)*: To seed realistic Indian outlets (Pune Central, Nashik Road, Mumbai West, Ahmedabad Main), sign up for an account in the app first, then run `database/seed.sql` in the SQL Editor.

### Step 3: Configure Environment Variables
Open the `.env` file in the root directory (or copy from `.env.example`):

```bash
cp .env.example .env
```

Fill in your Supabase credentials found in **Supabase Dashboard -> Project Settings -> API**:

```env
PORT=3000
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_public_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Step 4: Run the Application
For standard production start:
```bash
npm start
```

For live development with auto-reloading:
```bash
npm run dev
```

Visit the application in your browser:
```text
http://localhost:3000
```

---

## 5. Walkthrough & Features

### 1. Landing Page (`/index.html`)
- Clean presentation with headline, features, and an interactive hero dashboard mockup card.
- Respects `prefers-reduced-motion` for accessibility.

### 2. Authentication (`/register.html` & `/login.html`)
- Register with Full Name, Email, and Password.
- Automatically assigns the **Owner** role without blocking email verification.
- Direct session persistence with automatic redirection for protected routes.

### 3. Executive Dashboard (`/dashboard.html`)
- **6 KPI Cards:**
  1. Total Chain Revenue (₹ formatted via `Intl.NumberFormat('en-IN')`)
  2. Total Expenses
  3. Net Revenue
  4. Active Branches
  5. Low Stock Items
  6. Underperforming Branches
- **Interactive Visualizations:**
  - Revenue vs Expenses line chart with 7-day, 30-day, 3-month, and 1-year filters.
  - Branch revenue comparison bar chart.
  - Stock health status doughnut chart (In Stock, Low Stock, Out of Stock).
- **Recent Activity Stream:** Operational alerts and shift report submissions in real time.

### 4. Branch Outlets (`/branches.html` & `/branch-details.html`)
- Search by branch name, code, or city.
- Filter by operational status (Active, Under-performing, Out of Stock, Inactive).
- **Add Branch Modal:** Form with input validation, target revenue setting, and button loading spinners.
- **Delete Confirmation:** Protects against accidental clicks with a detailed confirmation modal.
- **Deep Dive (`/branch-details.html`):** Individual outlet KPI scorecard, shift reports, and local inventory.

### 5. Sales Reconciliation (`/sales.html`)
- Daily sales logging with gross revenue, discount subtotals, taxes, and automatic net sales calculation.
- Payment breakdown into Cash, UPI, and Card swiping.
- **Duplicate Prevention:** Prevents duplicate submissions for the same branch and date.
- **CSV Export:** Download sales logs directly into a formatted spreadsheet.

### 6. Expenses Management (`/expenses.html`)
- Record ingredient procurement, staff wages, utilities, maintenance, and outlet rent.
- Chart.js category breakdown visualization.

### 7. Centralized Stock Register (`/inventory.html`)
- Tracks ingredients (Basmati rice, paneer, chicken, cooking oils, packaging) with units and safety minimums.
- Automatic availability calculation (`Available Stock / Required Stock × 100`).
- Color-coded progress bars:
  - Green (&ge; 80%)
  - Amber (50% – 79%)
  - Red (&lt; 50% or Out of Stock)
- Automatically triggers notifications for low stock and out-of-stock items.

### 8. Financial Reports (`/reports.html`)
- Executive P&L summary: Total Revenue, Total Expenses, Net Operating Income, Total Orders, Average Order Value (AOV), and Operating Profit Margin.
- Comparative Revenue vs Expenses chart.
- Downloadable performance report CSV.

### 9. Operational Alerts (`/notifications.html`)
- Centralized alerts with severity badges (Critical, Warning, Info, Success).
- Mark individual or all notifications as read.
- Unread badge counter in top navbar.

---

## 6. API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/config` | Exposes public Supabase URL and anon key safely to frontend |
| `GET` | `/api/health` | Server health check and database connection status |
| `GET` | `/api/managers` | List all managers created by the owner |
| `POST` | `/api/managers` | Create a new manager (ID, Password, Mobile, Name, Email) with no email verification |
| `PUT` | `/api/managers/:id/disable` | Disable a manager account |
| `PUT` | `/api/managers/:id/reactivate` | Reactivate a disabled manager account |
| `DELETE` | `/api/managers/:id` | Permanently delete a manager account and record |
| `GET` | `/api/branches` | List all branches with computed revenues and inventory health |
| `POST` | `/api/branches` | Create a new restaurant branch with selected manager |
| `GET` | `/api/branches/:id` | Fetch single branch details with KPIs and recent sales |
| `PUT` | `/api/branches/:id` | Update branch outlet information |
| `DELETE` | `/api/branches/:id` | Delete branch outlet (cascades to related records) |
| `GET` | `/api/sales` | List sales records with branch and date filters |
| `POST` | `/api/sales` | Submit daily sales report with duplicate protection |
| `PUT` | `/api/sales/:id` | Update sales record |
| `DELETE` | `/api/sales/:id` | Remove sales record |
| `GET` | `/api/expenses` | List operational expenses with category breakdown |
| `POST` | `/api/expenses` | Record a new expense |
| `PUT` | `/api/expenses/:id` | Update an existing expense |
| `DELETE` | `/api/expenses/:id` | Delete an expense |
| `GET` | `/api/inventory` | List stock register with calculated availability |
| `POST` | `/api/inventory` | Add an inventory item |
| `PUT` | `/api/inventory/:id` | Update an inventory item |
| `DELETE` | `/api/inventory/:id` | Remove an inventory item |
| `GET` | `/api/reports/summary` | Generate consolidated P&L statements and branch performance |
| `GET` | `/api/notifications` | List alerts with unread counter |
| `PUT` | `/api/notifications/:id/read` | Mark single notification as read |
| `PUT` | `/api/notifications/read-all` | Mark all notifications as read |
| `DELETE` | `/api/notifications/:id` | Delete notification |

---

## 7. Security & Row Level Security (RLS)

1. **Authentication Token:** Handled via Supabase JWT Bearer token headers.
2. **PostgreSQL RLS Policies:** Every table (`profiles`, `branches`, `sales`, `expenses`, `inventory`, `notifications`, `daily_reports`) has strict policies ensuring users can only read, insert, update, and delete records belonging to their authenticated `owner_id`.
3. **Secret Protection:** The Supabase Service-Role key is strictly confined to the backend server and never exposed in client-side code.

---

## 8. License & Academic Attribution
Developed as a comprehensive B.Tech / Degree Capstone Project demonstration adhering to real-world B2B SaaS architectural standards.
