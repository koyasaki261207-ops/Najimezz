export interface WeatherData {
  city: string;
  country: string;
  temperatureC: number;
  apparentTempC: number;
  tempMaxC: number;
  tempMinC: number;
  humidity: number;
  windSpeedKmh: number;
  weatherCode: number;
  condition: string;
  isDay: boolean;
  updatedAtMs: number;
}
