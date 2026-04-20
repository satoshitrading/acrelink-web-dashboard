/**
 * Scheduled moisture alerts (Twilio SMS + SendGrid email).
 * Set env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER,
 * SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, DASHBOARD_URL (optional).
 */
import * as logger from "firebase-functions/logger";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import twilio from "twilio";
import {
  processGatewaysSnapshot,
  computeZoneSummaries,
  type Zone,
} from "./siteAggregation";
import { getMoistureStatus } from "./sensorRequirementMath";
import { normalizeToE164 } from "./phoneE164";
import {
  collectPacketsForNodes,
  findLatestIrrigationCandidate,
} from "./irrigationDetection";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

const FOUR_H_MS = 4 * 60 * 60 * 1000;

function parseZone(raw: Record<string, unknown>, id: string): Zone | null {
  if (!raw || raw.siteId == null) return null;
  const siteId = String(raw.siteId);
  const nodeIds = Array.isArray(raw.nodeIds)
    ? (raw.nodeIds as string[]).filter(Boolean)
    : [];
  const thRaw = raw.moistureThresholdVwc;
  let moistureThresholdVwc: number | null | undefined;
  if (thRaw === undefined) moistureThresholdVwc = undefined;
  else if (thRaw === null) moistureThresholdVwc = null;
  else {
    const n = Number(thRaw);
    moistureThresholdVwc = Number.isFinite(n) ? n : undefined;
  }
  return {
    id,
    name: String(raw.name ?? ""),
    color: String(raw.color ?? "#6366f1"),
    siteId,
    nodeIds,
    createdAt: String(raw.createdAt ?? ""),
    updatedAt: String(raw.updatedAt ?? ""),
    ...(moistureThresholdVwc !== undefined ? { moistureThresholdVwc } : {}),
  };
}

function findZoneForNode(zones: Zone[], nodeId: string): Zone | undefined {
  return zones.find((z) => z.nodeIds.includes(nodeId));
}

async function loadZonesForSite(siteId: string): Promise<Zone[]> {
  const snap = await db.ref("serviceData/zones").once("value");
  if (!snap.exists()) return [];
  const val = snap.val() as Record<string, Record<string, unknown>>;
  const out: Zone[] = [];
  for (const [id, row] of Object.entries(val)) {
    const z = parseZone(row, id);
    if (z && z.siteId === siteId) out.push(z);
  }
  return out;
}

async function loadSensorThresholdsForSite(
  siteId: string
): Promise<Record<string, number | null | undefined>> {
  const snap = await db.ref("serviceData/sensors").once("value");
  if (!snap.exists()) return {};
  const val = snap.val() as Record<string, Record<string, unknown>>;
  const out: Record<string, number | null | undefined> = {};
  for (const [nodeId, row] of Object.entries(val)) {
    if (!row || row.siteId !== siteId) continue;
    const th = row.moistureThresholdVwc;
    if (th === undefined) out[nodeId] = undefined;
    else if (th === null) out[nodeId] = null;
    else {
      const n = Number(th);
      out[nodeId] = Number.isFinite(n) ? n : undefined;
    }
  }
  return out;
}

type UserRow = {
  phone?: string;
  email?: string;
  smsOptIn?: boolean;
  siteId?: string;
  siteIds?: string[];
  role?: string;
  fullName?: string;
  name?: string;
};

async function loadNotifyUsers(siteId: string): Promise<
  { phone?: string; email?: string }[]
> {
  const snap = await db.ref("users").once("value");
  if (!snap.exists()) return [];
  const val = snap.val() as Record<string, UserRow>;
  const recipients: { phone?: string; email?: string }[] = [];
  for (const u of Object.values(val)) {
    const matchCustomer = u.siteId === siteId && u.role === "customer";
    const matchTech =
      u.role === "technician" &&
      Array.isArray(u.siteIds) &&
      u.siteIds.includes(siteId);
    if (!matchCustomer && !matchTech) continue;
    // SMS unless explicitly opted out (missing smsOptIn counts as allowed, matching profile phone).
    const smsAllowed = u.smsOptIn !== false;
    const phone =
      smsAllowed && u.phone && String(u.phone).trim().length >= 8
        ? String(u.phone).trim()
        : undefined;
    const email =
      u.email && String(u.email).includes("@")
        ? String(u.email).trim()
        : undefined;
    if (phone || email) {
      recipients.push({ phone, email });
    }
  }
  return recipients;
}

/** One SMS/email burst per zone per 4h; unassigned nodes use their own bucket. */
function rateBucketId(zone: Zone | undefined, nodeId: string): string {
  if (zone) return `zone:${zone.id}`;
  return `node:${nodeId}`;
}

