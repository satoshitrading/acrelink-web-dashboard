import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ZoneFilterValue } from "@/types/zone";
import {
  buildChartHistory,
  getChartSeriesKeys,
  mergeDailyHistoryByDepthWithToday,
  mergeDailyHistoryWithToday,
} from "@/lib/dashboard-chart-utils";
import {
  buildDepthChartHistorySingleNode,
  buildDepthChartHistoryZoneAllNodes,
  buildDepthChartHistoryZoneAverage,
  buildDepthSeriesKeysForNode,
  buildDepthSeriesKeysForZone,
  buildDepthSeriesKeysForZoneAllNodes,
  parseSeriesKey,
} from "@/lib/moisture-depth-series";
import { ref, get } from "firebase/database";
import { signOut } from "firebase/auth";
import { auth, database } from "@/lib/firebase";
import { getMoisturePercent } from "@/lib/dataTransform";
import { useZones } from "@/hooks/useZones";
import { getDateKey } from "@/lib/date-utils";
import {
  buildSingleNodeZoneSummary,
  findZoneContainingNode,
  getFilteredNodeIds,
  isNodeFilterValue,
  nodeIdFromZoneFilter,
} from "@/lib/zone-filter-utils";
import {
  buildZoneAverageDailySeries,
  ZONE_AVERAGE_DATA_KEY,
} from "@/lib/zone-moisture-aggregate";
import { useSensorDisplayNames } from "@/hooks/useSensorDisplayNames";
import { useSiteSensorThresholds } from "@/hooks/useSiteSensorThresholds";
import { useDepthLabelsByNode } from "@/hooks/useDepthLabelsByNode";
import { useSiteSensorsGps } from "@/hooks/useSiteSensorsGps";
import { useForecastEtDaily } from "@/hooks/useForecastEtDaily";
import { labelForDepthIndex } from "@/lib/depth-label-utils";
import { useToast } from "@/hooks/use-toast";
import { moistureStatusToChartHex } from "@/lib/moistureStatusPalette";
import { buildDryingForecastChart } from "@/lib/build-drying-forecast-chart";

export type DashboardTabValue = "overview" | "analytics" | "reports";

const DASHBOARD_TAB_STORAGE_KEY = "acrelink.dashboard.activeTab";

function readStoredDashboardTab(): DashboardTabValue {
  if (typeof window === "undefined") return "overview";
  try {
    const raw = window.localStorage.getItem(DASHBOARD_TAB_STORAGE_KEY);
    if (raw === "overview" || raw === "analytics" || raw === "reports") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "overview";
}

const DEFAULT_CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "#8B5CF6",
];

