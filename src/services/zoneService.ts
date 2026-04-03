import { database } from "@/lib/firebase";
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
  color: string;
  siteId: string;
  nodeIds?: string[];
};

export type UpdateZoneInput = Partial<
  Pick<Zone, "name" | "color" | "nodeIds">
>;

function normalizeNodeIds(ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
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
        list.push({
          id,
          name: String(val.name ?? ""),
          color: String(val.color ?? "#6366f1"),
          siteId: String(val.siteId ?? siteId),
          nodeIds: Array.isArray(val.nodeIds)
            ? normalizeNodeIds(val.nodeIds as string[])
            : [],
          createdAt: String(val.createdAt ?? new Date().toISOString()),
          updatedAt: String(val.updatedAt ?? new Date().toISOString()),
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

  await set(newRef, {
    name: input.name.trim(),
    color: input.color,
    siteId: input.siteId,
    nodeIds: normalizeNodeIds(input.nodeIds),
    createdAt: now,
    updatedAt: now,
  });

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
  if (updates.color !== undefined) payload.color = updates.color;
  if (updates.nodeIds !== undefined)
    payload.nodeIds = normalizeNodeIds(updates.nodeIds);

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
