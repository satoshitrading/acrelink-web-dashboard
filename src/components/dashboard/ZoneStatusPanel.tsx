import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Boxes,
  Droplet,
  Battery,
  Signal,
  Settings,
  Layers,
  Loader2,
  Users,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ZoneSelector } from "@/components/ZoneSelector";
import {
  isNodeFilterValue,
  nodeIdFromZoneFilter,
} from "@/lib/zone-filter-utils";
import { getBatteryStatusColor, getSignalStatusColor, getMoistureStatusColors } from "@/lib/sensor-status-utils";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";

const MAX_ZONE_CARDS = 8;

export function ZoneStatusPanel() {
  const {
    navigate,
    zoneFilter,
    setZoneFilter,
    zoneSummaries,
    zoneSectionLoading,
    setZonePanelOpen,
    unassignedNodeIds,
    allNodeReadings,
    zoneSummariesForView,
    setAssignOpen,
    setAssignTargetZoneId,
  } = useDashboard();

  const [zoneGridExpanded, setZoneGridExpanded] = useState(false);

  const shouldTruncate =
    zoneFilter === "all" && zoneSummariesForView.length > MAX_ZONE_CARDS;

  const zonesForGrid = useMemo(() => {
    if (!shouldTruncate) return zoneSummariesForView;
    if (!zoneGridExpanded) {
      return zoneSummariesForView.slice(0, MAX_ZONE_CARDS);
    }
    return zoneSummariesForView;
  }, [zoneSummariesForView, shouldTruncate, zoneGridExpanded]);

  useEffect(() => {
    setZoneGridExpanded(false);
  }, [zoneFilter]);

  return (
    <Card
      className="mb-8 shadow-industrial-lg border-2 border-primary/40 bg-gradient-to-br from-primary/5 to-accent/5 main-content-p0"
      id="zone-grid-section"
    >
      <CardHeader className="border-b-2 border-border/50 bg-card/50 main-content-section">
        <CardTitle className="text-[clamp(20px,2vw,30px)] font-display font-bold text-foreground flex items-center">
          <Layers className="h-8 w-8 mr-3 text-primary" />
          Zone Status
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 main-content-section">
        <div className="main-content-section flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4 mb-4 pb-4 border-b-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <ZoneSelector
                className="min-w-0 w-full"
                value={zoneFilter}
                onChange={setZoneFilter}
                zones={zoneSummaries}
                unassignedNodeIds={unassignedNodeIds}
                disabled={zoneSectionLoading}
              />
              <Button
                size="lg"
                className="shrink-0 px-3 shadow-industrial hover-glow sm:px-8"
                onClick={() => setZonePanelOpen(true)}
              >
                <Settings className="h-5 w-5 mr-2" />
                Manage zones
              </Button>
            </div>
          </div>
          {zoneSectionLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
              <p className="text-sm font-medium text-muted-foreground">Loading zones…</p>
            </div>
          ) : zoneFilter === "unassigned" ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {unassignedNodeIds.length === 0 ? (
                <p className="text-muted-foreground col-span-full">No unassigned nodes.</p>
              ) : (
                unassignedNodeIds.map((nodeId) => {
                  const r = allNodeReadings[nodeId];
                  const colors = getMoistureStatusColors(
                    !r?.online ? "Offline" : (r?.status ?? "Optimal"),
                  );
                  return (
                    <Card key={nodeId} className={`shadow-industrial border-2 ${colors.border}`}>
                      <div className={`h-1.5 w-full ${colors.bar}`} />
                      <CardContent className="p-5 pt-7">
                        <h2 className="font-mono text-sm font-bold truncate" title={nodeId}>
                          {nodeId}
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">Unassigned</p>
                        <div className="mt-3 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Moisture</span>
                            <span className="font-bold">{r ? `${r.moisture}%` : "—"}</span>
                          </div>
                          <p className={`text-sm font-semibold ${colors.text}`}>{r?.status ?? "—"}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          ) : isNodeFilterValue(zoneFilter) ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {(() => {
                const nid = nodeIdFromZoneFilter(zoneFilter);
                const r = nid ? allNodeReadings[nid] : undefined;
                if (!nid || !r) {
                  return (
                    <p className="text-muted-foreground col-span-full">
                      No data for this sensor.
                    </p>
                  );
                }
                const colors = getMoistureStatusColors(!r.online ? "Offline" : r.status);
                return (
                  <Card className={`shadow-industrial border-2 ${colors.border}`}>
                    <div className={`h-1.5 w-full ${colors.bar}`} />
                    <CardContent className="p-5 pt-7">
                      <h2 className="font-mono text-sm font-bold truncate" title={nid}>
                        {nid}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-1">Single sensor</p>
                      <div className="mt-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Moisture</span>
                          <span className="font-bold">{r.moisture}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Battery</span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded ${getBatteryStatusColor(r.batteryVoltage)} ${getBatteryStatusColor(r.batteryVoltage).text}`}
                          >
                            {getBatteryStatusColor(r.batteryVoltage).status}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Signal</span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded ${getSignalStatusColor(r.signal)} ${getSignalStatusColor(r.signal).text}`}
                          >
                            {getSignalStatusColor(r.signal).status}
                          </span>
                        </div>
                        <p className={`text-sm font-semibold pt-2 ${colors.text}`}>{r.status}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                {zoneSummariesForView.length === 0 ? (
                  <Card className="col-span-full shadow-industrial border-2 border-border/50">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <Droplet className="h-10 w-10 text-muted-foreground/40 mb-4" />
                      <p className="text-lg font-display font-semibold text-foreground mb-1">No zones created yet</p>
                      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                        Create a zone and assign sensor nodes to start monitoring field conditions.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  zonesForGrid.map((zone) => {
                    const colors = getMoistureStatusColors(zone.status);
                    return (
                      <Card
                        key={zone.id}
                        onClick={() => navigate(`/zone/${encodeURIComponent(zone.id)}`)}
                        className={`shadow-industrial border-2 hover-lift group relative overflow-hidden border-[#DEDBD4] cursor-pointer transition-all hover:shadow-lg`}
                      >
                        <div
                          className={`absolute top-0 left-0 w-full h-1.5 ${colors.bar}`}
                          style={{ backgroundColor: zone.color }}
                        />
                        <CardContent className="p-5 pt-7">
                          <div className="flex items-start justify-between mb-4">
                            <h2 className="text-xl font-display font-bold text-foreground truncate" title={zone.name}>
                              {zone.name}
                            </h2>
                            {(zone.status === "Dry" ||
                              zone.status === "Critical: Dry" ||
                              zone.status === "Critical: Saturated") && (
                              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                            )}
                          </div>
                          <div className="space-y-2.5">
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-sm text-muted-foreground flex items-center shrink-0">
                                <Boxes className="h-3.5 w-3.5 mr-1.5" /> Nodes
                              </span>
                              <span className="font-bold text-right min-w-0">
                                {zone.totalNodeCount}
                                {zone.totalNodeCount > 0 &&
                                  zone.onlineNodeCount !== zone.totalNodeCount && (
                                    <span className="text-muted-foreground font-normal text-sm">
                                      {" "}
                                      · {zone.onlineNodeCount} online
                                    </span>
                                  )}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground flex items-center">
                                <Droplet className="h-3.5 w-3.5 mr-1.5 text-primary" /> Moisture
                              </span>
                              <span className={`font-bold`}>{zone.avgMoisture}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground flex items-center">
                                <Battery className="h-3.5 w-3.5 mr-1.5" /> Battery
                              </span>
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded ${getBatteryStatusColor(zone.avgBattery)} ${getBatteryStatusColor(zone.avgBattery).text}`}
                              >
                                {getBatteryStatusColor(zone.avgBattery).status}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground flex items-center">
                                <Signal className="h-3.5 w-3.5 mr-1.5" /> Signal
                              </span>
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded ${getSignalStatusColor(zone.avgSignal)} ${getSignalStatusColor(zone.avgSignal).text}`}
                              >
                                {getSignalStatusColor(zone.avgSignal).status}
                              </span>
                            </div>
                            <div className="pt-3 mt-3 border-t-2 border-border">
                              <p className={`font-display font-bold text-sm flex items-center justify-center ${colors.text}`}>
                                Status: {zone.status}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="w-full mt-4 shadow-sm"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setAssignTargetZoneId(zone.id);
                                setAssignOpen(true);
                              }}
                            >
                              <Boxes className="h-4 w-4 mr-2 shrink-0" />
                              Assign nodes
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
              {shouldTruncate && zoneSummariesForView.length > 0 ? (
                <div className="flex flex-col items-center gap-3 pt-1">
                  <p className="text-sm text-muted-foreground text-center">
                    Showing{" "}
                    {zoneGridExpanded
                      ? zoneSummariesForView.length
                      : Math.min(MAX_ZONE_CARDS, zoneSummariesForView.length)}{" "}
                    of {zoneSummariesForView.length} zones
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full max-w-md shadow-sm border-2 flex items-center justify-center gap-2"
                    onClick={() => setZoneGridExpanded((v) => !v)}
                  >
                    {zoneGridExpanded ? (
                      <>
                        <ChevronUp className="h-5 w-5 shrink-0" aria-hidden />
                        Show fewer zones
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-5 w-5 shrink-0" aria-hidden />
                        View all zones ({zoneSummariesForView.length})
                      </>
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
