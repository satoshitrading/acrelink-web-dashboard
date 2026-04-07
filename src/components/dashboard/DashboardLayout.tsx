import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { DashboardIntro } from "@/components/dashboard/DashboardIntro";
import { FieldMapPanel } from "@/components/dashboard/FieldMapPanel";
import { FieldStatusPanel } from "@/components/dashboard/FieldStatusPanel";
import { StressUniformityPanel } from "@/components/dashboard/StressUniformityPanel";
import { DashboardRefreshBar } from "@/components/dashboard/DashboardRefreshBar";
import { ZoneStatusPanel } from "@/components/dashboard/ZoneStatusPanel";
import { MoistureTrendsPanel } from "@/components/dashboard/MoistureTrendsPanel";
import { RoiReportingPanel } from "@/components/dashboard/RoiReportingPanel";
import { SystemHealthPanel } from "@/components/dashboard/SystemHealthPanel";
import { DashboardModals } from "@/components/dashboard/DashboardModals";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";
import type { DashboardTabValue } from "@/contexts/dashboard/useDashboardController";

const DASHBOARD_TABS = ["overview", "analytics", "reports"] as const;

function isDashboardTabValue(v: string): v is DashboardTabValue {
  return (DASHBOARD_TABS as readonly string[]).includes(v);
}

/** Page shell: nav + main panels. Shared state comes from `DashboardProvider` (React Context). */
export function DashboardLayout() {
  const { dashboardTab, setDashboardTab } = useDashboard();

  return (
    <div className="min-h-screen gradient-hero">
      <DashboardNav />
      <div className="max-w-7xl mx-auto px-6 py-8 main-content-section">
        <DashboardIntro />
        <Tabs
          value={dashboardTab}
          onValueChange={(v) => {
            if (isDashboardTabValue(v)) setDashboardTab(v);
          }}
          className="w-full"
        >
          <TabsList
            className={cn(
              "mb-8 grid h-auto w-full grid-cols-1 gap-2 p-2 sm:grid-cols-3 sm:gap-1",
              "rounded-lg border-2 border-border/50 bg-card/80 shadow-industrial",
            )}
          >
            <TabsTrigger
              value="overview"
              className="data-[state=active]:border-2 data-[state=active]:border-primary/40 data-[state=active]:shadow-sm py-2.5"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="data-[state=active]:border-2 data-[state=active]:border-primary/40 data-[state=active]:shadow-sm py-2.5"
            >
              Analytics
            </TabsTrigger>
            <TabsTrigger
              value="reports"
              className="data-[state=active]:border-2 data-[state=active]:border-primary/40 data-[state=active]:shadow-sm py-2.5"
            >
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <FieldStatusPanel />
            <ZoneStatusPanel />
            <FieldMapPanel />
            <DashboardRefreshBar />
          </TabsContent>

          <TabsContent value="analytics" className="mt-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <MoistureTrendsPanel />
            <StressUniformityPanel />
          </TabsContent>

          <TabsContent value="reports" className="mt-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <RoiReportingPanel />
            <SystemHealthPanel />
          </TabsContent>
        </Tabs>
      </div>
      <DashboardModals />
    </div>
  );
}