export function useDashboardController() {

  const navigate = useNavigate();
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [gatewayList, setGatewayList] = useState<string[]>([]);
  const [userSiteId, setUserSiteId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [availableSiteIds, setAvailableSiteIds] = useState<string[]>([]);
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [seasonStart, setSeasonStart] = useState("");
  const [seasonEnd, setSeasonEnd] = useState("");
  const [generatingReport, setGeneratingReport] = useState(false);
  const [showSmsOptInModal, setShowSmsOptInModal] = useState(false);

  const [zoneFilter, setZoneFilter] = useState<ZoneFilterValue>("all");
  const [wholeZoneChartMode, setWholeZoneChartMode] = useState<
    "nodes" | "zoneAverage"
  >("nodes");
  const [zonePanelOpen, setZonePanelOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTargetZoneId, setAssignTargetZoneId] = useState<string | null>(null);
  const [dashboardTab, setDashboardTab] = useState<DashboardTabValue>(() =>
    readStoredDashboardTab()
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_TAB_STORAGE_KEY, dashboardTab);
    } catch {
      /* ignore */
    }
  }, [dashboardTab]);

  const goToZoneTrends = useCallback((zoneId: string) => {
    setZoneFilter(zoneId);
    setDashboardTab("analytics");
    requestAnimationFrame(() => {
      setTimeout(() => {
        document
          .getElementById("moisture-trends-section")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    });
  }, [setZoneFilter, setDashboardTab]);

  const {
    zones,
    zoneSummaries,
    unassignedNodeIds,
    allNodeReadings,
    dailyHistoryByNode,
    dailyHistoryByDepth,
    totalNodeCount,
    onlineNodeCount,
    createZone,
    updateZone,
    deleteZone,
    assignNodesToZone,
    loading: zonesDataLoading,
  } = useZones(userSiteId);

  const sensorDisplayNames = useSensorDisplayNames(userSiteId);
  const { warn: sensorMoistureWarnByNode, crit: sensorMoistureCritByNode } = useSiteSensorThresholds(userSiteId);
  const depthLabelsByNode = useDepthLabelsByNode(userSiteId);
  const { gpsByNodeId } = useSiteSensorsGps(userSiteId);
  const { toast } = useToast();
  const breachToastKeysRef = useRef<Set<string>>(new Set());

  // Fetch user's siteId on mount
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
        setUserRole(userData.role);

        // If user is admin, bypass siteId restriction and pick the first available site
        if (userData.role === "admin") {
          try {
            const srSnapshot = await get(ref(database, `sensor-readings`));
            if (srSnapshot.exists()) {
              const keys = Object.keys(srSnapshot.val()).filter((k) => k && k.startsWith("siteId:"));
              if (keys.length > 0) {
                const siteIds = keys.map((k) => (k.startsWith("siteId:") ? k.split(":")[1] : k));
                // mark as admin and expose list
                setIsAdmin(true);
                setAvailableSiteIds(siteIds);
                // restore last selected site, or default to first
                const savedSite = localStorage.getItem("adminSelectedSite");
                const defaultSite = savedSite && siteIds.includes(savedSite) ? savedSite : siteIds[0];
                setUserSiteId(defaultSite);
                return;
              }
            }
          } catch (err) {
            console.error("Error finding first site for admin:", err);
          }
        }

        // Default behavior for non-admin users
        setIsAdmin(false);

        // Technician: may have multiple siteIds assigned
        if (userData.role === 'technician' && userData.siteIds && Array.isArray(userData.siteIds)) {
          if (userData.siteIds.length > 0) {
            setAvailableSiteIds(userData.siteIds);
            // restore last selected site, or default to first
            const savedSite = localStorage.getItem("technicianSelectedSite");
            const defaultSite = savedSite && userData.siteIds.includes(savedSite) ? savedSite : userData.siteIds[0];
            setUserSiteId(defaultSite);
          }
        } else {
          // Customer or single siteId user
          const siteId = userData.siteId;
          setUserSiteId(siteId);
        }
      }
    };

    fetchUserSiteId();
  }, [navigate]);

  // Check if gateway names need to be set on first load
  useEffect(() => {
    const checkGatewayNames = async () => {
      const user = auth.currentUser;
      if (!user || !userSiteId) return;

      // Only show gateway naming modal to customers, not admin or technician
      if (userRole !== "customer") return;

      // Check if gateway names have already been set
      const saved = localStorage.getItem("gatewayNames");
      if (saved) return; // Already named

      // Fetch gateways
      const gatewaysSnapshot = await get(
        ref(database, `sensor-readings/siteId:${userSiteId}/gateways`)
      );

      if (gatewaysSnapshot.exists()) {
        const gateways = Object.keys(gatewaysSnapshot.val()).filter(
          (id) => id && id !== "" && !id.endsWith(":")
        );

        if (gateways.length > 0) {
          setGatewayList(gateways);
          setShowGatewayModal(true);
        }
      }
    };

    checkGatewayNames();
  }, [userSiteId, userRole]);

  useEffect(() => {
    const promptSms = async () => {
      if (userRole !== "customer" || !userSiteId) return;
      if (localStorage.getItem("acrelinkSmsPromptDismissed") === "1") return;
      const user = auth.currentUser;
      if (!user) return;
      const snap = await get(ref(database, `users/${user.uid}`));
      if (!snap.exists()) return;
      const d = snap.val() as Record<string, unknown>;
      if (d.phone && String(d.phone).trim().length > 0) return;
      if (d.smsOptIn === true) return;
      setShowSmsOptInModal(true);
    };
    promptSms();
  }, [userRole, userSiteId]);

  const handleGatewayNamesSaved = () => {
    setShowGatewayModal(false);
  };
  const handleLogout = async () => {
    try {
      localStorage.removeItem("adminSelectedSite");
      localStorage.removeItem("technicianSelectedSite");
      await signOut(auth);
      navigate("/auth");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const handleAdminSiteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSite = e.target.value;
    setUserSiteId(newSite);
    // Save to appropriate localStorage key based on user role
    if (isAdmin) {
      localStorage.setItem("adminSelectedSite", newSite);
    } else {
      // Technician with multiple sites
      localStorage.setItem("technicianSelectedSite", newSite);
    }
    // Reset local UI state so new site data loads cleanly
    setGatewayList([]);
    setShowGatewayModal(false);
    setZoneFilter("all");
  };

  const [enabledSeries, setEnabledSeries] = useState<Record<string, boolean>>({});

  const handleToggleSeries = (key: string) => {
    setEnabledSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());
  const [chartView, setChartView] = useState<
    "moisture" | "depth" | "forecast"
  >("moisture");
  const [trendTimeRange, setTrendTimeRange] = useState<
    "24hr" | "7day" | "30day"
  >("7day");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalSensors, setTotalSensors] = useState(0);
  const [onlineSensors, setOnlineSensors] = useState(0);
  const [optimalBandRange, setOptimalBandRange] = useState<{ min: number; max: number }>(() => {
    try {
      const saved = localStorage.getItem("optimalBandRange");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.min === "number" && typeof parsed.max === "number" && parsed.min < parsed.max) {
          return parsed;
        }
      }
    } catch {
      /* ignore invalid saved optimal band JSON */
    }
    return { min: 40, max: 60 };
  });
  const [showRangeInput, setShowRangeInput] = useState(false);
  const [tempMin, setTempMin] = useState(optimalBandRange.min);
  const [tempMax, setTempMax] = useState(optimalBandRange.max);

  const handleApplyRange = () => {
    if (tempMin >= 0 && tempMax <= 120 && tempMin < tempMax) {
      setOptimalBandRange({ min: tempMin, max: tempMax });
      localStorage.setItem("optimalBandRange", JSON.stringify({ min: tempMin, max: tempMax }));
      setShowRangeInput(false);
    }
  };

  const liveMoistureByNode = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [id, r] of Object.entries(allNodeReadings)) {
      if (r.online) m[id] = r.moisture;
    }
    return m;
  }, [allNodeReadings]);

  const dailyHistoryMerged = useMemo(() => {
    const today = getDateKey(new Date());
    return mergeDailyHistoryWithToday(
      dailyHistoryByNode,
      today,
      liveMoistureByNode
    );
  }, [dailyHistoryByNode, liveMoistureByNode]);

  const liveMoistureByDepthByNode = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const [id, r] of Object.entries(allNodeReadings)) {
      if (!r.moistureByDepth) continue;
      if (Object.keys(r.moistureByDepth).length === 0) continue;
      m[id] = { ...r.moistureByDepth };
    }
    return m;
  }, [allNodeReadings]);

  const dailyHistoryMergedDepth = useMemo(() => {
    const today = getDateKey(new Date());
    return mergeDailyHistoryByDepthWithToday(
      dailyHistoryByDepth,
      today,
      liveMoistureByDepthByNode
    );
  }, [dailyHistoryByDepth, liveMoistureByDepthByNode]);

  const isWholeZoneView =
    zoneFilter !== "all" &&
    zoneFilter !== "unassigned" &&
    !isNodeFilterValue(zoneFilter);

  useEffect(() => {
    if (!isWholeZoneView) {
      setWholeZoneChartMode("nodes");
    }
  }, [zoneFilter, isWholeZoneView]);

  const moistureChartHistory = useMemo(() => {
    if (isWholeZoneView && wholeZoneChartMode === "zoneAverage") {
      const z = zones.find((zo) => zo.id === zoneFilter);
      if (!z) return {};
      const avgByDate = buildZoneAverageDailySeries(
        dailyHistoryMerged,
        z.nodeIds
      );
      const out: Record<string, Record<string, number>> = {};
      for (const dk of Object.keys(dailyHistoryMerged)) {
        const v = avgByDate[dk];
        if (v != null) {
          out[dk] = { [ZONE_AVERAGE_DATA_KEY]: v };
        }
      }
      return out;
    }
    return buildChartHistory(
      zoneFilter,
      zones,
      dailyHistoryMerged,
      unassignedNodeIds
    );
  }, [
    isWholeZoneView,
    wholeZoneChartMode,
    zoneFilter,
    zones,
    dailyHistoryMerged,
    unassignedNodeIds,
  ]);

  const moistureChartSeriesKeys = useMemo(() => {
    if (isWholeZoneView && wholeZoneChartMode === "zoneAverage") {
      return [ZONE_AVERAGE_DATA_KEY];
    }
    return getChartSeriesKeys(zoneFilter, zones, unassignedNodeIds);
  }, [
    isWholeZoneView,
    wholeZoneChartMode,
    zoneFilter,
    zones,
    unassignedNodeIds,
  ]);

  const depthChartHistory = useMemo(() => {
    if (zoneFilter === "all" || zoneFilter === "unassigned") return {};
    if (isNodeFilterValue(zoneFilter)) {
      const nid = nodeIdFromZoneFilter(zoneFilter);
      if (!nid) return {};
      return buildDepthChartHistorySingleNode(dailyHistoryMergedDepth, nid);
    }
    const z = zones.find((zo) => zo.id === zoneFilter);
    if (!z) return {};
    if (wholeZoneChartMode === "nodes") {
      return buildDepthChartHistoryZoneAllNodes(
        dailyHistoryMergedDepth,
        z.nodeIds
      );
    }
    return buildDepthChartHistoryZoneAverage(
      dailyHistoryMergedDepth,
      z.nodeIds
    );
  }, [zoneFilter, zones, dailyHistoryMergedDepth, wholeZoneChartMode]);

  const depthChartSeriesKeys = useMemo(() => {
    if (zoneFilter === "all" || zoneFilter === "unassigned") return [];
    if (isNodeFilterValue(zoneFilter)) {
      const nid = nodeIdFromZoneFilter(zoneFilter);
      if (!nid) return [];
      return buildDepthSeriesKeysForNode(
        nid,
        dailyHistoryMergedDepth,
        allNodeReadings
      );
    }
    const z = zones.find((zo) => zo.id === zoneFilter);
    if (!z) return [];
    if (wholeZoneChartMode === "nodes") {
      return buildDepthSeriesKeysForZoneAllNodes(
        z.nodeIds,
        dailyHistoryMergedDepth,
        allNodeReadings
      );
    }
    return buildDepthSeriesKeysForZone(
      z.nodeIds,
      dailyHistoryMergedDepth,
      allNodeReadings
    );
  }, [
    zoneFilter,
    zones,
    dailyHistoryMergedDepth,
    allNodeReadings,
    wholeZoneChartMode,
  ]);
  const forecastSeriesKeys = useMemo(() => {
    if (zoneFilter === "all" || zoneFilter === "unassigned") {
      return moistureChartSeriesKeys;
    }
    return depthChartSeriesKeys;
  }, [zoneFilter, moistureChartSeriesKeys, depthChartSeriesKeys]);

  const forecastSeriesHistory = useMemo(() => {
    if (zoneFilter === "all" || zoneFilter === "unassigned") {
      return moistureChartHistory;
    }
    return depthChartHistory;
  }, [zoneFilter, moistureChartHistory, depthChartHistory]);


  const chartHistory =
    chartView === "depth"
      ? depthChartHistory
      : chartView === "forecast"
        ? forecastSeriesHistory
        : moistureChartHistory;
  const chartSeriesKeys =
    chartView === "depth"
      ? depthChartSeriesKeys
      : chartView === "forecast"
        ? forecastSeriesKeys
        : moistureChartSeriesKeys;

  const filteredNodeIds = useMemo(
    () =>
      getFilteredNodeIds(
        zoneFilter,
        zones,
        unassignedNodeIds,
        allNodeReadings
      ),
    [zoneFilter, zones, unassignedNodeIds, allNodeReadings]
  );

  const forecastRepresentativeGps = useMemo(() => {
    const lats: number[] = [];
    const lngs: number[] = [];
    for (const id of filteredNodeIds) {
      const g = gpsByNodeId[id];
      if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
        lats.push(g.lat);
        lngs.push(g.lng);
      }
    }
    if (lats.length === 0) {
      for (const g of Object.values(gpsByNodeId)) {
        if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
          lats.push(g.lat);
          lngs.push(g.lng);
        }
      }
    }
    if (lats.length === 0)
      return { lat: null as number | null, lng: null as number | null };
    return {
      lat: lats.reduce((a, b) => a + b, 0) / lats.length,
      lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
    };
  }, [filteredNodeIds, gpsByNodeId]);

  const forecastEt = useForecastEtDaily(
    forecastRepresentativeGps.lat,
    forecastRepresentativeGps.lng
  );

  const chartSeriesKeyStr = `${chartView}:${chartSeriesKeys.join(",")}`;
  useEffect(() => {
    setEnabledSeries((prev) => {
      const next: Record<string, boolean> = {};
      for (const k of chartSeriesKeys) {
        next[k] = prev[k] ?? true;
      }
      return next;
    });
  }, [chartSeriesKeyStr, chartSeriesKeys, chartView]);

  const zoneSummariesForView = useMemo(() => {
    if (zoneFilter === "all") return zoneSummaries;
    if (zoneFilter === "unassigned") return [];
    if (isNodeFilterValue(zoneFilter)) {
      const nid = nodeIdFromZoneFilter(zoneFilter);
      if (!nid || !allNodeReadings[nid]) return [];
      return [
        buildSingleNodeZoneSummary(
          nid,
          allNodeReadings[nid],
          zones,
          userSiteId ?? "",
          sensorDisplayNames[nid]
        ),
      ];
    }
    return zoneSummaries.filter((z) => z.id === zoneFilter);
  }, [
    zoneFilter,
    zoneSummaries,
    allNodeReadings,
    zones,
    userSiteId,
    sensorDisplayNames,
  ]);

  useEffect(() => {
    if (!isNodeFilterValue(zoneFilter)) return;
    const nid = nodeIdFromZoneFilter(zoneFilter);
    if (nid && !allNodeReadings[nid]) {
      setZoneFilter("all");
    }
  }, [zoneFilter, allNodeReadings]);

  const zoneSectionLoading = !userSiteId || zonesDataLoading;

  const refreshData = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastUpdated(new Date().toLocaleTimeString());
      setIsRefreshing(false);
    }, 600);
  };

  useEffect(() => {
    const interval = setInterval(refreshData, 10000);
    return () => clearInterval(interval);
  }, []);

  const lowMoistureZones = zoneSummariesForView.filter(
    (z) =>
      z.status === "Dry" ||
      z.status === "Critical: Dry" ||
      z.status === "Critical: Saturated"
  );
  const criticalAndSaturatedZones = zoneSummariesForView.filter(
    (z) =>
      z.status === "Critical: Dry" || z.status === "Critical: Saturated"
  );
  const zoneOnTrack = zoneSummariesForView.filter(
    (z) =>
      z.status !== "Critical: Dry" && z.status !== "Critical: Saturated"
  );
  const percentageOnTrack =
    zoneSummariesForView.length > 0
      ? Math.round(
        (zoneOnTrack.length / zoneSummariesForView.length) * 100
      )
      : 0;
  const avgMoisture =
    zoneSummariesForView.length > 0
      ? Math.round(
        zoneSummariesForView.reduce((acc, z) => acc + z.avgMoisture, 0) /
        zoneSummariesForView.length
      )
      : 0;
  const waterSavedYTD = 197.8;
  const estimatedSavings = (waterSavedYTD * 45).toFixed(0);
  const sensorUptime = 98.4;
  const activeSensors = useMemo(
    () =>
      filteredNodeIds.filter((id) => allNodeReadings[id]?.online).length,
    [filteredNodeIds, allNodeReadings]
  );
  const offlineSensors = useMemo(
    () => Math.max(0, filteredNodeIds.length - activeSensors),
    [filteredNodeIds, activeSensors]
  );
  const avgBatteryVoltage =
    zoneSummariesForView.length > 0
      ? (
        zoneSummariesForView.reduce((acc, z) => acc + z.avgBattery, 0) /
        zoneSummariesForView.length
      ).toFixed(1)
      : "0.0";

  // No logout in standalone dashboard

  const generateReport = () => {
    // Default to current year as season range
    const now = new Date();
    const yearStart = `${now.getFullYear()}-01-01`;
    const today = now.toISOString().split("T")[0];
    setSeasonStart(yearStart);
    setSeasonEnd(today);
    setShowSeasonModal(true);
  };

  const downloadSeasonSummary = async () => {
    if (!seasonStart || !seasonEnd || !userSiteId) return;
    setGeneratingReport(true);
    try {
      const start = new Date(seasonStart);
      const end = new Date(seasonEnd);
      // Total days in season range
      const totalDays = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / 86400000) + 1
      );

      // Fetch all gateway/node/packet data
      const snap = await get(
        ref(database, `sensor-readings/siteId:${userSiteId}/gateways`)
      );
      if (!snap.exists()) return;

      const allGateways = snap.val();

      // DRY THRESHOLD: <=22 considered "dry or below"
      // OPTIMAL RANGE: >22 and <=34
      const DRY_THRESHOLD = 22;
      const OPTIMAL_MAX = 34;

      const rows: string[][] = [];
      rows.push([
        "Node ID",
        "Field Zone / Location",
        "Season Start",
        "Season End",
        "Uptime %",
        "Avg VWC %",
        "Min VWC %",
        "Max VWC %",
        "Days Below Dry Threshold",
        "Days in Optimal Range",
        "Battery V (Start of Season)",
        "Battery V (End of Season)",
      ]);

      interface SeasonPacket {
        timestamp: string;
        vwc: number;
        battery: number;
      }

      for (const gatewayId in allGateways) {
        if (!gatewayId || gatewayId.trim() === "" || gatewayId.endsWith(":"))
          continue;

        const gatewayData = allGateways[gatewayId];
        const zoneNameForNode = (nodeId: string) => {
          const z = zones.find((zo) => zo.nodeIds.includes(nodeId));
          return z?.name ?? "Unassigned";
        };

        for (const nodeKey in gatewayData) {
          if (!nodeKey.startsWith("nodeId:")) continue;

          // Node ID shown in CSV — strip "nodeId:" prefix
          const nodeId = nodeKey.replace("nodeId:", "");

          const node = gatewayData[nodeKey];
          const packets = node.packets || node;

          // Collect packets for this node within season range
          const seasonPackets: SeasonPacket[] = [];
          for (const packetId in packets) {
            const p = packets[packetId];
            if (!p.timestamp) continue;
            const ts = new Date(p.timestamp);
            if (ts < start || ts > end) continue;

            const vwc = getMoisturePercent(p.soil_raw);
            const battery =
              typeof p.battery_v === "number" ? p.battery_v : 0;
            seasonPackets.push({ timestamp: p.timestamp, vwc, battery });
          }

          if (seasonPackets.length === 0) {
            rows.push([
              nodeId,
              zoneNameForNode(nodeId),
              seasonStart,
              seasonEnd,
              "0%",
              "—",
              "—",
              "—",
              "—",
              "—",
              "—",
              "—",
            ]);
            continue;
          }

          // Sort by timestamp
          seasonPackets.sort((a, b) =>
            a.timestamp.localeCompare(b.timestamp)
          );

          // Build daily VWC buckets
          const dailyVWC: Record<string, number[]> = {};
          for (const p of seasonPackets) {
            const day = p.timestamp.split("T")[0];
            if (!dailyVWC[day]) dailyVWC[day] = [];
            dailyVWC[day].push(p.vwc);
          }

          const dailyAvgs: number[] = Object.values(dailyVWC).map(
            (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
          );

          const daysWithData = dailyAvgs.length;
          const uptime = Math.round((daysWithData / totalDays) * 100);
          const avgVWC =
            Math.round(
              (dailyAvgs.reduce((a, b) => a + b, 0) / dailyAvgs.length) * 10
            ) / 10;
          const minVWC = Math.round(Math.min(...dailyAvgs) * 10) / 10;
          const maxVWC = Math.round(Math.max(...dailyAvgs) * 10) / 10;
          const daysBelowDry = dailyAvgs.filter(
            (v) => v <= DRY_THRESHOLD
          ).length;
          const daysOptimal = dailyAvgs.filter(
            (v) => v > DRY_THRESHOLD && v <= OPTIMAL_MAX
          ).length;

          const batteryStart = seasonPackets[0].battery;
          const batteryEnd =
            seasonPackets[seasonPackets.length - 1].battery;

          rows.push([
            nodeId,
            zoneNameForNode(nodeId),
            seasonStart,
            seasonEnd,
            `${uptime}%`,
            `${avgVWC}%`,
            `${minVWC}%`,
            `${maxVWC}%`,
            String(daysBelowDry),
            String(daysOptimal),
            batteryStart > 0 ? `${batteryStart.toFixed(2)}V` : "—",
            batteryEnd > 0 ? `${batteryEnd.toFixed(2)}V` : "—",
          ]);
        }
      }

      const csv = rows
        .map((r) => r.map((cell) => `"${cell}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `season-summary-${seasonStart}-to-${seasonEnd}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setShowSeasonModal(false);
    } catch (err) {
      console.error("Error generating season summary:", err);
    } finally {
      setGeneratingReport(false);
    }
  };

  const fillSeriesNulls = (
    row: Record<string, number> | undefined
  ): Record<string, number | null> => {
    const out: Record<string, number | null> = {};
    for (const k of chartSeriesKeys) {
      out[k] = row?.[k] ?? null;
    }
    return out;
  };

  const trend7DayData = useMemo(() => {
    const now = new Date();
    const data_array: Record<string, unknown>[] = [];

    for (let i = -6; i <= 0; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      const dateKey = getDateKey(date);
      const dayLabel = date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      const historicalRow = chartHistory[dateKey];
      data_array.push({
        day: dayLabel,
        ...fillSeriesNulls(historicalRow),
      });
    }

    return data_array;
  }, [chartHistory, chartSeriesKeys]);

  const trend30DayData = useMemo(() => {
    const now = new Date();
    const data_array: Record<string, unknown>[] = [];

    for (let i = -29; i <= 0; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      const dateKey = getDateKey(date);
      const dayLabel = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      const historicalRow = chartHistory[dateKey];
      data_array.push({
        day: dayLabel,
        ...fillSeriesNulls(historicalRow),
      });
    }

    return data_array;
  }, [chartHistory, chartSeriesKeys]);

  const chartData = useMemo(() => {
    const now = new Date();
    const data_array: Record<string, unknown>[] = [];

    for (let i = -3; i <= 3; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      const dateKey = getDateKey(date);
      const dayLabel = date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      const dayData: Record<string, unknown> = { day: dayLabel };

      if (i <= 0) {
        const historicalRow = chartHistory[dateKey];
        Object.assign(dayData, fillSeriesNulls(historicalRow));
      } else {
        Object.assign(dayData, fillSeriesNulls(undefined));
      }

      data_array.push(dayData);
    }

    return data_array;
  }, [chartHistory, chartSeriesKeys]);

  // Generate 24-hour trend data from the same base as 7-day chart
  const trend24HrData = useMemo(() => {
    // chartData order: [-3, -2, -1, 0, +1, +2, +3]
    // 24-hour should show only yesterday and today
    return chartData.slice(2, 4);
  }, [chartData]);

  const dryingForecastBundle = useMemo(() => {
    return buildDryingForecastChart({
      now: new Date(),
      zoneFilter,
      zones,
      zoneSummaries,
      allNodeReadings,
      seriesKeys: forecastSeriesKeys,
      historyByDate: forecastSeriesHistory,
      etByIsoDate: forecastEt.byIsoDate,
      sensorWarnByNode: sensorMoistureWarnByNode,
      sensorCritByNode: sensorMoistureCritByNode,
    });
  }, [
    zoneFilter,
    zones,
    zoneSummaries,
    allNodeReadings,
    forecastSeriesKeys,
    forecastSeriesHistory,
    forecastEt.byIsoDate,
    sensorMoistureWarnByNode,
    sensorMoistureCritByNode,
  ]);

  const dryingForecastData = dryingForecastBundle.rows;
  const forecastMoistureWarnVwc = dryingForecastBundle.forecastWarnVwc;
  const forecastMoistureCritVwc = dryingForecastBundle.forecastCritVwc;
  const projectedIrrigationLabel = dryingForecastBundle.projectedIrrigationLabel;

  const dynamicAlerts = useMemo(() => {
    const now = new Date();
    const today = getDateKey(now);
    const yesterday = getDateKey(
      new Date(now.getTime() - 24 * 60 * 60 * 1000)
    );
    const twoDaysAgo = getDateKey(
      new Date(now.getTime() - 48 * 60 * 60 * 1000)
    );
    const threeDaysAgo = getDateKey(
      new Date(now.getTime() - 72 * 60 * 60 * 1000)
    );

    const alerts: {
      type: string;
      message: string;
      key: string;
    }[] = [];

    moistureChartSeriesKeys.forEach((key) => {
      const todayMoisture = moistureChartHistory[today]?.[key] ?? null;
      const yesterdayMoisture =
        moistureChartHistory[yesterday]?.[key] ?? null;
      const twoDaysAgoMoisture =
        moistureChartHistory[twoDaysAgo]?.[key] ?? null;
      const threeDaysAgoMoisture =
        moistureChartHistory[threeDaysAgo]?.[key] ?? null;

      const parent =
        key === ZONE_AVERAGE_DATA_KEY
          ? undefined
          : findZoneContainingNode(zones, key);
      const shortLabel = sensorDisplayNames[key] ?? key;
      const label =
        key === ZONE_AVERAGE_DATA_KEY
          ? zoneSummaries.find((z) => z.id === zoneFilter)?.name ?? key
          : zoneFilter === "all"
            ? zoneSummaries.find((z) => z.id === key)?.name ?? key
            : parent
              ? `${parent.name} · ${shortLabel}`
              : shortLabel;

      const status =
        key === ZONE_AVERAGE_DATA_KEY
          ? zoneSummaries.find((z) => z.id === zoneFilter)?.status ??
            "Optimal"
          : zoneFilter === "all"
            ? zoneSummaries.find((z) => z.id === key)?.status ?? "Optimal"
            : allNodeReadings[key]?.status ?? "Optimal";

      const dryingRateYesterday =
        yesterdayMoisture != null && todayMoisture != null
          ? yesterdayMoisture - todayMoisture
          : 0;
      const dryingRateTwoDays =
        twoDaysAgoMoisture != null && yesterdayMoisture != null
          ? twoDaysAgoMoisture - yesterdayMoisture
          : 0;
      const dryingRateThreeDays =
        threeDaysAgoMoisture != null && twoDaysAgoMoisture != null
          ? threeDaysAgoMoisture - twoDaysAgoMoisture
          : 0;

      const rates = [dryingRateTwoDays, dryingRateThreeDays].filter(
        (r) => r > 0
      );
      const avgHistoricalRate =
        rates.length > 0
          ? rates.reduce((a, b) => a + b) / rates.length
          : 0;

      const isFastDrying =
        dryingRateYesterday > avgHistoricalRate * 1.5 &&
        dryingRateYesterday > 2;

      if (isFastDrying) {
        alerts.push({
          type: "fast-drying",
          key,
          message: `${label} drying faster than normal`,
        });
      }

      const moistureDifference =
        yesterdayMoisture != null && twoDaysAgoMoisture != null
          ? Math.abs(yesterdayMoisture - twoDaysAgoMoisture)
          : 0;

      if (moistureDifference > 15 && status === "Optimal") {
        alerts.push({
          type: "uneven-wetting",
          key,
          message: `${label} uneven wetting last irrigation`,
        });
      }
    });

    return alerts;
  }, [
    moistureChartHistory,
    moistureChartSeriesKeys,
    zoneFilter,
    zoneSummaries,
    allNodeReadings,
    zones,
    sensorDisplayNames,
  ]);

  /* eslint-disable react-hooks/exhaustive-deps -- toast stable; avoid re-firing */
  useEffect(() => {
    if (!userSiteId) return;
    const active = new Set<string>();
    for (const z of zoneSummaries) {
      const th = z.moistureThresholdVwc;
      if (th == null || Number.isNaN(Number(th))) continue;
      if (z.avgMoisture < th) active.add(`zone:${z.id}`);
    }
    for (const [nid, r] of Object.entries(allNodeReadings)) {
      const th = sensorMoistureWarnByNode[nid];
      if (th == null || Number.isNaN(Number(th))) continue;
      if (r.online && r.moisture < th) active.add(`node:${nid}`);
    }
    for (const key of active) {
      if (breachToastKeysRef.current.has(key)) continue;
      breachToastKeysRef.current.add(key);
      const colon = key.indexOf(":");
      const kind = key.slice(0, colon);
      const id = key.slice(colon + 1);
      if (kind === "zone") {
        const z = zoneSummaries.find((zz) => zz.id === id);
        toast({
          title: "Moisture below zone threshold",
          description: z
            ? `${z.name} average (${z.avgMoisture}% VWC) is below your ${z.moistureThresholdVwc}% alert level.`
            : "Zone moisture is below your threshold.",
        });
      } else {
        toast({
          title: "Moisture below node threshold",
          description: `${sensorDisplayNames[id] ?? id} is below your alert level.`,
        });
      }
    }
    for (const k of [...breachToastKeysRef.current]) {
      if (!active.has(k)) breachToastKeysRef.current.delete(k);
    }
  }, [
    userSiteId,
    zoneSummaries,
    allNodeReadings,
    sensorMoistureWarnByNode,
    sensorDisplayNames,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const getSeriesChartColor = (key: string, idx: number) => {
    const parsed = parseSeriesKey(key);
    const colorKey =
      parsed && (chartView === "depth" || chartView === "forecast")
        ? parsed.entityId
        : key;

    if (colorKey === ZONE_AVERAGE_DATA_KEY) {
      const zs = zoneSummaries.find((z) => z.id === zoneFilter);
      return zs
        ? moistureStatusToChartHex(zs.status)
        : DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
    }
    if (zoneFilter === "all") {
      const zs = zoneSummaries.find((z) => z.id === colorKey);
      return zs
        ? moistureStatusToChartHex(zs.status)
        : DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
    }
    if (zoneFilter === "unassigned") {
      return DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
    }
    if (isNodeFilterValue(zoneFilter)) {
      const nid = nodeIdFromZoneFilter(zoneFilter);
      if (nid && colorKey === nid) {
        const r = allNodeReadings[nid];
        const st = !r?.online ? "Offline" : r?.status ?? "Optimal";
        return moistureStatusToChartHex(st);
      }
    }
    const r = allNodeReadings[colorKey];
    if (r) {
      const st = !r.online ? "Offline" : r.status ?? "Optimal";
      return moistureStatusToChartHex(st);
    }
    const zs = zoneSummaries.find((z) => z.id === zoneFilter);
    if (zs) {
      return moistureStatusToChartHex(zs.status);
    }
    return DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
  };

  const getSeriesChartName = (key: string) => {
    const parsed = parseSeriesKey(key);
    if (parsed && (chartView === "depth" || chartView === "forecast")) {
      if (parsed.entityId === ZONE_AVERAGE_DATA_KEY) {
        const zn = zones.find((zo) => zo.id === zoneFilter)?.name ?? "Zone";
        const zoneAvgKeys = chartSeriesKeys.filter((k) => {
          const p = parseSeriesKey(k);
          return p?.entityId === ZONE_AVERAGE_DATA_KEY;
        });
        if (zoneAvgKeys.length > 1) {
          return `${zn} · (average) · ${parsed.depthKey}`;
        }
        return `${zn} · (average)`;
      }

      const depthLabel =
        labelForDepthIndex(
          depthLabelsByNode[parsed.entityId],
          parsed.depthKey
        ) ?? `Depth ${parsed.depthKey}`;

      const nid = parsed.entityId;
      const p = findZoneContainingNode(zones, nid);
      const dn = sensorDisplayNames[nid] ?? nid;
      const base = p ? `${p.name} · ${dn}` : dn;
      return `${base} · ${depthLabel}`;
    }

    if (key === ZONE_AVERAGE_DATA_KEY) {
      const selectedZone = zones.find((zo) => zo.id === zoneFilter);
      return selectedZone ? `${selectedZone.name} (average)` : key;
    }
    if (zoneFilter === "all") {
      return zones.find((zo) => zo.id === key)?.name ?? key;
    }
    if (isNodeFilterValue(zoneFilter)) {
      const nid = nodeIdFromZoneFilter(zoneFilter);
      if (nid && key === nid) {
        const p = findZoneContainingNode(zones, nid);
        const dn = sensorDisplayNames[nid] ?? nid;
        return p ? `${p.name} · ${dn}` : dn;
      }
    }
    const p = findZoneContainingNode(zones, key);
    if (p && zoneFilter !== "unassigned") {
      const dn = sensorDisplayNames[key] ?? key;
      return `${p.name} · ${dn}`;
    }
    return sensorDisplayNames[key] ?? key;
  };

  const forecastChartHasEt = useMemo(
    () =>
      Object.values(forecastEt.byIsoDate).some(
        (v) => typeof v === "number" && v > 0
      ),
    [forecastEt.byIsoDate]
  );

  const forecastGpsAvailable =
    forecastRepresentativeGps.lat != null &&
    forecastRepresentativeGps.lng != null;


  return {
    navigate,
    showGatewayModal,
    setShowGatewayModal,
    gatewayList,
    setGatewayList,
    userSiteId,
    setUserSiteId,
    isAdmin,
    setIsAdmin,
    userRole,
    setUserRole,
    availableSiteIds,
    setAvailableSiteIds,
    showSeasonModal,
    setShowSeasonModal,
    showSmsOptInModal,
    setShowSmsOptInModal,
    seasonStart,
    setSeasonStart,
    seasonEnd,
    setSeasonEnd,
    generatingReport,
    setGeneratingReport,
    zoneFilter,
    setZoneFilter,
    wholeZoneChartMode,
    setWholeZoneChartMode,
    isWholeZoneView,
    zonePanelOpen,
    setZonePanelOpen,
    assignOpen,
    setAssignOpen,
    assignTargetZoneId,
    setAssignTargetZoneId,
    zones,
    zoneSummaries,
    unassignedNodeIds,
    allNodeReadings,
    dailyHistoryByNode,
    totalNodeCount,
    onlineNodeCount,
    createZone,
    updateZone,
    deleteZone,
    assignNodesToZone,
    zonesDataLoading,
    sensorDisplayNames,
    handleGatewayNamesSaved,
    handleLogout,
    handleAdminSiteChange,
    enabledSeries,
    setEnabledSeries,
    handleToggleSeries,
    lastUpdated,
    setLastUpdated,
    chartView,
    setChartView,
    trendTimeRange,
    setTrendTimeRange,
    isRefreshing,
    setIsRefreshing,
    totalSensors,
    setTotalSensors,
    onlineSensors,
    setOnlineSensors,
    optimalBandRange,
    setOptimalBandRange,
    showRangeInput,
    setShowRangeInput,
    tempMin,
    setTempMin,
    tempMax,
    setTempMax,
    handleApplyRange,
    liveMoistureByNode,
    dailyHistoryMerged,
    chartHistory,
    chartSeriesKeys,
    zoneSummariesForView,
    zoneSectionLoading,
    refreshData,
    lowMoistureZones,
    criticalAndSaturatedZones,
    zoneOnTrack,
    percentageOnTrack,
    avgMoisture,
    waterSavedYTD,
    estimatedSavings,
    sensorUptime,
    activeSensors,
    offlineSensors,
    avgBatteryVoltage,
    generateReport,
    downloadSeasonSummary,
    trend7DayData,
    trend30DayData,
    chartData,
    trend24HrData,
    dryingForecastData,
    forecastMoistureWarnVwc,
    forecastMoistureCritVwc,
    projectedIrrigationLabel,
    forecastChartHasEt,
    forecastGpsAvailable,
    forecastEtLoading: forecastEt.loading,
    forecastEtError: forecastEt.error,
    dynamicAlerts,
    getSeriesChartColor,
    getSeriesChartName,
    DEFAULT_CHART_COLORS,
    dashboardTab,
    setDashboardTab,
    goToZoneTrends,
    depthLabelsByNode,
  };
}
