import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WeatherData } from "../types/weather";

const CITY_STORAGE_KEY = "nusa.weatherCity";
const AUTO_REFRESH_MS = 15 * 60 * 1000;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const BROWSER_PREVIEW_WEATHER: WeatherData = {
  city: "Ho Chi Minh City",
  country: "Vietnam",
  temperatureC: 31,
  apparentTempC: 35,
  tempMaxC: 33,
  tempMinC: 25,
  humidity: 68,
  windSpeedKmh: 11,
  weatherCode: 2,
  condition: "Partly Cloudy",
  isDay: true,
  updatedAtMs: Date.now(),
};

export interface UseWeatherResult {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
  customCity: string;
  refresh: () => void;
  updateCity: (nextCity: string) => void;
}

export function useWeather(): UseWeatherResult {
  const tauri = isTauriRuntime();
  const [customCity, setCustomCity] = useState<string>(() => {
    try {
      return window.localStorage.getItem(CITY_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [weather, setWeather] = useState<WeatherData | null>(() =>
    tauri ? null : BROWSER_PREVIEW_WEATHER
  );
  const [loading, setLoading] = useState<boolean>(tauri);
  const [error, setError] = useState<string | null>(null);

  const loadWeather = useCallback(
    (targetCity: string, forceRefresh: boolean) => {
      const normalized = targetCity.trim();

      if (!tauri) {
        setWeather({
          ...BROWSER_PREVIEW_WEATHER,
          city: normalized || BROWSER_PREVIEW_WEATHER.city,
          updatedAtMs: Date.now(),
        });
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      invoke<WeatherData>("fetch_weather", {
        city: normalized.length > 0 ? normalized : null,
        forceRefresh,
      })
        .then((data) => {
          setWeather(data);
          setLoading(false);
          setError(null);
        })
        .catch((err) => {
          setLoading(false);
          setError(typeof err === "string" ? err : "Unable to load weather");
        });
    },
    [tauri]
  );

  useEffect(() => {
    loadWeather(customCity, false);
    const intervalId = window.setInterval(() => {
      loadWeather(customCity, true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [customCity, loadWeather]);

  const refresh = useCallback(() => {
    loadWeather(customCity, true);
  }, [customCity, loadWeather]);

  const updateCity = useCallback((nextCity: string) => {
    const cleaned = nextCity.trim();
    setCustomCity(cleaned);
    try {
      if (cleaned) {
        window.localStorage.setItem(CITY_STORAGE_KEY, cleaned);
      } else {
        window.localStorage.removeItem(CITY_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  return {
    weather,
    loading,
    error,
    customCity,
    refresh,
    updateCity,
  };
}
