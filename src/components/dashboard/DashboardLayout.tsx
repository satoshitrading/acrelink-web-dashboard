import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { DashboardIntro } from "@/components/dashboard/DashboardIntro";
import { FieldStatusPanel } from "@/components/dashboard/FieldStatusPanel";
import { StressUniformityPanel } from "@/components/dashboard/StressUniformityPanel";
import { DashboardRefreshBar } from "@/components/dashboard/DashboardRefreshBar";
import { ZoneStatusPanel } from "@/components/dashboard/ZoneStatusPanel";
import { MoistureTrendsPanel } from "@/components/dashboard/MoistureTrendsPanel";
import { RoiReportingPanel } from "@/components/dashboard/RoiReportingPanel";
import { SystemHealthPanel } from "@/components/dashboard/SystemHealthPanel";
import { DashboardModals } from "@/components/dashboard/DashboardModals";

/** Page shell: nav + main panels. Shared state comes from `DashboardProvider` (React Context). */
export function DashboardLayout() {
  return (
    <div className="min-h-screen gradient-hero">
      <DashboardNav />
      <div className="max-w-7xl mx-auto px-6 py-8 main-content-section">
        <DashboardIntro />
        <FieldStatusPanel />
        <StressUniformityPanel />
        <DashboardRefreshBar />
        <ZoneStatusPanel />
        <MoistureTrendsPanel />
        <RoiReportingPanel />
        <SystemHealthPanel />
      </div>
      <DashboardModals />
    </div>
  );
}
