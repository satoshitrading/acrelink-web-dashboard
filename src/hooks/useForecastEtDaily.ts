import { useEffect, useState } from "react";

type EtState = {
  /** ISO date YYYY-MM-DD → ET₀ mm/day */
  byIsoDate: Record<string, number>;
  loading: boolean;
  error: string | null;
};

/**
 * Open-Meteo ET₀ (FAO) daily forecast for the given coordinates (no API key).
 */
export function useForecastEtDaily(
  lat: number | null,
  lng: number | null
): EtState {
  const [state, setState] = useState<EtState>({
    byIsoDate: {},
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (
      lat == null ||
      lng == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      setState({ byIsoDate: {}, loading: false, error: null });
      return;
    }

    const latR = Math.round(lat * 1e4) / 1e4;
    const lngR = Math.round(lng * 1e4) / 1e4;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latR}&longitude=${lngR}` +
      `&daily=et0_fao_evapotranspiration&forecast_days=8&timezone=auto`;

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`ET forecast HTTP ${r.status}`);
        return r.json() as Promise<{
          daily?: {
            time?: string[];
            et0_fao_evapotranspiration?: (number | null)[];
          };
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        const times = data.daily?.time ?? [];
        const vals = data.daily?.et0_fao_evapotranspiration ?? [];
        const byIsoDate: Record<string, number> = {};
        for (let i = 0; i < times.length; i++) {
          const t = times[i];
          const v = vals[i];
          if (typeof t !== "string" || v == null || Number.isNaN(Number(v)))
            continue;
          byIsoDate[t] = Math.round(Number(v) * 10) / 10;
        }
        setState({ byIsoDate, loading: false, error: null });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setState({
          byIsoDate: {},
          loading: false,
          error: e.message ?? "ET fetch failed",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return state;
}
