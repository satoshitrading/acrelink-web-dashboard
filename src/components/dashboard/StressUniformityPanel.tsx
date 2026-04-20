import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Droplets } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";

export function StressUniformityPanel() {
  const {
    criticalAndSaturatedZones,
    dynamicAlerts,
    seasonIrrigationEventCount,
    irrigationSummary,
    irrigationLoading,
    irrigationError,
  } = useDashboard();

  const { maxDaysSinceLastDetected, perZone } = irrigationSummary;

  return (
    <div className="mb-8">
      <h3 className="text-[clamp(20px,2vw,30px)] font-display font-bold text-foreground mb-4 flex items-center">
        <AlertCircle className="h-7 w-7 mr-3 text-primary" />
        Stress &amp; Uniformity
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="shadow-industrial hover-lift border-2 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex-wrap gap-3 font-display font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
              <AlertCircle className="h-6 w-6 mr-2 text-destructive" />
              Number of zones at risk today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold text-destructive">{criticalAndSaturatedZones.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Critical: Dry or Critical: Saturated</p>
          </CardContent>
        </Card>
        <Card className="shadow-industrial hover-lift border-2 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className=" flex-wrap gap-3 text-sm font-display font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
              <Droplets className="h-6 w-6 mr-2 text-primary" />
              Irrigation recency
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {irrigationError ? (
              <p className="text-sm text-destructive">{irrigationError}</p>
            ) : null}
            <div>
              <div className="text-3xl font-display font-bold text-primary">
                {irrigationLoading ? "…" : maxDaysSinceLastDetected != null ? maxDaysSinceLastDetected : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Longest gap without detected irrigation (any zone with sensors)
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{irrigationLoading ? "…" : seasonIrrigationEventCount}</span>
              {" "}irrigation events this season (calendar year)
            </p>
            {perZone.length > 0 ? (
              <ul className="text-xs text-muted-foreground space-y-1 border-t border-border/50 pt-2">
                {perZone.map((row) => (
                  <li key={row.zoneId} className="flex justify-between gap-2">
                    <span className="truncate font-medium text-foreground">{row.name}</span>
                    <span className="shrink-0">
                      {row.daysSince === null ? "No events yet" : `${row.daysSince}d since last`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No zones with assigned nodes yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="  main-content-p0">
        <ul className="space-y-2">
          {dynamicAlerts.length > 0
            ? dynamicAlerts.map((alert, idx) => (
                <Alert key={idx} className="bg-yellow-100/60 border-l-4 border-yellow-400 rounded-md">
                  <li className="flex flex-wrap gap-2 items-center text-yellow-800 text-[clamp(14px,2vw,18px)] font-medium">
                    <AlertCircle className="h-4 w-4 mr-2 text-yellow-600" />
                    {alert.message}
                  </li>
                </Alert>
              ))
            : null}
        </ul>
      </div>
    </div>
  );
}
