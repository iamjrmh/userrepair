import { lazy, useEffect, useState, type ReactElement } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import LoginPage from "@/routes/LoginPage";
import SetupScreen from "@/routes/SetupScreen";
import { useAuthStore } from "@/stores/auth";
import { useBrandStore } from "@/stores/brand";
import { needsSetup } from "@/lib/repos/auth";
import { hasAccess } from "@/lib/roles";

// Route-level code splitting (React.lazy + Suspense in AppLayout).
const DashboardPage = lazy(() => import("@/routes/DashboardPage"));
const TicketsPage = lazy(() => import("@/routes/TicketsPage"));
const TicketDetailPage = lazy(() => import("@/routes/TicketDetailPage"));
const CustomersPage = lazy(() => import("@/routes/CustomersPage"));
const CustomerDetailPage = lazy(() => import("@/routes/CustomerDetailPage"));
const DevicesPage = lazy(() => import("@/routes/DevicesPage"));
const InventoryPage = lazy(() => import("@/routes/InventoryPage"));
const DonorsPage = lazy(() => import("@/routes/DonorsPage"));
const MicrosolderingPage = lazy(() => import("@/routes/MicrosolderingPage"));
const IntelligencePage = lazy(() => import("@/routes/IntelligencePage"));
const BoardToolsPage = lazy(() => import("@/routes/BoardToolsPage"));
const CalculatorPage = lazy(() => import("@/routes/CalculatorPage"));
const KnowledgePage = lazy(() => import("@/routes/KnowledgePage"));
const ReferencePage = lazy(() => import("@/routes/ReferencePage"));
const POSPage = lazy(() => import("@/routes/POSPage"));
const SalesHistoryPage = lazy(() => import("@/routes/SalesHistoryPage"));
const FinancialPage = lazy(() => import("@/routes/FinancialPage"));
const ReportingPage = lazy(() => import("@/routes/ReportingPage"));
const BackupPage = lazy(() => import("@/routes/BackupPage"));
const PluginsPage = lazy(() => import("@/routes/PluginsPage"));
const SettingsPage = lazy(() => import("@/routes/SettingsPage"));

/** Gate a route element behind the current user's role. */
function Protected({ path, children }: { path: string; children: ReactElement }) {
  const role = useAuthStore((s) => s.user?.role);
  if (!role) return null;
  return hasAccess(role, path) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const ready = useAuthStore((s) => s.ready);
  const user = useAuthStore((s) => s.user);
  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null);

  useEffect(() => {
    useAuthStore.getState().init();
    void useBrandStore.getState().init();
    needsSetup().then(setSetupNeeded).catch(() => setSetupNeeded(false));
  }, []);

  if (!ready || setupNeeded === null) return null;
  if (setupNeeded && !user) return <SetupScreen onDone={() => setSetupNeeded(false)} />;
  if (!user) return <LoginPage />;

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tickets" element={<Protected path="/tickets"><TicketsPage /></Protected>} />
          <Route path="tickets/:id" element={<Protected path="/tickets"><TicketDetailPage /></Protected>} />
          <Route path="customers" element={<Protected path="/customers"><CustomersPage /></Protected>} />
          <Route path="customers/:id" element={<Protected path="/customers"><CustomerDetailPage /></Protected>} />
          <Route path="devices" element={<Protected path="/devices"><DevicesPage /></Protected>} />
          <Route path="inventory" element={<Protected path="/inventory"><InventoryPage /></Protected>} />
          <Route path="donors" element={<Protected path="/donors"><DonorsPage /></Protected>} />
          <Route path="microsoldering" element={<Protected path="/microsoldering"><MicrosolderingPage /></Protected>} />
          <Route path="intelligence" element={<Protected path="/intelligence"><IntelligencePage /></Protected>} />
          <Route path="board-tools" element={<Protected path="/board-tools"><BoardToolsPage /></Protected>} />
          <Route path="calculator" element={<Protected path="/calculator"><CalculatorPage /></Protected>} />
          <Route path="knowledge" element={<Protected path="/knowledge"><KnowledgePage /></Protected>} />
          <Route path="reference" element={<Protected path="/reference"><ReferencePage /></Protected>} />
          <Route path="pos" element={<Protected path="/pos"><POSPage /></Protected>} />
          <Route path="sales" element={<Protected path="/sales"><SalesHistoryPage /></Protected>} />
          <Route path="financial" element={<Protected path="/financial"><FinancialPage /></Protected>} />
          <Route path="reporting" element={<Protected path="/reporting"><ReportingPage /></Protected>} />
          <Route path="backup" element={<Protected path="/backup"><BackupPage /></Protected>} />
          <Route path="plugins" element={<Protected path="/plugins"><PluginsPage /></Protected>} />
          <Route path="settings" element={<Protected path="/settings"><SettingsPage /></Protected>} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
