/** Recharts tooltip — shared by moisture / forecast charts */
export function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (active && payload && payload.length) {
    const sortedPayload = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return (
      <div
        style={{
          backgroundColor: "hsl(var(--card))",
          border: "2px solid hsl(var(--border))",
          borderRadius: "8px",
          padding: "8px 12px",
          fontWeight: 600,
        }}
      >
        <p style={{ marginBottom: "8px", fontWeight: 700 }}>{label}</p>
        {sortedPayload.map((entry, index) => {
          const isEt =
            typeof entry.name === "string" &&
            (entry.name.includes("ET₀") || entry.name.includes("ET"));
          const valueStr =
            entry.value == null
              ? "—"
              : isEt
                ? `${entry.value} mm/day`
                : `${entry.value}%`;
          return (
            <p key={index} style={{ color: entry.color, margin: "10px 0", fontSize: "14px" }}>
              {entry.name}: {valueStr}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
}
