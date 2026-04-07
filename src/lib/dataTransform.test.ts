import { describe, expect, it } from "vitest";
import {
  getBatteryStatus,
  getMoisturePercent,
  getMoistureStatus,
  getSignalPercent,
  packetReceptionPercentLast7Days,
} from "./dataTransform";

function soilRawFromVoltage(v: number): number {
  return Math.round((v / 3.3) * 4095);
}

describe("getMoisturePercent piecewise boundaries", () => {
  it("matches boundary expectations around each segment", () => {
    expect(getMoisturePercent(soilRawFromVoltage(1.1))).toBe(11);
    expect(getMoisturePercent(soilRawFromVoltage(1.3))).toBe(15);
    expect(getMoisturePercent(soilRawFromVoltage(1.82))).toBe(40);
    expect(getMoisturePercent(soilRawFromVoltage(2.2))).toBe(50);
    expect(getMoisturePercent(soilRawFromVoltage(3.0))).toBe(100);
  });
});

describe("status thresholds", () => {
  it("uses battery status bands and labels", () => {
    expect(getBatteryStatus(3.5).status).toBe("GOOD");
    expect(getBatteryStatus(3.49).status).toBe("FAIR");
    expect(getBatteryStatus(3.41).status).toBe("LOW");
    expect(getBatteryStatus(3.34).status).toBe("REPLACE");
  });

  it("uses moisture status bands and labels", () => {
    expect(getMoistureStatus(12).status).toBe("Critical: Dry");
    expect(getMoistureStatus(22).status).toBe("Dry");
    expect(getMoistureStatus(34).status).toBe("Optimal");
    expect(getMoistureStatus(46).status).toBe("Wet");
    expect(getMoistureStatus(47).status).toBe("Critical: Saturated");
  });

  it("keeps legacy signal helper behavior stable", () => {
    expect(getSignalPercent(-70)).toBe(95);
    expect(getSignalPercent(-85)).toBe(80);
    expect(getSignalPercent(-100)).toBe(60);
    expect(getSignalPercent(-110)).toBe(40);
  });
});

describe("packetReceptionPercentLast7Days", () => {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const realToday = new Date(now).toISOString().split("T")[0];

  it("prefers packetId sequence continuity when available", () => {
    const packets: Record<string, Record<string, unknown>> = {};
    for (let id = 100; id <= 104; id++) {
      packets[`packetId:${id}`] = {
        packetId: id,
        timestamp: new Date(now - (104 - id) * hourMs).toISOString(),
      };
    }
    delete packets["packetId:102"];
    expect(packetReceptionPercentLast7Days(packets, realToday)).toBe(80);
  });

  it("falls back to count-based method when packetId is missing", () => {
    const packets: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 10; i++) {
      packets[`pkt-${i}`] = {
        timestamp: new Date(now - i * hourMs).toISOString(),
      };
    }
    expect(packetReceptionPercentLast7Days(packets, realToday)).toBe(11.9);
  });
});