async function shouldSend(
  siteId: string,
  bucketId: string
): Promise<boolean> {
  const ref = db.ref(`serviceData/smsRateLimit/${siteId}/${bucketId}/lastSentAt`);
  const snap = await ref.once("value");
  const last = snap.exists() ? Number(snap.val()) : 0;
  const now = Date.now();
  if (!last || Number.isNaN(last)) return true;
  return now - last >= FOUR_H_MS;
}

async function markSent(siteId: string, bucketId: string): Promise<void> {
  await db
    .ref(`serviceData/smsRateLimit/${siteId}/${bucketId}`)
    .update({ lastSentAt: Date.now() });
}

type MergedBreach = { bucketId: string; subject: string; message: string };

function mergeBreach(
  map: Map<string, MergedBreach>,
  bucketId: string,
  subject: string,
  sentence: string
): void {
  const prev = map.get(bucketId);
  if (!prev) {
    map.set(bucketId, { bucketId, subject, message: sentence });
  } else {
    prev.message = `${prev.message} ${sentence}`;
  }
}

export const evaluateMoistureAlerts = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/Chicago",
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async () => {
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_FROM_NUMBER;
    const dashboardUrl = process.env.DASHBOARD_URL || "https://app.myacrelink.com";

    const srSnap = await db.ref("sensor-readings").once("value");
    if (!srSnap.exists()) {
      logger.info("No sensor-readings");
      return;
    }

    logger.info("Started Function");

    const srRoot = srSnap.val() as Record<string, unknown>;
    const siteKeys = Object.keys(srRoot).filter((k) => k.startsWith("siteId:"));

    for (const siteKey of siteKeys) {
      const siteId = siteKey.replace(/^siteId:/, "");
      const gatewaysSnap = await db
        .ref(`sensor-readings/${siteKey}/gateways`)
        .once("value");
      const gateways = gatewaysSnap.exists()
        ? (gatewaysSnap.val() as Record<string, unknown>)
        : null;

      const agg = processGatewaysSnapshot(gateways);
      const zones = await loadZonesForSite(siteId);
      const zoneSummaries = computeZoneSummaries(zones, agg.allNodeReadings);
      const sensorThresholds = await loadSensorThresholdsForSite(siteId);
      const recipients = await loadNotifyUsers(siteId);

      logger.info(`Recipients: ${JSON.stringify(recipients)}`);

      if (recipients.length === 0) continue;

      const twilioClient =
        twilioSid && twilioToken ? twilio(twilioSid, twilioToken) : null;

      const breachByBucket = new Map<string, MergedBreach>();

      for (const zs of zoneSummaries) {
        const thRaw = zs.moistureThresholdVwc;
        const thNum =
          thRaw !== undefined && thRaw !== null ? Number(thRaw) : NaN;
        const hasTh = Number.isFinite(thNum);
        const belowTh = hasTh && zs.avgMoisture < thNum;
        const band = getMoistureStatus(zs.avgMoisture).status;
        const criticalBand =
          band === "Critical: Dry" || band === "Critical: Saturated";

        if (!belowTh && !criticalBand) continue;

        const bucketId = rateBucketId(zs, "");
        const subject = `AcreLink: ${zs.name} moisture alert`;
        const parts: string[] = [];
        if (belowTh) {
          parts.push(
            `${zs.name}: zone average ${zs.avgMoisture}% VWC is below your ${thNum}% threshold.`
          );
        }
        if (band === "Critical: Dry") {
          parts.push(
            `${zs.name}: zone average ${zs.avgMoisture}% VWC is Critical: Dry.`
          );
        }
        if (band === "Critical: Saturated") {
          parts.push(
            `${zs.name}: zone average ${zs.avgMoisture}% VWC is Critical: Saturated.`
          );
        }
        if (parts.length > 0) {
          mergeBreach(breachByBucket, bucketId, subject, parts.join(" "));
        }
      }

      for (const [nodeId, reading] of Object.entries(agg.allNodeReadings)) {
        if (!reading.online) continue;

        const thRaw = sensorThresholds[nodeId];
        const thNum =
          thRaw !== undefined && thRaw !== null ? Number(thRaw) : NaN;
        const hasTh = Number.isFinite(thNum);
        const belowTh = hasTh && reading.moisture < thNum;
        const band = getMoistureStatus(reading.moisture).status;
        const criticalBand =
          band === "Critical: Dry" || band === "Critical: Saturated";

        if (!belowTh && !criticalBand) continue;

        const z = findZoneForNode(zones, nodeId);
        const bucketId = rateBucketId(z, nodeId);
        const subject = `AcreLink: node ${nodeId} moisture alert`;
        const zoneHint = z ? ` (zone ${z.name})` : "";
        const parts: string[] = [];
        if (belowTh) {
          parts.push(
            `Node ${nodeId}: ${reading.moisture}% VWC is below your ${thNum}% threshold.${zoneHint}`
          );
        }
        if (band === "Critical: Dry") {
          parts.push(
            `Node ${nodeId}: ${reading.moisture}% VWC is Critical: Dry.${zoneHint}`
          );
        }
        if (band === "Critical: Saturated") {
          parts.push(
            `Node ${nodeId}: ${reading.moisture}% VWC is Critical: Saturated.${zoneHint}`
          );
        }
        if (parts.length > 0) {
          mergeBreach(breachByBucket, bucketId, subject, parts.join(" "));
        }
      }

      for (const b of breachByBucket.values()) {
        const ok = await shouldSend(siteId, b.bucketId);
        if (!ok) continue;

        let sentAny = false;
        for (const r of recipients) {
          if (twilioClient && twilioFrom && r.phone) {
            const toE164 = normalizeToE164(r.phone);
            if (!toE164) {
              logger.warn("Skipping SMS: invalid phone after E.164 normalize", {
                raw: r.phone,
              });
            } else {
              try {
                await twilioClient.messages.create({
                  body: `${b.message} ${dashboardUrl}`,
                  from: twilioFrom,
                  to: toE164,
                });
                sentAny = true;
              } catch (e) {
                logger.error("Twilio error", e);
              }
            }
          }
        }

        if (sentAny) {
          await markSent(siteId, b.bucketId);
        }
      }
    }

    logger.info("evaluateMoistureAlerts completed");
  }
);

