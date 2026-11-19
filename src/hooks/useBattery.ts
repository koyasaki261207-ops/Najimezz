import { useEffect, useState } from "react";
import type { BatteryStatus } from "../types/notch";

interface BatteryManagerLike extends EventTarget {
  charging: boolean;
  level: number;
  addEventListener(type: "chargingchange" | "levelchange", listener: () => void): void;
  removeEventListener(type: "chargingchange" | "levelchange", listener: () => void): void;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManagerLike>;
}

const DEFAULT_BATTERY: BatteryStatus = {
  level: 0.88,
  charging: true,
  supported: false,
};

export function useBattery(): BatteryStatus {
  const [battery, setBattery] = useState<BatteryStatus>(DEFAULT_BATTERY);

  useEffect(() => {
    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== "function") {
      return;
    }

    let manager: BatteryManagerLike | null = null;
    let active = true;

    const sync = () => {
      if (!manager || !active) return;
      setBattery({
        level: manager.level,
        charging: manager.charging,
        supported: true,
      });
    };

    nav
      .getBattery()
      .then((bat) => {
        if (!active) return;
        manager = bat;
        sync();
        bat.addEventListener("chargingchange", sync);
        bat.addEventListener("levelchange", sync);
      })
      .catch(() => {
        if (active) {
          setBattery(DEFAULT_BATTERY);
        }
      });

    return () => {
      active = false;
      if (manager) {
        manager.removeEventListener("chargingchange", sync);
        manager.removeEventListener("levelchange", sync);
      }
    };
  }, []);

  return battery;
}
