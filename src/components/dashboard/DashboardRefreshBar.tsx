import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";

export function DashboardRefreshBar() {
  const { lastUpdated, refreshData, isRefreshing } = useDashboard();

  return (
    <div className="flex flex-wrap sm:justify-between justify-center items-center mb-6 gap-6">
      <p className="text-sm text-muted-foreground font-medium">
        Last updated: <span className="font-bold text-foreground">{lastUpdated}</span>
      </p>
      <Button
        onClick={refreshData}
        size="lg"
        className="shadow-industrial hover-glow h-12 px-6"
        disabled={isRefreshing}
      >
        <RefreshCw className={`h-5 w-5 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
        {isRefreshing ? "Refreshing..." : "Refresh Data"}
      </Button>
    </div>
  );
}