async function getLastIrrigationEventEndMs(
  siteId: string,
  zoneId: string
): Promise<number> {
  const ref = db
    .ref(`irrigation_events/${siteId}/${zoneId}/events`)
    .orderByChild("timestamp")
    .limitToLast(1);
  const snap = await ref.once("value");
  if (!snap.exists()) return 0;
  const val = snap.val() as Record<string, { timestamp?: string }>;
  const keys = Object.keys(val);
  if (keys.length === 0) return 0;
  const row = val[keys[0]];
  const ts = row?.timestamp;
  if (!ts) return 0;
  const ms = new Date(String(ts)).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export const detectIrrigationEvents = onSchedule(
  {
    schedule: "every 20 minutes",
    timeZone: "America/Chicago",
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async () => {
    const srSnap = await db.ref("sensor-readings").once("value");
    if (!srSnap.exists()) {
      logger.info("detectIrrigationEvents: no sensor-readings");
      return;
    }

    const srRoot = srSnap.val() as Record<string, unknown>;
    const siteKeys = Object.keys(srRoot).filter((k) => k.startsWith("siteId:"));
    const nowMs = Date.now();
    const sinceMs = nowMs - 72 * 60 * 60 * 1000;
    let eventsWritten = 0;

    for (const siteKey of siteKeys) {
      const siteId = siteKey.replace(/^siteId:/, "");
      const gatewaysSnap = await db
        .ref(`sensor-readings/${siteKey}/gateways`)
        .once("value");
      const gateways = gatewaysSnap.exists()
        ? (gatewaysSnap.val() as Record<string, unknown>)
        : null;

      const zones = await loadZonesForSite(siteId);
      const allNodeIds = new Set<string>();
      for (const z of zones) {
        for (const nid of z.nodeIds) allNodeIds.add(nid);
      }

      if (allNodeIds.size === 0) continue;

      const packetsByNode = collectPacketsForNodes(
        gateways,
        allNodeIds,
        sinceMs,
        nowMs
      );

      for (const z of zones) {
        if (z.nodeIds.length < 2) continue;

        const lastEnd = await getLastIrrigationEventEndMs(siteId, z.id);
        const candidate = findLatestIrrigationCandidate(
          z.nodeIds,
          packetsByNode,
          lastEnd,
          nowMs
        );
        if (!candidate) continue;

        const eventRef = db.ref(
          `irrigation_events/${siteId}/${z.id}/events`
        ).push();
        await eventRef.set({
          timestamp: candidate.timestampIso,
          preVwc: candidate.preVwc,
          postVwc: candidate.postVwc,
          siteId,
          zoneId: z.id,
          windowMinutes: candidate.windowMinutes,
          nodeCount: candidate.nodeCount,
          createdAt: new Date().toISOString(),
        });
        eventsWritten++;
        logger.info("detectIrrigationEvents: wrote event", {
          siteId,
          zoneId: z.id,
          timestamp: candidate.timestampIso,
        });
      }
    }

    logger.info("detectIrrigationEvents completed", { eventsWritten });
  }
);
