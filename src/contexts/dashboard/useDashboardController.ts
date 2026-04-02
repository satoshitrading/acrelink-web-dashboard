import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { ZoneFilterValue } from "@/types/zone";
import {
  buildChartHistory,
  getChartSeriesKeys,
  mergeDailyHistoryWithToday,
} from "@/lib/dashboard-chart-utils";
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

  const [zoneFilter, setZoneFilter] = useState<ZoneFilterValue>("all");
  const [zonePanelOpen, setZonePanelOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTargetZoneId, setAssignTargetZoneId] = useState<string | null>(null);

  const {
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
    loading: zonesDataLoading,
  } = useZones(userSiteId);

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
  const [chartView, setChartView] = useState<"moisture" | "water" | "forecast">("moisture");
  const [trendTimeRange, setTrendTimeRange] = useState<"24hr" | "7day">("7day");
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

  const chartHistory = useMemo(
    () =>
      buildChartHistory(
        zoneFilter,
        zones,
        dailyHistoryMerged,
        unassignedNodeIds
      ),
    [zoneFilter, zones, dailyHistoryMerged, unassignedNodeIds]
  );

  const chartSeriesKeys = useMemo(
    () => getChartSeriesKeys(zoneFilter, zones, unassignedNodeIds),
    [zoneFilter, zones, unassignedNodeIds]
  );

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

  const chartSeriesKeyStr = chartSeriesKeys.join(",");
  useEffect(() => {
    setEnabledSeries((prev) => {
      const next: Record<string, boolean> = {};
      for (const k of chartSeriesKeys) {
        next[k] = prev[k] ?? true;
      }
      return next;
    });
  }, [chartSeriesKeyStr]);

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
          userSiteId ?? ""
        ),
      ];
    }
    return zoneSummaries.filter((z) => z.id === zoneFilter);
  }, [zoneFilter, zoneSummaries, allNodeReadings, zones, userSiteId]);

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

  const dryingForecastData = useMemo(() => {
    const now = new Date();
    const today = getDateKey(now);
    const yesterday = getDateKey(
      new Date(now.getTime() - 24 * 60 * 60 * 1000)
    );
    const twoDaysAgo = getDateKey(
      new Date(now.getTime() - 48 * 60 * 60 * 1000)
    );

    const forecastData: Record<string, unknown>[] = [];

    const todayData: Record<string, unknown> = {
      day: now.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    };

    const getCurrentMoisture = (key: string): number => {
      if (zoneFilter === "all") {
        return zoneSummaries.find((z) => z.id === key)?.avgMoisture ?? 0;
      }
      return allNodeReadings[key]?.moisture ?? 0;
    };

    chartSeriesKeys.forEach((key) => {
      todayData[key] = getCurrentMoisture(key);
    });
    forecastData.push(todayData);

    const dryingRates: Record<string, number> = {};
    chartSeriesKeys.forEach((key) => {
      const todayMoisture =
        chartHistory[today]?.[key] ?? getCurrentMoisture(key);
      const yesterdayMoisture = chartHistory[yesterday]?.[key] ?? null;
      const twoDaysAgoMoisture = chartHistory[twoDaysAgo]?.[key] ?? null;

      const rates: number[] = [];
      if (
        yesterdayMoisture != null &&
        todayMoisture != null
      ) {
        rates.push(yesterdayMoisture - todayMoisture);
      }
      if (
        twoDaysAgoMoisture != null &&
        yesterdayMoisture != null
      ) {
        rates.push(twoDaysAgoMoisture - yesterdayMoisture);
      }

      dryingRates[key] =
        rates.length > 0
          ? Math.max(1, rates.reduce((a, b) => a + b) / rates.length)
          : 1.5;
    });

    for (let i = 1; i <= 6; i++) {
      const futureDate = new Date(now);
      futureDate.setDate(now.getDate() + i);
      const dayLabel = futureDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      const dayData: Record<string, unknown> = { day: dayLabel };

      chartSeriesKeys.forEach((key) => {
        const currentMoisture =
          chartHistory[today]?.[key] ?? getCurrentMoisture(key);
        const forecastedMoisture = Math.max(
          0,
          currentMoisture - dryingRates[key] * i
        );
        dayData[key] = Math.round(forecastedMoisture * 10) / 10;
      });

      forecastData.push(dayData);
    }

    return forecastData;
  }, [
    chartHistory,
    chartSeriesKeys,
    zoneFilter,
    zoneSummaries,
    allNodeReadings,
  ]);

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

    chartSeriesKeys.forEach((key) => {
      const todayMoisture = chartHistory[today]?.[key] ?? null;
      const yesterdayMoisture = chartHistory[yesterday]?.[key] ?? null;
      const twoDaysAgoMoisture = chartHistory[twoDaysAgo]?.[key] ?? null;
      const threeDaysAgoMoisture = chartHistory[threeDaysAgo]?.[key] ?? null;

      const parent = findZoneContainingNode(zones, key);
      const label =
        zoneFilter === "all"
          ? zoneSummaries.find((z) => z.id === key)?.name ?? key
          : parent
            ? `${parent.name} · ${key}`
            : key;

      const status =
        zoneFilter === "all"
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
    chartHistory,
    chartSeriesKeys,
    zoneFilter,
    zoneSummaries,
    allNodeReadings,
    zones,
  ]);

  const getSeriesChartColor = (key: string, idx: number) => {
    if (zoneFilter === "all") {
      const z = zones.find((zo) => zo.id === key);
      return (
        z?.color ?? DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length]
      );
    }
    if (zoneFilter === "unassigned") {
      return DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
    }
    if (isNodeFilterValue(zoneFilter)) {
      const nid = nodeIdFromZoneFilter(zoneFilter);
      const p = nid ? findZoneContainingNode(zones, nid) : undefined;
      return p?.color ?? DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
    }
    const selectedZone = zones.find((zo) => zo.id === zoneFilter);
    if (selectedZone) {
      return selectedZone.color;
    }
    return DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length];
  };

  const getSeriesChartName = (key: string) => {
    if (zoneFilter === "all") {
      return zones.find((zo) => zo.id === key)?.name ?? key;
    }
    if (isNodeFilterValue(zoneFilter)) {
      const nid = nodeIdFromZoneFilter(zoneFilter);
      if (nid && key === nid) {
        const p = findZoneContainingNode(zones, nid);
        return p ? `${p.name} · ${nid}` : nid;
      }
    }
    const p = findZoneContainingNode(zones, key);
    if (p && zoneFilter !== "unassigned") {
      return `${p.name} · ${key}`;
    }
    return key;
  };


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
    seasonStart,
    setSeasonStart,
    seasonEnd,
    setSeasonEnd,
    generatingReport,
    setGeneratingReport,
    zoneFilter,
    setZoneFilter,
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
    chartData,
    trend24HrData,
    dryingForecastData,
    dynamicAlerts,
    getSeriesChartColor,
    getSeriesChartName,
    DEFAULT_CHART_COLORS,
  };
}
