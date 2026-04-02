import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity } from "lucide-react";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";

export function SystemHealthPanel() {
  const { activeSensors, offlineSensors, avgBatteryVoltage, lastUpdated } = useDashboard();

  return (
    <Card className="mb-8 shadow-industrial-lg border-2 border-border/50">
      <CardHeader className="main-content-section">
        <CardTitle className="  text-[clamp(20px,2vw,30px)] font-display font-bold flex items-center">
          <Activity className="h-8 w-8 mr-3 text-primary" />
          System Health Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="main-content-section">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-display font-bold">Metric</TableHead>
              <TableHead className="font-display font-bold text-right">Value</TableHead>
              <TableHead className="font-display font-bold text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-semibold whitespace-nowrap">Sensors Online</TableCell>
              <TableCell className="text-right font-bold text-s">
                {activeSensors} / {activeSensors + offlineSensors}
              </TableCell>
              <TableCell className="text-right">
                <span className="px-3 whitespace-nowrap py-1 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-sm font-semibold">
                  Good
                </span>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold whitespace-nowrap">Average Battery Level</TableCell>
              <TableCell className="text-right font-bold text-s whitespace-nowrap">{avgBatteryVoltage}V</TableCell>
              <TableCell className="text-right">
                <span
                  className={
                    Number(avgBatteryVoltage) < 3.3
                      ? "px-3 py-1 rounded-full bg-yellow-400/20 text-yellow-700 text-sm font-semibold"
                      : "px-3 py-1 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-sm font-semibold"
                  }
                >
                  {Number(avgBatteryVoltage) < 3.3 ? "Watch" : "Good"}
                </span>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold whitespace-nowrap">Last Sync Time</TableCell>
              <TableCell className="text-right font-bold text-s whitespace-nowrap ">{lastUpdated}</TableCell>
              <TableCell className="text-right">
                <span
                  className={
                    new Date().getTime() - new Date(`1970-01-01T${lastUpdated}Z`).getTime() > 1000 * 60 * 10
                      ? "px-3 py-1 rounded-full bg-red-500/20 text-red-600 text-sm font-semibold whitespace-nowrap"
                      : "px-3 py-1 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-sm font-semibold whitespace-nowrap"
                  }
                >
                  {new Date().getTime() - new Date(`1970-01-01T${lastUpdated}Z`).getTime() > 1000 * 60 * 10
                    ? "Action Needed"
                    : "Good"}
                </span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
