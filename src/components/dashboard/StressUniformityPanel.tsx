import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, TrendingUp } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";

export function StressUniformityPanel() {
  const { criticalAndSaturatedZones, percentageOnTrack, dynamicAlerts } = useDashboard();

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
              <TrendingUp className="h-6 w-6 mr-2 text-primary" />
              Zones currently on track
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold text-primary">{percentageOnTrack}%</div>
            <p className="text-xs text-muted-foreground mt-1">of acreage currently on track</p>
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
