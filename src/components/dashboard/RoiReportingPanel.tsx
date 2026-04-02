import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, Download } from "lucide-react";
import { ComingSoonBadge } from "@/components/ui/coming-soon-badge";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";

export function RoiReportingPanel() {
  const { zoneSummariesForView, generateReport } = useDashboard();

  return (
    <Card className="mb-8 shadow-industrial-lg border-2 border-primary/40 bg-gradient-to-br from-primary/5 to-accent/5">
      <CardHeader className="border-b-2 border-border/50 bg-card/50">
        <CardTitle className="text-[clamp(20px,2vw,30px)] font-display font-bold text-foreground flex items-center">
          <DollarSign className="h-8 w-8 mr-3 text-primary" />
          Reports & Summaries
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 main-content-section">
        <div className="grid md:grid-cols-2 gap-6 mb-0 main-content-p0">
          <div className="bg-card/80 border-2 border-border/50 rounded-lg p-5 shadow-industrial flex flex-col justify-center">
            <p className="text-sm text-muted-foreground mb-2">Irrigation Cycle Summary</p>
            <p className="text-[clamp(20px,2vw,30px)] font-display font-bold text-primary">
              {zoneSummariesForView.filter((z) => z.status === "Optimal").length} of {zoneSummariesForView.length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Fields in Optimal Range</p>
          </div>
          <div className="bg-card/80 border-2 border-border/50 rounded-lg p-5 shadow-industrial flex flex-col justify-center">
            <p className="text-lg font-semibold text-primary mb-3">Season Summary Available</p>
            <div className="flex flex-col gap-3">
              <Button size="lg" className="shadow-industrial hover-glow btn-style" onClick={generateReport}>
                <Download className="h-5 w-5 mr-2" />
                Download Season Summary
              </Button>
              <Button size="lg" variant="outline" className="shadow-industrial hover-glow btn-style">
                Generate Cost-Share Report
                <ComingSoonBadge />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
