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
  BarChart,
  Bar,
} from "recharts";
import { ChartTooltip } from "@/components/dashboard/ChartTooltip";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";

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
    dryingForecastData,
    chartSeriesKeys,
    enabledSeries,
    handleToggleSeries,
    getSeriesChartColor,
    getSeriesChartName,
  } = useDashboard();

  return (
    <Card className=" mb-8 shadow-industrial-lg border-2 border-border/50">
      <CardHeader className="main-content-section">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ">
          <div>
            <CardTitle className="text-[clamp(20px,2vw,30px)] font-display font-bold">Moisture Trends by Zone</CardTitle>
            <p className="text-[clamp(14px,2vw,18px)] text-muted-foreground">
              {chartView === "forecast"
                ? `Projected drying trend`
                : `Historical data • Green Shaded Area is Optimal Moisture Zone (${optimalBandRange.max}%-${optimalBandRange.min}%)`}
            </p>
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
            <Button
              onClick={() => setChartView("forecast")}
              variant={chartView === "forecast" ? "default" : "outline"}
              size="sm"
              className="text-xs"
            >
              Drying Forecast (7 day future)
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="main-content-section">
        {chartView === "moisture" && (
          <>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={trendTimeRange === "24hr" ? trend24HrData : trend7DayData}>
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
            {chartView === "moisture" && (
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
              </div>
            )}
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

        {chartView === "water" && (
          <div style={{ width: "100%", minWidth: 0 }}>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={[
                  { week: "Week 1", applied: 8.2, et0: 9.1 },
                  { week: "Week 2", applied: 11.5, et0: 10.8 },
                  { week: "Week 3", applied: 9.8, et0: 11.2 },
                  { week: "Week 4", applied: 12.4, et0: 12.6 },
                ]}
                margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="week"
                  stroke="hsl(var(--muted-foreground))"
                  style={{ fontSize: "12px", fontWeight: 500 }}
                />
                <YAxis
                  label={{
                    value: "acre-feet",
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "hsl(var(--muted-foreground))" },
                  }}
                  stroke="hsl(var(--muted-foreground))"
                  style={{ fontSize: "12px", fontWeight: 500 }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="applied" fill="hsl(var(--primary))" name="Water Applied (acre-feet)" />
                <Bar dataKey="et0" fill="hsl(var(--chart-2))" name="ET₀ Reference (acre-feet)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {chartView === "forecast" && (
          <>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground text-end">
                <span className="text-muted-foreground font-semibold" />
              </p>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={dryingForecastData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="day"
                  stroke="hsl(var(--muted-foreground))"
                  style={{ fontSize: "12px", fontWeight: 500 }}
                />
                <YAxis
                  domain={[0, 100]}
                  label={{
                    value: "Forecasted Moisture %",
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
                        strokeDasharray="5 5"
                        connectNulls
                      />
                    )
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
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
    </Card>
  );
}
