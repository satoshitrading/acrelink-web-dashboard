import { database } from "@/lib/firebase";
import { DEFAULT_ZONE_COLOR, normalizeZoneColor } from "@/lib/zoneColor";
import type { Zone } from "@/types/zone";
import {
  ref,
  onValue,
  push,
  update,
  remove,
  get,
  set,
  Unsubscribe,
} from "firebase/database";

const ZONES_PATH = "serviceData/zones";
const SENSORS_PATH = "serviceData/sensors";

/**
 * After zone membership changes: set sequential `name` on assigned nodes; clear auto `name` on unassigned (same site).
 * Respects `nameManual` on each sensor document.
 */
async function syncSensorDisplayNamesAfterZoneAssign(
  orderedNodeIds: string[],
  siteId: string,
  zoneName: string
): Promise<void> {
  const sensorsSnap = await get(ref(database, SENSORS_PATH));
  const sensorsVal = sensorsSnap.exists()
    ? (sensorsSnap.val() as Record<string, Record<string, unknown>>)
    : {};

  const zonesSnap = await get(ref(database, ZONES_PATH));
  const assigned = new Set<string>();
  if (zonesSnap.exists()) {
    const allZ = zonesSnap.val() as Record<
      string,
      { siteId?: string; nodeIds?: string[] }
    >;
    for (const zval of Object.values(allZ)) {
      if (zval.siteId !== siteId) continue;
      const ids = Array.isArray(zval.nodeIds) ? zval.nodeIds : [];
      ids.forEach((n) => assigned.add(n));
    }
  }

  const updates: Record<string, unknown> = {};
  const now = new Date().toISOString();

  for (let i = 0; i < orderedNodeIds.length; i++) {
    const nodeId = orderedNodeIds[i];
    const existing = sensorsVal[nodeId];
    if (existing && existing.nameManual === true) continue;
    updates[`${nodeId}/name`] = `${zoneName} - ${i + 1}`;
    updates[`${nodeId}/siteId`] = siteId;
    updates[`${nodeId}/updatedAt`] = now;
  }

  for (const [nid, sval] of Object.entries(sensorsVal)) {
    if (sval.siteId !== siteId) continue;
    if (assigned.has(nid)) continue;
    if (sval.nameManual === true) continue;
    updates[`${nid}/name`] = null;
  }

  if (Object.keys(updates).length === 0) return;
  await update(ref(database, SENSORS_PATH), updates);
}

export type CreateZoneInput = {
  name: string;
  siteId: string;
  /** Stored in RTDB for legacy compatibility; UI defaults when omitted. */
  color?: string;
  nodeIds?: string[];
} & Partial<
  Pick<
    Zone,
    | "isCenterPivot"
    | "centerLat"
    | "centerLng"
    | "innerRadiusM"
    | "outerRadiusM"
  >
>;

export type UpdateZoneInput = Partial<
  Pick<
    Zone,
    | "name"
    | "color"
    | "nodeIds"
    | "moistureThresholdVwc"
    | "isCenterPivot"
    | "centerLat"
    | "centerLng"
    | "innerRadiusM"
    | "outerRadiusM"
  >
>;

function normalizeNodeIds(ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function parseOptionalThreshold(
  raw: unknown
): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalFiniteNumber(
  raw: unknown
): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalPivot(val: Record<string, unknown>): Partial<
  Pick<
    Zone,
    | "isCenterPivot"
    | "centerLat"
    | "centerLng"
    | "innerRadiusM"
    | "outerRadiusM"
  >
> {
  const out: Partial<
    Pick<
      Zone,
      | "isCenterPivot"
      | "centerLat"
      | "centerLng"
      | "innerRadiusM"
      | "outerRadiusM"
    >
  > = {};
  if (val.isCenterPivot === true) out.isCenterPivot = true;
  else if (val.isCenterPivot === false) out.isCenterPivot = false;
  const lat = parseOptionalFiniteNumber(val.centerLat);
  const lng = parseOptionalFiniteNumber(val.centerLng);
  const inner = parseOptionalFiniteNumber(val.innerRadiusM);
  const outer = parseOptionalFiniteNumber(val.outerRadiusM);
  if (lat !== undefined) out.centerLat = lat;
  if (lng !== undefined) out.centerLng = lng;
  if (inner !== undefined) out.innerRadiusM = inner;
  if (outer !== undefined) out.outerRadiusM = outer;
  return out;
}

/**
 * Subscribe to all zones for a site (filters client-side by siteId).
 */
export function subscribeToSiteZones(
  siteId: string,
  callback: (zones: Zone[]) => void
): Unsubscribe {
  const zonesRef = ref(database, ZONES_PATH);

  return onValue(
    zonesRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      const raw = snapshot.val() as Record<string, Record<string, unknown>>;
      const list: Zone[] = [];
      for (const [id, val] of Object.entries(raw)) {
        if (!val || typeof val !== "object") continue;
        if (val.siteId !== siteId) continue;
        const moistureThresholdVwc = parseOptionalThreshold(
          val.moistureThresholdVwc
        );
        const pivot = parseOptionalPivot(val);
        list.push({
          id,
          name: String(val.name ?? ""),
          color: normalizeZoneColor(
            val.color != null ? String(val.color) : undefined
          ),
          siteId: String(val.siteId ?? siteId),
          nodeIds: Array.isArray(val.nodeIds)
            ? normalizeNodeIds(val.nodeIds as string[])
            : [],
          createdAt: String(val.createdAt ?? new Date().toISOString()),
          updatedAt: String(val.updatedAt ?? new Date().toISOString()),
          ...(moistureThresholdVwc !== undefined
            ? { moistureThresholdVwc }
            : {}),
          ...pivot,
        });
      }
      callback(list);
    },
    (err) => {
      console.error("subscribeToSiteZones:", err);
      callback([]);
    }
  );
}

