export interface SystemStats {
  cpuUsagePercent: number;
  cpuCores: number;
  cpuFrequencyMhz: number;
  cpuBrand: string;
  ramUsedBytes: number;
  ramTotalBytes: number;
  ramUsagePercent: number;
  diskName: string;
  diskUsedBytes: number;
  diskTotalBytes: number;
  diskFreeBytes: number;
  diskUsagePercent: number;
  netRxBytesPerSec: number;
  netTxBytesPerSec: number;
  uptimeSecs: number;
}
