import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Droplet, CloudRain } from "lucide-react";
import { getMoistureStatusColors } from "@/lib/sensor-status-utils";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";

export function FieldStatusPanel() {
  const { lowMoistureZones } = useDashboard();

  return (
    <Card className="mb-8 shadow-industrial-lg border-2 border-primary/40 bg-gradient-to-br from-primary/5 to-accent/5 main-content-p0">
      <CardHeader className="border-b-2 border-border/50 bg-card/50 main-content-section">
        <CardTitle className="text-[clamp(20px,2vw,30px)] font-display font-bold text-foreground flex items-center">
          <Droplet className="h-8 w-8 mr-3  text-primary" />
          Field Status
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 main-content-section">
        <div className="main-content-section  flex flex-col md:flex-row md:items-start md:justify-between gap-8 bg-card/80 border-2 border-border/50 rounded-lg p-6 shadow-industrial">
          <div className="flex-1 space-y-4 min-w-[200px]">
            <div
              className={`text-s font-medium mb-2 ${
                lowMoistureZones.length > 0
                  ? "border-2 border-destructive/60 bg-destructive/10 rounded-lg p-2 text-destructive"
                  : "border-2 border-green-500/60 bg-green-100/40 rounded-lg p-2 text-green-700"
              }`}
            >
              {lowMoistureZones.length > 0 ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <span className="text-[clamp(14px,2vw,18px)] font-bold">
                    {lowMoistureZones.length === 1
                      ? "1 zone below optimal moisture range."
                      : `${lowMoistureZones.length} zones below optimal moisture range.`}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <svg
                    className="h-5 w-5 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-[clamp(14px,2vw,18px)]">
                    All zones are on track. No immediate irrigation needed.
                  </span>
                </div>
              )}
            </div>

            {lowMoistureZones.length > 0 && (
              <div className="mb-4">
                <h3 className="text-lg font-bold mb-2">Priority Zones</h3>
                <ul className="space-y-2">
                  {lowMoistureZones.map((zone) => {
                    const statusColors = getMoistureStatusColors(zone.status);
                    return (
                      <li
                        key={zone.id}
                        className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-[#efeeeb80]-300 bg-[#efeeeb80] rounded-lg p-4"
                      >
                        <div className="flex items-center gap-2 flex-wrap whitespace-nowrap sm:justify-center ">
                          <span className="font-bold text-gray-900 whitespace-nowrap text-[14px]">{zone.name}</span>
                          <span className="text-xs text-gray-700 font-semibold whitespace-nowrap text-[14px]">
                            {zone.avgMoisture}% moisture
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold border-2  ${statusColors.bg} ${statusColors.text} ${statusColors.border}`}
                          >
                            {zone.status}
                          </span>
                        </div>
                        <div className="flex flex-col md:flex-row gap-3 items-center">
                          <span className="flex items-center flex-wrap gap-3 text-xs text-800 px-2 py-1 rounded md:whitespace-nowrap whitespace-pre-line">
                            <div className="flex items-center gap-1">
                              <AlertCircle className="min-h-16px min-w-16px text-gray-700" />
                              <span className="text-muted-foreground text-[14px]">Drying trend: </span>
                            </div>
                            <span className="font-bold  text-[14px]">Zone drying faster than normal</span>
                          </span>
                          <span className="flex items-center flex-wrap gap-3 text-xs  text-blue-700 px-2 py-1 rounded md:whitespace-nowrap whitespace-pre-line">
                            <div className="flex items-center gap-1">
                              <CloudRain className="min-h-16px min-w-16px text-gray-700" />
                              <span className="text-muted-foreground text-[14px] ">Action: </span>
                            </div>
                            <span className="font-bold text-primary text-[14px]">Address at next irrigation cycle</span>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between mt-6 pt-4 gap-6 ">
              <div className=" p-3  text-blue-700  md:w-auto w-full " />
              <div className="md:w-auto w-full">
                <Button
                  size="lg"
                  className="w-full md:w-auto sm:w-full shadow-industrial hover-glow h-14"
                  onClick={() => {
                    document.getElementById("zone-grid-section")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                >
                  View All Zones
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
