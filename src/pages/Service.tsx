/**
 * Service.tsx
 * Place at: src/pages/Service.tsx  (replaces existing file)
 *
 * Changes from previous version:
 *  - localStorage removed entirely
 *  - All state sourced from Firebase via useServiceData hook
 *  - Live telemetry (battery, RF, lastSeen) merged from sensor-readings tree
 *  - saveSensor / logServiceEvent / saveSite write to serviceData/ branch
 *  - Service history pulled from serviceEvents on panel open
 *  - Tech name sourced from Firebase Auth currentUser.displayName
 *  - Auth-gated: redirects to /auth if not signed in
 */

import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { QrCode, Wifi, Battery, Clock, Signal } from "lucide-react";
import acreLinkLogo from "@/assets/acrelink-logo.png";
import { toast } from "react-toastify";
import { Modal } from "@/components/ui/modal";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { auth } from "@/lib/firebase";
import { useServiceData, Sensor, SensorStatus } from "@/hooks/useServiceData";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const metersToFeet = (m: number) => m * 3.28084;

const rfColorClass = (rf?: string): string => {
  if (rf === "Good") return "text-green-600";
  if (rf === "Fair") return "text-yellow-600";
  if (rf === "Poor") return "text-red-500";
  return "text-muted-foreground";
};

const statusBadgeClass = (status?: SensorStatus): string => {
  switch (status) {
    case "Installed":      return "bg-green-100 text-green-700 border-green-300";
    case "Planned":        return "bg-blue-100 text-blue-700 border-blue-300";
    case "Needs service":  return "bg-yellow-100 text-yellow-700 border-yellow-300";
    case "Offline":        return "bg-red-100 text-red-700 border-red-300";
    default:               return "bg-gray-100 text-gray-600 border-gray-300";
  }
};

// ─── Component ────────────────────────────────────────────────────────────────

