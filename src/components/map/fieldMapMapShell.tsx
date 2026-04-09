import { useEffect, useMemo, useCallback, useState, useRef } from "react";
import { TileLayer, useMap } from "react-leaflet";
import { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { LocateFixed } from "lucide-react";
import { toast } from "sonner";

export const DEFAULT_MAP_CENTER: [number, number] = [39.8283, -98.5795];
export const DEFAULT_MAP_ZOOM = 4;
export const LOCATE_ME_ZOOM = 15;

export const PANE_ZONES = "acrelinkZones";
export const PANE_NODES = "acrelinkNodes";

export function MapInteractionPanes() {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane(PANE_ZONES)) {
      const p = map.createPane(PANE_ZONES);
      p.style.zIndex = "450";
    }
    if (!map.getPane(PANE_NODES)) {
      const p = map.createPane(PANE_NODES);
      p.style.zIndex = "650";
    }
  }, [map]);
  return null;
}

export type BasemapPreset = {
  id: string;
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom: number;
  isSatellite: boolean;
};

function buildBasemapPresets(): BasemapPreset[] {
  return [
    {
      id: "esri-services",
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution:
        'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19,
      maxNativeZoom: 19,
      isSatellite: true,
    },
    {
      id: "esri-server",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution:
        'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19,
      maxNativeZoom: 19,
      isSatellite: true,
    },
    {
      id: "osm-streets",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      maxNativeZoom: 19,
      isSatellite: false,
    },
  ];
}

const TILE_ERRORS_BEFORE_FALLBACK = 12;

/** Tries satellite sources in order; falls back to OSM streets if tiles keep failing. */
export function ResilientBasemapLayer({
  onActivePresetChange,
}: {
  onActivePresetChange?: (preset: BasemapPreset) => void;
}) {
  const presets = useMemo(() => buildBasemapPresets(), []);
  const [index, setIndex] = useState(0);
  const errorStreakRef = useRef(0);
  const preset = presets[Math.min(index, presets.length - 1)];

  useEffect(() => {
    onActivePresetChange?.(preset);
  }, [preset, onActivePresetChange]);

  const bumpFallback = useCallback(() => {
    setIndex((i) => {
      if (i >= presets.length - 1) return i;
      return i + 1;
    });
    errorStreakRef.current = 0;
  }, [presets.length]);

  return (
    <TileLayer
      key={preset.id}
      url={preset.url}
      attribution={preset.attribution}
      maxZoom={preset.maxZoom}
      maxNativeZoom={preset.maxNativeZoom}
      eventHandlers={{
        tileerror: () => {
          errorStreakRef.current += 1;
          if (errorStreakRef.current >= TILE_ERRORS_BEFORE_FALLBACK) {
            bumpFallback();
          }
        },
        tileload: () => {
          errorStreakRef.current = 0;
        },
      }}
    />
  );
}

export function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 12);
      return;
    }
    const b = new LatLngBounds(positions);
    map.fitBounds(b, { padding: [28, 28], maxZoom: 15 });
  }, [map, positions]);
  return null;
}

/** Must be rendered inside MapContainer. */
export function LocateMeMapControl() {
  const map = useMap();
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported in this browser.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.flyTo([coords.latitude, coords.longitude], LOCATE_ME_ZOOM);
        setBusy(false);
      },
      (err) => {
        setBusy(false);
        toast.error(
          err.message ? `Location error: ${err.message}` : "Could not get your location."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 }
    );
  }, [map]);

  return (
    <div className="leaflet-top leaflet-right" style={{ margin: 12 }}>
      <div className="leaflet-control leaflet-bar">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-9 w-9 rounded-sm border-0 bg-background shadow-sm hover:bg-muted"
          disabled={busy}
          aria-label="Locate me — center map on my position"
          onClick={handleClick}
        >
          <LocateFixed className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Call from a child of MapContainer when the map may have been hidden (e.g. layout). */
export function MapInvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const t = window.setTimeout(() => {
      map.invalidateSize();
    }, 0);
    return () => window.clearTimeout(t);
  }, [map]);
  return null;
}