export async function createZone(input: CreateZoneInput): Promise<string> {
  const now = new Date().toISOString();
  const zonesRef = ref(database, ZONES_PATH);
  const newRef = push(zonesRef);
  const zoneId = newRef.key;
  if (!zoneId) throw new Error("Failed to generate zone id");

  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    color: normalizeZoneColor(input.color ?? DEFAULT_ZONE_COLOR),
    siteId: input.siteId,
    nodeIds: normalizeNodeIds(input.nodeIds),
    createdAt: now,
    updatedAt: now,
  };
  if (input.isCenterPivot === true) payload.isCenterPivot = true;
  if (input.centerLat !== undefined) payload.centerLat = input.centerLat;
  if (input.centerLng !== undefined) payload.centerLng = input.centerLng;
  if (input.innerRadiusM !== undefined) payload.innerRadiusM = input.innerRadiusM;
  if (input.outerRadiusM !== undefined) payload.outerRadiusM = input.outerRadiusM;

  await set(newRef, payload);

  return zoneId;
}

export async function updateZone(
  zoneId: string,
  updates: UpdateZoneInput
): Promise<void> {
  const zoneRef = ref(database, `${ZONES_PATH}/${zoneId}`);
  const payload: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.color !== undefined)
    payload.color = normalizeZoneColor(updates.color);
  if (updates.nodeIds !== undefined)
    payload.nodeIds = normalizeNodeIds(updates.nodeIds);
  if (updates.moistureThresholdVwc !== undefined) {
    const v = updates.moistureThresholdVwc;
    payload.moistureThresholdVwc = v === null || v === undefined ? null : v;
  }
  if (updates.isCenterPivot !== undefined) {
    payload.isCenterPivot = updates.isCenterPivot;
  }
  if (updates.centerLat !== undefined) {
    payload.centerLat =
      updates.centerLat === null || updates.centerLat === undefined
        ? null
        : updates.centerLat;
  }
  if (updates.centerLng !== undefined) {
    payload.centerLng =
      updates.centerLng === null || updates.centerLng === undefined
        ? null
        : updates.centerLng;
  }
  if (updates.innerRadiusM !== undefined) {
    payload.innerRadiusM =
      updates.innerRadiusM === null || updates.innerRadiusM === undefined
        ? null
        : updates.innerRadiusM;
  }
  if (updates.outerRadiusM !== undefined) {
    payload.outerRadiusM =
      updates.outerRadiusM === null || updates.outerRadiusM === undefined
        ? null
        : updates.outerRadiusM;
  }

  await update(zoneRef, payload);
}

export async function deleteZone(zoneId: string): Promise<void> {
  await remove(ref(database, `${ZONES_PATH}/${zoneId}`));
}

/**
 * Assigns nodes to a zone and removes them from any other zone (one zone per node).
 */
export async function assignNodesToZone(
  zoneId: string,
  nodeIds: string[],
  siteId: string
): Promise<void> {
  const normalized = normalizeNodeIds(nodeIds);

  const snap = await get(ref(database, ZONES_PATH));
  const updates: Record<string, unknown> = {};
  const now = new Date().toISOString();

  if (snap.exists()) {
    const all = snap.val() as Record<string, Record<string, unknown>>;
    for (const [zid, zval] of Object.entries(all)) {
      if (zid === zoneId || !zval || zval.siteId !== siteId) continue;
      const existing = Array.isArray(zval.nodeIds)
        ? (zval.nodeIds as string[])
        : [];
      const filtered = existing.filter((n) => !normalized.includes(n));
      if (filtered.length !== existing.length) {
        updates[`${zid}/nodeIds`] = filtered;
        updates[`${zid}/updatedAt`] = now;
      }
    }
  }

  const zoneSnap = await get(ref(database, `${ZONES_PATH}/${zoneId}`));
  if (!zoneSnap.exists()) {
    throw new Error("Zone not found");
  }

  const zoneName = String(
    (zoneSnap.val() as Record<string, unknown>)?.name ?? ""
  );

  updates[`${zoneId}/nodeIds`] = normalized;
  updates[`${zoneId}/updatedAt`] = now;

  await update(ref(database, ZONES_PATH), updates);

  await syncSensorDisplayNamesAfterZoneAssign(normalized, siteId, zoneName);
}

/** Set per-node moisture alert threshold (VWC %). Pass null to clear. */
export async function updateSensorMoistureThreshold(
  nodeId: string,
  moistureThresholdVwc: number | null
): Promise<void> {
  const now = new Date().toISOString();
  await update(ref(database, `${SENSORS_PATH}/${nodeId}`), {
    moistureThresholdVwc,
    updatedAt: now,
  });
}
