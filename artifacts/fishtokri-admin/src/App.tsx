import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import RoleSelect from "@/pages/role-select";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import DeliveryDashboard from "@/pages/delivery-dashboard";
import MyDeliveries from "@/pages/my-deliveries";
import DeliveryHubs from "@/pages/delivery-hubs";
import Hubs from "@/pages/hubs";
import HubDetail from "@/pages/hub-detail";
import AdminUsers from "@/pages/admin-users";
import Customers from "@/pages/customers";
import Orders from "@/pages/orders";
import ComingSoon from "@/pages/coming-soon";
import SubHubMenuAdmin from "@/pages/sub-hub-menu-admin";
import Vendors from "@/pages/vendors";
import VendorInvoices from "@/pages/vendor-invoices";
import VendorStatement from "@/pages/vendor-statement";
import VendorManagementOverview from "@/pages/vendor-management-overview";
import VendorItems from "@/pages/vendor-items";
import VendorCategories from "@/pages/vendor-categories";
import StockAdjustmentPage from "@/pages/stock-adjustment";
import InventoryPage from "@/pages/inventory";
import InventoryOverview from "@/pages/inventory-overview";
import InventoryHistoryPage from "@/pages/inventory-history";
import InventoryStockAdjustmentPage from "@/pages/inventory-stock-adjustment";
import InventoryProductDetail from "@/pages/inventory-product-detail";
import InventoryProductUsage from "@/pages/inventory-product-usage";
import BankingOverview from "@/pages/banking-overview";
import BankingAccounts from "@/pages/banking-accounts";
import BankingReceipts from "@/pages/banking-receipts";
import BankingPayments from "@/pages/banking-payments";
import DeliveryReport from "@/pages/delivery-report";
import DeliveryReportPerson from "@/pages/delivery-report-person";
import DayEndReport from "@/pages/day-end-report";
import WastageReport from "@/pages/wastage-report";
import FishCalculatorPrice from "@/pages/fish-calculator-price";
import FishCalculatorYield from "@/pages/fish-calculator-yield";
import FishCalculatorHistory from "@/pages/fish-calculator-history";
import FishCalculatorConfig from "@/pages/fish-calculator-config";
import { Layout } from "@/components/layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function getStoredAdmin() {
  try {
    const raw = localStorage.getItem("fishtokri_admin");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Default landing route for each role.
function homeFor(role?: string) {
  if (role === "delivery_person") return "/my-deliveries";
  // master_admin, super_hub, sub_hub all share the same unified shell
  return "/dashboard";
}

function ProtectedRoute({
  component: Component,
  allowedRoles,
}: {
  component: React.ComponentType;
  // If undefined → any authenticated user. If provided → only listed roles.
  allowedRoles?: string[];
}) {
  const [, setLocation] = useLocation();
  const token = localStorage.getItem("fishtokri_token");
  const admin = getStoredAdmin();
  const role: string | undefined = admin?.role;

  useEffect(() => {
    if (!token) {
      setLocation("/");
      return;
    }
    if (allowedRoles && (!role || !allowedRoles.includes(role))) {
      setLocation(homeFor(role));
    }
  }, [token, role, allowedRoles, setLocation]);

  if (!token) return null;
  if (allowedRoles && (!role || !allowedRoles.includes(role))) return null;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

// Sub-hub Menu shortcut: redirect /menu to the menu admin for the user's
// first assigned sub hub.
function MenuRedirect() {
  const [, setLocation] = useLocation();
  const admin = getStoredAdmin();
  const subHubIds: string[] =
    admin?.subHubIds?.length > 0 ? admin.subHubIds : admin?.subHubId ? [admin.subHubId] : [];
  useEffect(() => {
    if (subHubIds.length > 0) {
      setLocation(`/sub-hub-menu/${subHubIds[0]}`);
    } else {
      setLocation("/dashboard");
    }
  }, [subHubIds.join(",")]);
  return null;
}

// Generic redirect helper used for legacy (super-hub-dashboard etc.) routes.
function RedirectTo({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(to); }, [to]);
  return null;
}

// Role groups used across many routes.
const ALL_ADMIN_ROLES = ["master_admin", "super_hub", "sub_hub"];
const HUB_OWNERS = ["master_admin", "super_hub"]; // can manage vendors, banking, hubs
const MASTER_ONLY = ["master_admin"];
const SUB_HUB_ONLY = ["sub_hub"];

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            <Route path="/" component={RoleSelect} />
            <Route path="/login" component={Login} />

            {/* ── Unified admin routes ───────────────────────────────────── */}
            {/* Dashboard — every admin role lands here */}
            <Route path="/dashboard">
              <ProtectedRoute component={Dashboard} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>

            {/* Hubs — Master Admin & Super Hub */}
            <Route path="/hubs">
              <ProtectedRoute component={Hubs} allowedRoles={HUB_OWNERS} />
            </Route>
            <Route path="/hubs/:id">
              <ProtectedRoute component={HubDetail} allowedRoles={HUB_OWNERS} />
            </Route>

            {/* Orders — all admin roles */}
            <Route path="/orders">
              <ProtectedRoute component={Orders} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>
            <Route path="/orders/new">
              <ProtectedRoute component={Orders} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>
            <Route path="/orders/edit/:id">
              <ProtectedRoute component={Orders} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>

            {/* Vendor Management — Master Admin & Super Hub */}
            <Route path="/vendor-management">
              <ProtectedRoute component={VendorManagementOverview} allowedRoles={HUB_OWNERS} />
            </Route>
            <Route path="/vendors">
              <ProtectedRoute component={Vendors} allowedRoles={HUB_OWNERS} />
            </Route>
            <Route path="/vendor-statement/:vendorId">
              <ProtectedRoute component={VendorStatement} allowedRoles={HUB_OWNERS} />
            </Route>
            <Route path="/vendor-invoices">
              <ProtectedRoute component={VendorInvoices} allowedRoles={HUB_OWNERS} />
            </Route>
            <Route path="/vendor-items">
              <ProtectedRoute component={VendorItems} allowedRoles={HUB_OWNERS} />
            </Route>
            <Route path="/vendor-categories">
              <ProtectedRoute component={VendorCategories} allowedRoles={HUB_OWNERS} />
            </Route>
            <Route path="/stock-adjustment">
              <ProtectedRoute component={StockAdjustmentPage} allowedRoles={HUB_OWNERS} />
            </Route>

            {/* Inventory — all admin roles */}
            <Route path="/inventory">
              <ProtectedRoute component={InventoryOverview} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>
            <Route path="/inventory/products">
              <ProtectedRoute component={InventoryPage} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>
            <Route path="/inventory/history">
              <ProtectedRoute component={InventoryHistoryPage} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>
            <Route path="/inventory/adjustment">
              <ProtectedRoute component={InventoryStockAdjustmentPage} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>
            <Route path="/inventory/products/:productId/usage">
              <ProtectedRoute component={InventoryProductUsage} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>
            <Route path="/inventory/products/:productId">
              <ProtectedRoute component={InventoryProductDetail} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>

            {/* Banking — Master Admin & Super Hub */}
            <Route path="/banking">
              <ProtectedRoute component={BankingOverview} allowedRoles={HUB_OWNERS} />
            </Route>
            <Route path="/banking/accounts">
              <ProtectedRoute component={BankingAccounts} allowedRoles={HUB_OWNERS} />
            </Route>
            <Route path="/banking/receipts">
              <ProtectedRoute component={BankingReceipts} allowedRoles={HUB_OWNERS} />
            </Route>
            <Route path="/banking/payments">
              <ProtectedRoute component={BankingPayments} allowedRoles={HUB_OWNERS} />
            </Route>

            {/* Admin Users — Master Admin only */}
            <Route path="/admin-users">
              <ProtectedRoute component={AdminUsers} allowedRoles={MASTER_ONLY} />
            </Route>

            {/* Customers — all admin roles */}
            <Route path="/customers">
              <ProtectedRoute component={Customers} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>

            {/* Pincodes / Coupons placeholders */}
            <Route path="/pincodes">
              <ProtectedRoute component={ComingSoon} allowedRoles={MASTER_ONLY} />
            </Route>
            <Route path="/coupons">
              <ProtectedRoute component={ComingSoon} allowedRoles={MASTER_ONLY} />
            </Route>

            {/* Sub-hub menu admin (per sub hub) */}
            <Route path="/sub-hub-menu/:id">
              <ProtectedRoute component={SubHubMenuAdmin} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>
            {/* Sub Hub menu shortcut → resolves to first sub hub's menu */}
            <Route path="/menu">
              <ProtectedRoute component={MenuRedirect} allowedRoles={SUB_HUB_ONLY} />
            </Route>

            {/* ── Legacy redirects (preserve old bookmarks) ──────────────── */}
            <Route path="/super-hub-dashboard">
              <RedirectTo to="/dashboard" />
            </Route>
            <Route path="/sub-hub-dashboard">
              <RedirectTo to="/dashboard" />
            </Route>
            <Route path="/my-hubs">
              <RedirectTo to="/hubs" />
            </Route>
            <Route path="/my-sub-hubs">
              <RedirectTo to="/dashboard" />
            </Route>
            <Route path="/my-hub/:id">
              {(params) => <RedirectTo to={`/hubs/${params.id}`} />}
            </Route>
            <Route path="/my-sub-hub/:id">
              {(params) => <RedirectTo to={`/hubs/${params.id}`} />}
            </Route>
            <Route path="/my-hub">
              <RedirectTo to="/hubs" />
            </Route>

            {/* Fish Purchase Calculator — redirect base path to first sub-page */}
            <Route path="/fish-calculator">
              <RedirectTo to="/fish-calculator/price" />
            </Route>

            {/* Fish Purchase Calculator — Master Admin only */}
            <Route path="/fish-calculator/price">
              <ProtectedRoute component={FishCalculatorPrice} allowedRoles={MASTER_ONLY} />
            </Route>
            <Route path="/fish-calculator/yield">
              <ProtectedRoute component={FishCalculatorYield} allowedRoles={MASTER_ONLY} />
            </Route>
            <Route path="/fish-calculator/history">
              <ProtectedRoute component={FishCalculatorHistory} allowedRoles={MASTER_ONLY} />
            </Route>
            <Route path="/fish-calculator/config">
              <ProtectedRoute component={FishCalculatorConfig} allowedRoles={MASTER_ONLY} />
            </Route>

            {/* Day End Report — all admin roles */}
            <Route path="/day-end-report">
              <ProtectedRoute component={DayEndReport} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>

            {/* Wastage Report — all admin roles (under inventory) */}
            <Route path="/inventory/wastage">
              <ProtectedRoute component={WastageReport} allowedRoles={ALL_ADMIN_ROLES} />
            </Route>

            {/* Delivery Report — all roles */}
            <Route path="/delivery-report/person/:id">
              <ProtectedRoute component={DeliveryReportPerson} allowedRoles={[...ALL_ADMIN_ROLES, "delivery_person"]} />
            </Route>
            <Route path="/delivery-report">
              <ProtectedRoute component={DeliveryReport} allowedRoles={[...ALL_ADMIN_ROLES, "delivery_person"]} />
            </Route>

            {/* Delivery Person routes (unchanged) */}
            <Route path="/delivery-dashboard">
              <ProtectedRoute component={DeliveryDashboard} allowedRoles={["delivery_person"]} />
            </Route>
            <Route path="/my-deliveries">
              <ProtectedRoute component={MyDeliveries} allowedRoles={["delivery_person"]} />
            </Route>
            <Route path="/my-deliveries-hubs">
              <ProtectedRoute component={DeliveryHubs} allowedRoles={["delivery_person"]} />
            </Route>

            <Route component={NotFound} />
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
