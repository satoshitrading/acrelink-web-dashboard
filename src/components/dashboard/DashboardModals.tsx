import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { GatewayNamingModal } from "@/components/GatewayNamingModal";
import { ZoneManagementPanel } from "@/components/ZoneManagementPanel";
import { NodeAssignmentModal } from "@/components/NodeAssignmentModal";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";
import { SmsOptInModal } from "@/components/SmsOptInModal";

export function DashboardModals() {
  const {
    zonePanelOpen,
    setZonePanelOpen,
    zones,
    createZone,
    updateZone,
    deleteZone,
    userSiteId,
    setAssignTargetZoneId,
    setAssignOpen,
    assignOpen,
    assignTargetZoneId,
    allNodeReadings,
    assignNodesToZone,
    showGatewayModal,
    gatewayList,
    handleGatewayNamesSaved,
    showSeasonModal,
    setShowSeasonModal,
    seasonStart,
    setSeasonStart,
    seasonEnd,
    setSeasonEnd,
    generatingReport,
    downloadSeasonSummary,
    showSmsOptInModal,
    setShowSmsOptInModal,
  } = useDashboard();

  return (
    <>
      <ZoneManagementPanel
        open={zonePanelOpen}
        onOpenChange={setZonePanelOpen}
        zones={zones}
        onCreate={async (name, color) => {
          if (!userSiteId?.trim()) {
            throw new Error("No site selected. Try reloading the dashboard.");
          }
          await createZone({ name, color });
        }}
        onUpdate={updateZone}
        onDelete={deleteZone}
        onAssignNodes={(z) => {
          setAssignTargetZoneId(z.id);
          setAssignOpen(true);
          setZonePanelOpen(false);
        }}
      />

      <NodeAssignmentModal
        open={assignOpen}
        onOpenChange={(o) => {
          setAssignOpen(o);
          if (!o) setAssignTargetZoneId(null);
        }}
        zone={zones.find((z) => z.id === assignTargetZoneId) ?? null}
        allZones={zones}
        allNodeReadings={allNodeReadings}
        onSave={assignNodesToZone}
      />

      <GatewayNamingModal
        isOpen={showGatewayModal}
        gateways={gatewayList}
        onSave={handleGatewayNamesSaved}
        onSkip={handleGatewayNamesSaved}
      />

      {/* <SmsOptInModal
        open={showSmsOptInModal}
        onOpenChange={(o) => {
          if (!o) localStorage.setItem("acrelinkSmsPromptDismissed", "1");
          setShowSmsOptInModal(o);
        }}
      /> */}

      {showSeasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md bg-card border-2 border-border/50 rounded-xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-1">Download Season Summary</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Select the season date range. A CSV will be generated with per-gateway stats.
            </p>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Season Start</label>
                <input
                  type="date"
                  className="px-3 py-2 border border-border rounded bg-background text-foreground"
                  value={seasonStart}
                  onChange={(e) => setSeasonStart(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Season End</label>
                <input
                  type="date"
                  className="px-3 py-2 border border-border rounded bg-background text-foreground"
                  value={seasonEnd}
                  onChange={(e) => setSeasonEnd(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 mt-1">
                <Button variant="outline" onClick={() => setShowSeasonModal(false)} disabled={generatingReport}>
                  Cancel
                </Button>
                <Button onClick={downloadSeasonSummary} disabled={generatingReport || !seasonStart || !seasonEnd}>
                  <Download className="h-4 w-4 mr-2" />
                  {generatingReport ? "Generating..." : "Download CSV"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
