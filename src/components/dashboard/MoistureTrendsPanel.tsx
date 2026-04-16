import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
  ComposedChart,
  Bar,
} from "recharts";
import { ChartTooltip } from "@/components/dashboard/ChartTooltip";
import { SensorDepthLabelsModal } from "@/components/dashboard/SensorDepthLabelsModal";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";
import { ZoneSelector } from "@/components/ZoneSelector";
import {
  isNodeFilterValue,
  nodeIdFromZoneFilter,
} from "@/lib/zone-filter-utils";

export function MoistureTrendsPanel() {
  const {
    chartView,
    setChartView,
    optimalBandRange,
    showRangeInput,
    setShowRangeInput,
    tempMin,
    setTempMin,
    tempMax,
    setTempMax,
    handleApplyRange,
    trendTimeRange,
    setTrendTimeRange,
    trend24HrData,
    trend7DayData,
    trend30DayData,
    dryingForecastData,
    forecastChartHasEt,
    forecastGpsAvailable,
    forecastEtLoading,
    forecastEtError,
    forecastMoistureWarnVwc,
    forecastMoistureCritVwc,
    projectedIrrigationLabel,
    chartSeriesKeys,
    enabledSeries,
    handleToggleSeries,
    getSeriesChartColor,
    getSeriesChartName,
    isWholeZoneView,
    wholeZoneChartMode,
    setWholeZoneChartMode,
    zoneFilter,
    setZoneFilter,
    zoneSummaries,
    zones,
    unassignedNodeIds,
    sensorDisplayNames,
    depthLabelsByNode,
    zoneSectionLoading,
  } = useDashboard();
  const [depthLabelsModalOpen, setDepthLabelsModalOpen] = useState(false);

  const depthNeedsSelection =
    chartView === "depth" &&
    (zoneFilter === "all" || zoneFilter === "unassigned");

  const subtitle =
    chartView === "forecast"
      ? forecastChartHasEt
        ? "ET₀-driven projected VWC (dashed) from current readings; ET₀ from Open-Meteo."
        : forecastGpsAvailable
          ? forecastEtLoading
            ? "Loading ET₀ overlay…"
            : forecastEtError
              ? `ET overlay unavailable (${forecastEtError}). Moisture projection only.`
              : "Projected drying trend. ET overlay will appear when forecast data is available."
          : "Projected drying trend. ET overlay requires sensor GPS saved in Service."
      : chartView === "depth"
        ? "Historical VWC by soil depth for the selected zone or node (one line per depth)."
        : `Historical data • Green shaded area is optimal moisture (${optimalBandRange.max}%–${optimalBandRange.min}%)`;

  const chartTitle =
    chartView === "forecast"
      ? "Drying Forecast"
      : chartView === "depth"
        ? "Depth Breakdown"
        : "Soil Moisture";

  const depthLabelEditNodeIds = useMemo(() => {
    if (chartView !== "depth" || depthNeedsSelection) return [];
    if (isNodeFilterValue(zoneFilter)) {
      const nid = nodeIdFromZoneFilter(zoneFilter);
      return nid ? [nid] : [];
    }
    const selectedZone = zones.find((z) => z.id === zoneFilter);
    return selectedZone ? selectedZone.nodeIds : [];
  }, [chartView, depthNeedsSelection, zoneFilter, zones]);

  const depthTrendData =
    trendTimeRange === "24hr"
      ? trend24HrData
      : trendTimeRange === "30day"
        ? trend30DayData
        : trend7DayData;

  /** Right-axis domain for ET₀ bars: padded so bars use less vertical space than auto domain. */
  const forecastEtAxisDomain = useMemo((): [number, number] => {
    const rows = dryingForecastData as Record<string, unknown>[];
    const etVals: number[] = [];
    for (const row of rows) {
      const v = row.et0;
      if (typeof v === "number" && Number.isFinite(v)) etVals.push(v);
    }
    if (etVals.length === 0) return [0, 12];
    const maxEt = Math.max(...etVals);
    if (maxEt <= 0) return [0, 12];
    const MIN_UPPER_MM = 10;
    const upper = Math.max(
      maxEt * 1.35,
      maxEt + 1.5,
      MIN_UPPER_MM
    );
    return [0, Math.ceil(upper * 10) / 10];
  }, [dryingForecastData]);

  return (
    <Card
      id="moisture-trends-section"
      className=" mb-8 shadow-industrial-lg border-2 border-border/50 pb-4"
    >
      <CardHeader className="main-content-section">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4 lg:justify-between">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-[clamp(20px,2vw,30px)] font-display font-bold">
                {chartTitle}
              </CardTitle>
              <p className="text-[clamp(14px,2vw,18px)] text-muted-foreground">
                {subtitle}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end shrink-0 w-full lg:w-auto">
              {/* {chartView === "depth" && !depthNeedsSelection && (
                <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 self-stretch sm:self-auto">
                  <Button
                    onClick={() => setDepthLabelsModalOpen(true)}
                    variant="default"
                    size="sm"
                    className="text-xs"
                  >
                    Edit depth labels
                  </Button>
                </div>
              )} */}
              {isWholeZoneView &&
                (chartView === "moisture" ||
                  chartView === "forecast" ||
                  chartView === "depth") && (
                <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 self-stretch sm:self-auto">
                  <Button
                    type="button"
                    variant={
                      wholeZoneChartMode === "nodes" ? "default" : "ghost"
                    }
                    size="sm"
                    className="text-xs rounded-sm"
                    onClick={() => setWholeZoneChartMode("nodes")}
                  >
                    All node lines
                  </Button>
                  <Button
                    type="button"
                    variant={
                      wholeZoneChartMode === "zoneAverage" ? "default" : "ghost"
                    }
                    size="sm"
                    className="text-xs rounded-sm"
                    onClick={() => setWholeZoneChartMode("zoneAverage")}
                  >
                    Zone average
                  </Button>
                </div>
              )}
              <ZoneSelector
                className="min-w-0 w-full sm:max-w-[min(100%,380px)]"
                value={zoneFilter}
                onChange={setZoneFilter}
                zones={zoneSummaries}
                unassignedNodeIds={unassignedNodeIds}
                nodeLabel={(id) => sensorDisplayNames[id] ?? id}
                disabled={zoneSectionLoading}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end flex-wrap">
            <div className="relative flex gap-2 flex-col">
              <Button
                onClick={() => setShowRangeInput(!showRangeInput)}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                Set Range ({optimalBandRange.max}-{optimalBandRange.min})
              </Button>
              {showRangeInput && (
                <div className="flex gap-2 bg-card border-2 border-border rounded-lg p-4 absolute right-0 top-full mt-2 z-50 shadow-lg w-max">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-foreground">Max</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={tempMax}
                      onChange={(e) => setTempMax(Math.min(120, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                      className="w-20 px-2 py-1.5 border border-border rounded text-sm bg-background text-foreground"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-foreground">Min</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={tempMin}
                      onChange={(e) => setTempMin(Math.min(120, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                      className="w-20 px-2 py-1.5 border border-border rounded text-sm bg-background text-foreground"
                    />
                  </div>
                  <Button onClick={handleApplyRange} size="sm" className="text-xs self-end h-9">
                    Apply
                  </Button>
                </div>
              )}
            </div>
            <Button
              onClick={() => setChartView("moisture")}
              variant={chartView === "moisture" ? "default" : "outline"}
              size="sm"
              className="text-xs"
            >
              Soil Moisture
            </Button>
            {/* <Button
              onClick={() => setChartView("depth")}
              variant={chartView === "depth" ? "default" : "outline"}
              size="sm"
              className="text-xs"
            >
              Depth Breakdown
            </Button> */}
            <Button
              onClick={() => setChartView("forecast")}
              variant={chartView === "forecast" ? "default" : "outline"}
              size="sm"
              className="text-xs"
            >
              Drying Forecast
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="main-content-section">
        {chartView === "moisture" && (
          <>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart
                data={
                  trendTimeRange === "24hr"
                    ? trend24HrData
                    : trendTimeRange === "30day"
                      ? trend30DayData
                      : trend7DayData
                }
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <ReferenceArea
                  y1={optimalBandRange.min}
                  y2={optimalBandRange.max}
                  stroke={undefined}
                  fill="#b6e7b0"
                  fillOpacity={0.4}
                />
                <XAxis
                  dataKey="day"
                  stroke="hsl(var(--muted-foreground))"
                  style={{ fontSize: "12px", fontWeight: 500 }}
                />
                <YAxis
                  domain={[0, 75]}
                  ticks={[0, 15, 30, 45, 60, 75]}
                  label={{
                    value: "Moisture %",
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "hsl(var(--muted-foreground))" },
                  }}
                  stroke="hsl(var(--muted-foreground))"
                  style={{ fontSize: "12px", fontWeight: 500 }}
                />
                <Tooltip content={<ChartTooltip />} />
                {chartSeriesKeys.map((key, idx) => {
                  const color = getSeriesChartColor(key, idx);
                  return (
                    enabledSeries[key] !== false && (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={color}
                        name={getSeriesChartName(key)}
                        strokeWidth={3}
                        connectNulls
                        dot={idx === chartSeriesKeys.length - 1 ? { r: 4 } : undefined}
                      />
                    )
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-2 mt-4">
              <Button
                onClick={() => setTrendTimeRange("24hr")}
                variant={trendTimeRange === "24hr" ? "default" : "outline"}
                size="sm"
                className="text-xs"
              >
                24-Hour
              </Button>
              <Button
                onClick={() => setTrendTimeRange("7day")}
                variant={trendTimeRange === "7day" ? "default" : "outline"}
                size="sm"
                className="text-xs"
              >
                7-Day
              </Button>
              <Button
                onClick={() => setTrendTimeRange("30day")}
                variant={trendTimeRange === "30day" ? "default" : "outline"}
                size="sm"
                className="text-xs"
              >
                30-Day
              </Button>
            </div>
            <div className="flex justify-center flex-wrap gap-6 mt-4 mb-2">
              {chartSeriesKeys.map((key, idx) => {
                const color = getSeriesChartColor(key, idx);
                return (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabledSeries[key] ?? true}
                      onChange={() => handleToggleSeries(key)}
                      style={{ accentColor: color }}
                      className="w-5 h-5 rounded focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                    />
                    <span
                      className="whitespace-nowrap text-[clamp(14px,2vw,16px)]"
                      style={{ color, fontWeight: 600 }}
                      title={getSeriesChartName(key)}
                    >
                      {getSeriesChartName(key)}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}

        {chartView === "depth" && (
          <>
            {depthNeedsSelection ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-muted-foreground">
                Select a zone or an individual node above to view soil moisture by depth.
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={depthTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <ReferenceArea
                      y1={optimalBandRange.min}
                      y2={optimalBandRange.max}
                      stroke={undefined}
                      fill="#b6e7b0"
                      fillOpacity={0.35}
                    />
                    <XAxis
                      dataKey="day"
                      stroke="hsl(var(--muted-foreground))"
                      style={{ fontSize: "12px", fontWeight: 500 }}
                    />
                    <YAxis
                      domain={[0, 75]}
                      ticks={[0, 15, 30, 45, 60, 75]}
                      label={{
                        value: "Moisture %",
                        angle: -90,
                        position: "insideLeft",
                        style: { fill: "hsl(var(--muted-foreground))" },
                      }}
                      stroke="hsl(var(--muted-foreground))"
                      style={{ fontSize: "12px", fontWeight: 500 }}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    {chartSeriesKeys.map((key, idx) => {
                      const color = getSeriesChartColor(key, idx);
                      return (
                        enabledSeries[key] !== false && (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            stroke={color}
                            name={getSeriesChartName(key)}
                            strokeWidth={3}
                            connectNulls
                            dot={idx === chartSeriesKeys.length - 1 ? { r: 4 } : undefined}
                          />
                        )
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
                {chartSeriesKeys.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground -mt-32 mb-8 relative z-10 pointer-events-none">
                    No depth data for this selection yet.
                  </p>
                )}
                <p className="text-center text-xs text-muted-foreground mt-2">
                  {trendTimeRange === "24hr"
                    ? "24-hour window"
                    : trendTimeRange === "30day"
                      ? "30-day window"
                      : "7-day window"}{" "}
                  •{" "}
                  {isWholeZoneView && wholeZoneChartMode === "nodes"
                    ? "one line per depth for each node in the zone."
                    : isWholeZoneView && wholeZoneChartMode === "zoneAverage"
                      ? "one line per depth (zone average)."
                      : "one line per depth (zone average or selected node)."}
                </p>
                <div className="flex justify-center gap-2 mt-3">
                  <Button
                    onClick={() => setTrendTimeRange("24hr")}
                    variant={trendTimeRange === "24hr" ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                  >
                    24-Hour
                  </Button>
                  <Button
                    onClick={() => setTrendTimeRange("7day")}
                    variant={trendTimeRange === "7day" ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                  >
                    7-Day
                  </Button>
                  <Button
                    onClick={() => setTrendTimeRange("30day")}
                    variant={trendTimeRange === "30day" ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                  >
                    30-Day
                  </Button>
                </div>
                <div className="flex justify-center flex-wrap gap-6 mt-4 mb-2">
                  {chartSeriesKeys.map((key, idx) => {
                    const color = getSeriesChartColor(key, idx);
                    return (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enabledSeries[key] ?? true}
                          onChange={() => handleToggleSeries(key)}
                          style={{ accentColor: color }}
                          className="w-5 h-5 rounded focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                        />
                        <span
                          className="whitespace-nowrap text-[clamp(14px,2vw,16px)]"
                          style={{ color, fontWeight: 600 }}
                          title={getSeriesChartName(key)}
                        >
                          {getSeriesChartName(key)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {chartView === "forecast" && (
          <>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={dryingForecastData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="day"
                  stroke="hsl(var(--muted-foreground))"
                  style={{ fontSize: "12px", fontWeight: 500 }}
                />
                <YAxis
                  yAxisId="left"
                  domain={[0, 100]}
                  label={{
                    value: "Moisture %",
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "hsl(var(--muted-foreground))" },
                  }}
                  stroke="hsl(var(--muted-foreground))"
                  style={{ fontSize: "12px", fontWeight: 500 }}
                />
                {forecastChartHasEt && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={forecastEtAxisDomain}
                    label={{
                      value: "ET₀ (mm/day)",
                      angle: 90,
                      position: "insideRight",
                      style: { fill: "hsl(var(--muted-foreground))" },
                    }}
                    stroke="hsl(var(--muted-foreground))"
                    style={{ fontSize: "12px", fontWeight: 500 }}
                  />
                )}
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                {forecastMoistureWarnVwc != null && (
                  <ReferenceLine
                    yAxisId="left"
                    y={forecastMoistureWarnVwc}
                    stroke="hsl(var(--chart-4))"
                    strokeDasharray="6 4"
                    label={{
                      value: `Warning ${forecastMoistureWarnVwc}%`,
                      position: "insideTopRight",
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    }}
                  />
                )}
                {forecastMoistureCritVwc != null && (
                  <ReferenceLine
                    yAxisId="left"
                    y={forecastMoistureCritVwc}
                    stroke="hsl(var(--destructive))"
                    strokeDasharray="6 4"
                    label={{
                      value: `Critical ${forecastMoistureCritVwc}%`,
                      position: "insideBottomRight",
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    }}
                  />
                )}
                {chartSeriesKeys.map((key, idx) => {
                  const color = getSeriesChartColor(key, idx);
                  return (
                    enabledSeries[key] !== false && (
                      <Line
                        yAxisId="left"
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={color}
                        name={getSeriesChartName(key)}
                        strokeWidth={3}
                        strokeDasharray="5 5"
                        connectNulls
                      />
                    )
                  );
                })}
                {forecastChartHasEt && (
                  <Bar
                    yAxisId="right"
                    dataKey="et0"
                    name="ET₀ (mm/day)"
                    fill="hsl(var(--chart-2))"
                    fillOpacity={0.38}
                    barSize={12}
                    radius={[3, 3, 0, 0]}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-center text-sm text-muted-foreground mt-3 px-2">
              {projectedIrrigationLabel}
            </p>
            <div className="flex justify-center gap-6 mt-4 mb-2 flex-wrap">
              {chartSeriesKeys.map((key, idx) => {
                const color = getSeriesChartColor(key, idx);
                return (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabledSeries[key] ?? true}
                      onChange={() => handleToggleSeries(key)}
                      style={{ accentColor: color }}
                      className="w-5 h-5 rounded"
                    />
                    <span style={{ color, fontWeight: 600 }} title={getSeriesChartName(key)}>
                      {getSeriesChartName(key)}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
      <SensorDepthLabelsModal
        open={depthLabelsModalOpen}
        onOpenChange={setDepthLabelsModalOpen}
        nodeIds={depthLabelEditNodeIds}
        sensorDisplayNames={sensorDisplayNames}
        depthLabelsByNode={depthLabelsByNode}
      />
    </Card>
  );
}
