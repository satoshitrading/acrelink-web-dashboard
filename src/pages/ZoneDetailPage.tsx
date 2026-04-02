import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Droplet, Battery, Signal, AlertCircle, Loader } from "lucide-react";
import { auth, database } from "@/lib/firebase";
import { ref, get } from "firebase/database";
import { getBatteryStatusColor, getSignalStatusColor, getMoistureStatusColors } from "@/lib/sensor-status-utils";
import { useZones } from "@/hooks/useZones";

const ZoneDetailPage = () => {
  const { zoneId } = useParams<{ zoneId: string }>();
  const navigate = useNavigate();
  const [userSiteId, setUserSiteId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserSiteId = async () => {
      const user = auth.currentUser;
      if (!user) {
        navigate("/auth");
        return;
      }

      const userSnapshot = await get(ref(database, `users/${user.uid}`));
      if (userSnapshot.exists()) {
        const userData = userSnapshot.val();

        if (userData.role === "admin") {
          const savedSite = localStorage.getItem("adminSelectedSite");
          if (savedSite) {
            setUserSiteId(savedSite);
          }
        } else if (
          userData.role === "technician" &&
          userData.siteIds &&
          Array.isArray(userData.siteIds)
        ) {
          const savedSite = localStorage.getItem("technicianSelectedSite");
          const siteId =
            savedSite && userData.siteIds.includes(savedSite)
              ? savedSite
              : userData.siteIds[0];
          setUserSiteId(siteId);
        } else {
          setUserSiteId(userData.siteId);
        }
      }
    };

    fetchUserSiteId();
  }, [navigate]);

  const { zones, allNodeReadings, loading } = useZones(userSiteId);

  const zone = useMemo(
    () => zones.find((z) => z.id === zoneId),
    [zones, zoneId]
  );

  const nodeRows = useMemo(() => {
    if (!zone) return [];
    return zone.nodeIds.map((nid) => ({
      nodeId: nid,
      reading: allNodeReadings[nid],
    }));
  }, [zone, allNodeReadings]);

  if (!userSiteId || loading) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading zone details...</p>
        </div>
      </div>
    );
  }

  if (!zoneId || !zone) {
    return (
      <div className="min-h-screen gradient-hero">
        <div className="bg-card border-b-2 border-border/50 sticky top-0 z-40 shadow-industrial">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/")}
              className="mb-4 border-border bg-muted/50 text-foreground shadow-sm hover:bg-muted/80"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-display font-bold text-foreground">Error</h1>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <Card className="border-2 border-destructive/60 bg-destructive/10">
            <CardContent className="p-6">
              <p className="text-destructive font-semibold">
                Zone not found or you don&apos;t have access.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero">
      <div className="bg-card border-b-2 border-border/50 sticky top-0 z-40 shadow-industrial">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/")}
              className="border-border bg-muted/50 text-foreground shadow-sm hover:bg-muted/80"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Dashboard
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="h-10 w-10 rounded-lg shrink-0 border-2 border-border"
              style={{ backgroundColor: zone.color }}
            />
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">
                {zone.name}
              </h1>
              <p className="text-muted-foreground mt-1">
                {nodeRows.length} node{nodeRows.length !== 1 ? "s" : ""} in this zone
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {nodeRows.length === 0 ? (
          <Card className="border-2">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">
                No nodes assigned. Use Manage zones on the dashboard to assign sensors.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="mb-8">
            <h2 className="text-2xl font-display font-bold text-foreground mb-6">
              Node details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {nodeRows.map(({ nodeId, reading }) => {
                const packet = reading;
                const isOffline = !packet || !packet.online;
                const statusColors = isOffline
                  ? getMoistureStatusColors("Offline")
                  : getMoistureStatusColors(packet.status);

                return (
                  <Card
                    key={nodeId}
                    className={`shadow-industrial border-2 hover-lift group relative overflow-hidden ${statusColors.border}`}
                  >
                    <div className={`absolute top-0 left-0 w-full h-1.5 ${statusColors.bar}`} />
                    <CardContent className="p-5 pt-7">
                      <div className="flex items-start justify-between mb-4">
                        <h3 className="text-lg font-mono font-bold text-foreground break-all">
                          NodeID: {nodeId}
                        </h3>
                        {(isOffline ||
                          (!isOffline &&
                            (packet.status === "Critical: Dry" ||
                              packet.status === "Dry" ||
                              packet.status === "Saturated"))) && (
                          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground mb-3">
                        Gateway {packet?.gatewayId?.replace(/^gatewayId:/, "") ?? "—"}
                      </p>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground flex items-center">
                            <Droplet className="h-3.5 w-3.5 mr-1.5 text-primary" />
                            Moisture
                          </span>
                          <span className="font-bold text-foreground">
                            {isOffline ? "—" : `${packet.moisture}%`}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground flex items-center">
                            <Battery className="h-3.5 w-3.5 mr-1.5" />
                            Battery
                          </span>
                          {isOffline ? (
                            <span className="font-bold text-foreground">—</span>
                          ) : (
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded ${getBatteryStatusColor(packet.batteryVoltage)} ${getBatteryStatusColor(packet.batteryVoltage).text}`}
                            >
                              {
                                getBatteryStatusColor(packet.batteryVoltage)
                                  .status
                              }
                            </span>
                          )}
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground flex items-center">
                            <Signal className="h-3.5 w-3.5 mr-1.5" />
                            Signal
                          </span>
                          {isOffline ? (
                            <span className="font-bold text-foreground">—</span>
                          ) : (
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded ${getSignalStatusColor(packet.signal)} ${getSignalStatusColor(packet.signal).text}`}
                            >
                              {getSignalStatusColor(packet.signal).status}
                            </span>
                          )}
                        </div>

                        <div className="pt-3 mt-3 border-t-2 border-border">
                          <p
                            className={`font-display font-bold text-sm flex items-center justify-center ${statusColors.text}`}
                          >
                            {isOffline ? "Offline" : packet.status}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZoneDetailPage;