const Service: React.FC = () => {
  const navigate = useNavigate();

  const {
    sites,
    sensors,
    loading,
    error,
    saveSensor,
    saveSite,
    logServiceEvent,
    fetchHistory,
  } = useServiceData();

  // Auth guard — redirect if not signed in
  useEffect(() => {
    if (!auth.currentUser) navigate("/auth");
  }, [navigate]);

  // Tech name from Firebase Auth
  const techName = auth.currentUser?.displayName ?? auth.currentUser?.email ?? "Tech";

  const [selectedSiteId, setSelectedSiteId] = useState("none");
  const [searchTerm, setSearchTerm] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingSensor, setEditingSensor] = useState<Sensor | null>(null);
  const [sensorHistory, setSensorHistory] = useState<string[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [selectedSensors, setSelectedSensors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [newSite, setNewSite] = useState({ id: "", name: "", info: "" });

  // ── Filter + sort sensors by site and search ──────────────────────────────
  const visibleSensors = useMemo(() => {
    return sensors
      .filter((s) => s.siteId === selectedSiteId)
      .filter((s) => {
        if (!searchTerm) return true;
        const t = searchTerm.toLowerCase();
        return (
          s.id.toLowerCase().includes(t) ||
          (s.label ?? "").toLowerCase().includes(t)
        );
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [sensors, selectedSiteId, searchTerm]);

  // ── Auto-select on exact search match ────────────────────────────────────
  useEffect(() => {
    if (!searchTerm) return;
    const match = visibleSensors.find(
      (s) => s.id.toLowerCase() === searchTerm.toLowerCase()
    );
    if (match && !selectedSensors.includes(match.id)) {
      setSelectedSensors((prev) => [...prev, match.id]);
      setSearchTerm("");
    }
  }, [searchTerm, visibleSensors, selectedSensors]);

  // ── Open panel: new sensor ────────────────────────────────────────────────
  const openCreate = () => {
    if (selectedSiteId === "none") return toast.warn("Select a site first");
    setEditingSensor({
      id: "",
      siteId: selectedSiteId,
      depth: undefined,
      installDate: format(new Date(), "yyyy-MM-dd"),
      gps: null,
      status: "Planned",
      notes: "",
    });
    setSensorHistory([]);
    setPanelOpen(true);
  };

  // ── Open panel: edit existing sensor ─────────────────────────────────────
  const openEdit = async (sensor: Sensor) => {
    setEditingSensor(JSON.parse(JSON.stringify(sensor)));
    setSensorHistory([]);
    setPanelOpen(true);
    setHistoryLoading(true);
    const history = await fetchHistory(sensor.id);
    setSensorHistory(history);
    setHistoryLoading(false);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingSensor(null);
    setSensorHistory([]);
  };

  // ── Save sensor to Firebase ───────────────────────────────────────────────
  const handleSaveSensor = async (sensor: Sensor) => {
    const id = sensor.id.trim();
    if (!id) return toast.error("Sensor ID cannot be empty");
    if (!sensor.depth) return toast.error("Please select a depth");

    setSaving(true);
    try {
      await saveSensor({ ...sensor, siteId: selectedSiteId });
      closePanel();
      toast.success(`Saved ${id}`);
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Log service event ─────────────────────────────────────────────────────
  const handleSaveSelection = async () => {
    if (!selectedSensors.length) return toast.warn("No sensors selected");
    setSaving(true);
    try {
      await logServiceEvent({
        techName,
        nodeIds: selectedSensors,
        remarks,
        siteId: selectedSiteId,
      });
      toast.success("Service event logged ✅");
      setSelectedSensors([]);
      setRemarks("");
    } catch (e: any) {
      toast.error(`Failed to log: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Save new site ─────────────────────────────────────────────────────────
  const handleSaveNewSite = async () => {
    if (!newSite.name.trim()) return toast.error("Site name is required");
    if (!newSite.info.trim()) return toast.error("Site info is required");
    if (sites.some((s) => s.id === newSite.id)) return toast.error("Site ID already exists");

    setSaving(true);
    try {
      await saveSite(newSite);
      toast.success("Site added ✅");
      setAddSiteOpen(false);
      setNewSite({ id: "", name: "", info: "" });
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── GPS capture ───────────────────────────────────────────────────────────
  const captureGPS = () => {
    if (!editingSensor) return;
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setEditingSensor((prev) =>
          prev
            ? {
                ...prev,
                gps: {
                  lat: coords.latitude,
                  lng: coords.longitude,
                  accuracyFt: Math.round(metersToFeet(coords.accuracy || 0)),
                  capturedAt: new Date().toISOString(),
                },
              }
            : prev
        );
        toast.success("GPS captured");
      },
      (err) => toast.error("GPS error: " + err.message)
    );
  };

  const generateSiteId = (name: string) =>
    name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  // ─── Render ──────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500 p-8">
        <div className="text-center space-y-2">
          <p className="font-semibold text-lg">Firebase connection error</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Nav ── */}
      <nav className="bg-card border-b-2 border-border/50 sticky top-0 z-50 shadow-industrial">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src={acreLinkLogo}
              alt="AcreLink"
              className="h-12 w-auto drop-shadow-md"
            />
            <h1 className="text-[clamp(18px,2vw,24px)] font-display font-bold text-foreground">
              AcreLink Service
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Tech: <span className="font-medium">{techName}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/")}
              className="hidden md:flex"
            >
              ← Dashboard
            </Button>
          </div>
        </div>
      </nav>

      <div className="min-h-screen bg-gray-50 text-gray-900 max-w-7xl mx-auto px-6 py-8">
        {/* ── Page header ── */}
        <div className="mb-8">
          <h2 className="text-[clamp(23px,2vw,36px)] font-display font-bold text-foreground">
            Service Mode
          </h2>
          <p className="text-[clamp(14px,2vw,18px)] text-muted-foreground">
            Tag sensors, capture GPS, and log install or service visits.
          </p>
        </div>

        {/* ── Step 1: Site selector ── */}
        <Card className="mb-8 shadow-industrial-lg border-2 border-primary/40 bg-gradient-to-br from-primary/5 to-accent/5">
          <CardHeader className="border-b-2 border-border/50 bg-card/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[clamp(20px,2vw,30px)] font-display font-semibold">
                Select site
              </CardTitle>
              <button
                onClick={() => setAddSiteOpen(true)}
                className="px-4 py-2 rounded-md bg-primary text-white hover:bg-primary/90 text-sm font-medium"
              >
                + Add Site
              </button>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            {loading ? (
              <div className="py-6 text-center text-muted-foreground text-sm animate-pulse">
                Loading sites...
              </div>
            ) : (
              <>
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger className="h-[60px] md:h-[70px] border-2 rounded-lg p-4">
                    <SelectValue placeholder="Select a site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="opacity-60 text-md">Select a site</span>
                    </SelectItem>
                    {sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        <div className="flex flex-col text-start">
                          <span className="font-semibold text-md">{site.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {site.info} · {site.planned} sensor{site.planned !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* ── Step 2: Sensor list ── */}
                {selectedSiteId !== "none" && (
                  <section className="mt-8 mb-4">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold">
                        Sensors on this site
                      </h2>
                      <Button onClick={openCreate} size="sm">
                        + Add Sensor
                      </Button>
                    </div>

                    {/* Gmail-style chip + search */}
                    <div className="mb-2 border rounded-lg px-3 py-2 bg-white min-h-[50px] flex flex-wrap gap-2 items-center">
                      {selectedSensors.map((id) => (
                        <span
                          key={id}
                          className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 text-xs rounded-full flex items-center gap-2"
                        >
                          {id}
                          <button
                            onClick={() =>
                              setSelectedSensors((prev) =>
                                prev.filter((s) => s !== id)
                              )
                            }
                            className="hover:text-red-600"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      <input
                        className="outline-none flex-1 text-lg h-[38px] md:h-[45px] min-w-[120px]"
                        placeholder={
                          selectedSensors.length === 0 ? "Search sensors..." : ""
                        }
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>

                    {/* Sensor results dropdown */}
                    {searchTerm.trim() !== "" && (
                      <div className="space-y-2 max-h-[40vh] overflow-auto border rounded-lg px-3 py-2 bg-white">
                        {visibleSensors
                          .filter((s) => !selectedSensors.includes(s.id))
                          .map((s) => (
                            <div
                              key={s.id}
                              onClick={() => {
                                setSelectedSensors((prev) => [...prev, s.id]);
                                setSearchTerm("");
                              }}
                              className="cursor-pointer rounded-lg p-3 shadow-sm hover:bg-blue-50 hover:border-blue-400 transition bg-yellow-50 border-l-4 border-yellow-400"
                            >
                              <div className="flex gap-3 items-center justify-between flex-wrap">
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-md truncate">
                                    {s.id}
                                    {s.label && (
                                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                                        {s.label}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground flex flex-wrap gap-3 mt-1">
                                    <span>Depth: {s.depth ?? "—"}</span>
                                    <span>
                                      GPS:{" "}
                                      {s.gps
                                        ? `±${s.gps.accuracyFt} ft`
                                        : "Not captured"}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeClass(s.status)}`}
                                    >
                                      {s.status ?? "—"}
                                    </span>
                                  </div>
                                  {/* Live telemetry */}
                                  {(s.battery || s.rf || s.lastSeen) && (
                                    <div className="flex flex-wrap gap-3 mt-1.5">
                                      {s.battery && (
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                          <Battery className="h-3 w-3" />
                                          {s.battery}
                                        </span>
                                      )}
                                      {s.rf && (
                                        <span
                                          className={`flex items-center gap-1 text-xs font-medium ${rfColorClass(s.rf)}`}
                                        >
                                          <Signal className="h-3 w-3" />
                                          {s.rf}
                                          {s.rssi !== undefined &&
                                            ` (${s.rssi} dBm)`}
                                        </span>
                                      )}
                                      {s.lastSeen && (
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                          <Clock className="h-3 w-3" />
                                          {s.lastSeen}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {s.notes && (
                                    <div className="text-sm mt-1.5 text-muted-foreground">
                                      <span className="font-medium">Note: </span>
                                      <span
                                        className="prose prose-sm inline"
                                        dangerouslySetInnerHTML={{
                                          __html: s.notes,
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {s.installDate
                                      ? format(
                                          new Date(s.installDate),
                                          "MMM d, yyyy"
                                        )
                                      : ""}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEdit(s);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}

                        {visibleSensors.filter(
                          (s) => !selectedSensors.includes(s.id)
                        ).length === 0 && (
                          <p className="text-sm text-muted-foreground p-3">
                            No matching sensors. Use "+ Add Sensor" to create one.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Remarks */}
                    <div className="mt-6">
                      <label className="text-lg font-semibold">Remarks</label>
                      <textarea
                        className="w-full mt-2 p-3 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary text-md"
                        rows={3}
                        placeholder="Notes for this service visit..."
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                      />
                    </div>

                    {/* Save selection */}
                    <div className="mt-4 flex justify-end">
                      <Button
                        size="lg"
                        className="shadow-industrial hover-glow h-12 px-6"
                        onClick={handleSaveSelection}
                        disabled={saving || !selectedSensors.length}
                      >
                        {saving ? "Saving..." : "Save Selection"}
                      </Button>
                    </div>
                  </section>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Sensor detail slide-over panel ── */}
        {panelOpen && editingSensor && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute inset-y-0 right-0 w-full md:w-[640px] bg-white overflow-auto shadow-2xl">
              {/* Panel nav */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between z-10">
                <button
                  onClick={closePanel}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  ← Back
                </button>
                <div className="text-lg font-semibold">
                  {editingSensor.id ? `Node ${editingSensor.id}` : "New Sensor"}
                </div>
                <div style={{ width: 48 }} />
              </div>

              <div className="p-5 space-y-6 pb-32">
                {/* Node ID */}
                <div>
                  <Label className="text-sm font-semibold">NodeID</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      className="flex-1 bg-white font-mono text-sm"
                      placeholder="e.g. 246F280001A2"
                      value={editingSensor.id}
                      onChange={(e) =>
                        setEditingSensor((prev) =>
                          prev ? { ...prev, id: e.target.value.trim() } : prev
                        )
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      title="Scan QR code"
                      onClick={() => toast.info("QR scan — coming soon")}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter the node MAC address or scan the QR inside the enclosure.
                  </p>
                </div>

                {/* Live telemetry card — only shown when node has data */}
                {(editingSensor.battery ||
                  editingSensor.rf ||
                  editingSensor.lastSeen) && (
                  <div>
                    <Label className="text-sm font-semibold">Live telemetry</Label>
                    <div className="mt-2 rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Battery className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {editingSensor.battery ?? "—"}
                        </span>
                      </div>
                      <div
                        className={`flex items-center gap-2 text-sm font-medium ${rfColorClass(editingSensor.rf)}`}
                      >
                        <Wifi className="h-4 w-4" />
                        <span>
                          {editingSensor.rf ?? "—"}
                          {editingSensor.rssi !== undefined &&
                            ` · ${editingSensor.rssi} dBm`}
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Last seen: {editingSensor.lastSeen ?? "—"}</span>
                      </div>
                      {editingSensor.soil_raw !== undefined && (
                        <div className="col-span-2 text-sm text-muted-foreground">
                          Soil raw:{" "}
                          <span className="font-medium text-foreground">
                            {editingSensor.soil_raw}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Depth */}
                <div>
                  <Label className="text-sm font-semibold">Depth</Label>
                  <Select
                    value={editingSensor.depth ?? ""}
                    onValueChange={(val) =>
                      setEditingSensor((prev) =>
                        prev
                          ? { ...prev, depth: val as Sensor["depth"] }
                          : prev
                      )
                    }
                  >
                    <SelectTrigger className="mt-2 h-[48px] bg-white text-sm">
                      <SelectValue placeholder="Select depth" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Shallow (0–6 in)">
                        Shallow (0–6 in)
                      </SelectItem>
                      <SelectItem value="Medium (6–12 in)">
                        Medium (6–12 in)
                      </SelectItem>
                      <SelectItem value="Deep (12–24 in)">
                        Deep (12–24 in)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Install Date */}
                <div>
                  <Label className="text-sm font-semibold">Install Date</Label>
                  <Input
                    type="date"
                    className="mt-2 h-12 bg-white text-sm"
                    value={
                      editingSensor.installDate ??
                      format(new Date(), "yyyy-MM-dd")
                    }
                    onChange={(e) =>
                      setEditingSensor((prev) =>
                        prev ? { ...prev, installDate: e.target.value } : prev
                      )
                    }
                  />
                </div>

                {/* GPS capture */}
                <div>
                  <Label className="text-sm font-semibold">GPS capture</Label>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm">
                    <div className="rounded-lg border border-gray-300 bg-white p-3 text-muted-foreground">
                      Latitude:{" "}
                      <span className="font-medium text-foreground font-mono">
                        {editingSensor.gps?.lat ?? "—"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-gray-300 bg-white p-3 text-muted-foreground">
                      Longitude:{" "}
                      <span className="font-medium text-foreground font-mono">
                        {editingSensor.gps?.lng ?? "—"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-gray-300 bg-white p-3 text-muted-foreground">
                      Accuracy:{" "}
                      <span className="font-medium text-foreground">
                        {editingSensor.gps
                          ? `±${editingSensor.gps.accuracyFt} ft`
                          : "—"}
                      </span>
                    </div>
                    {editingSensor.gps && (
                      <p className="text-xs text-muted-foreground">
                        Captured{" "}
                        {new Date(
                          editingSensor.gps.capturedAt
                        ).toLocaleString()}
                      </p>
                    )}
                    <div className="flex justify-end mt-1">
                      <Button size="sm" onClick={captureGPS}>
                        Capture GPS
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <Label className="text-sm font-semibold">Status</Label>
                  <Select
                    value={editingSensor.status ?? "Planned"}
                    onValueChange={(val) =>
                      setEditingSensor((prev) =>
                        prev
                          ? { ...prev, status: val as SensorStatus }
                          : prev
                      )
                    }
                  >
                    <SelectTrigger className="mt-2 h-[48px] bg-white text-sm">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Planned">Planned</SelectItem>
                      <SelectItem value="Installed">Installed</SelectItem>
                      <SelectItem value="Needs service">Needs service</SelectItem>
                      <SelectItem value="Offline">Offline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes (rich text) */}
                <div>
                  <Label className="text-sm font-semibold">Notes</Label>
                  <div className="mt-2 bg-white border rounded-lg overflow-hidden">
                    <ReactQuill
                      theme="snow"
                      value={editingSensor.notes ?? ""}
                      onChange={(value) =>
                        setEditingSensor((prev) =>
                          prev ? { ...prev, notes: value } : prev
                        )
                      }
                      placeholder="Install details, location landmarks, issues, etc."
                      className="text-sm [&_.ql-container]:min-h-[120px]"
                    />
                  </div>
                </div>

                {/* Service history */}
                <div>
                  <Label className="text-sm font-semibold">Service history</Label>
                  <div className="mt-2 bg-gray-50 rounded-lg border border-gray-200 p-3 text-sm min-h-[60px]">
                    {historyLoading ? (
                      <p className="text-muted-foreground animate-pulse">
                        Loading history...
                      </p>
                    ) : sensorHistory.length ? (
                      <ul className="list-disc pl-5 space-y-1.5">
                        {sensorHistory.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">
                        No service history yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Sticky save bar */}
              <div className="fixed bottom-0 right-0 w-full md:w-[640px] p-4 bg-white border-t border-gray-200 flex gap-3">
                <div className="ml-auto flex gap-3">
                  <Button
                    onClick={() =>
                      handleSaveSensor({
                        ...editingSensor,
                        siteId: selectedSiteId,
                      })
                    }
                    disabled={saving}
                    className="min-w-[120px]"
                  >
                    {saving ? "Saving..." : "Save sensor"}
                  </Button>
                  <Button variant="ghost" onClick={closePanel}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Site Modal ── */}
      <Modal
        open={addSiteOpen}
        onOpenChange={setAddSiteOpen}
        title="Add New Site"
        description="Create a new site for managing sensors"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Site Name</Label>
            <Input
              placeholder="e.g. Parker Ranch"
              value={newSite.name}
              onChange={(e) => {
                const name = e.target.value;
                setNewSite({ ...newSite, name, id: generateSiteId(name) });
              }}
            />
            {newSite.id && (
              <p className="text-xs text-muted-foreground">
                ID: <span className="font-mono">{newSite.id}</span>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Site Info</Label>
            <Input
              placeholder="e.g. Hay Farm"
              value={newSite.info}
              onChange={(e) =>
                setNewSite({ ...newSite, info: e.target.value })
              }
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setAddSiteOpen(false);
                setNewSite({ id: "", name: "", info: "" });
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveNewSite} disabled={saving}>
              {saving ? "Saving..." : "Save Site"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Service;

