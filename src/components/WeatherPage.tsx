import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  Check,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  Moon,
  RefreshCw,
  Sun,
  Wind,
  X,
} from "lucide-react";
import type { UseWeatherResult } from "../hooks/useWeather";

interface WeatherPageProps {
  weatherCtrl: UseWeatherResult;
}

const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEK_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

interface WeekCell {
  label: string;
  dateNum: number;
  isToday: boolean;
}

function buildWeekStrip(now: Date): WeekCell[] {
  const jsDay = now.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const cells: WeekCell[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + i);
    cells.push({
      label: WEEK_LETTERS[i],
      dateNum: d.getDate(),
      isToday: d.getDate() === now.getDate() && d.getMonth() === now.getMonth(),
    });
  }

  return cells;
}

function renderWeatherIcon(code: number, isDay: boolean) {
  if (code === 0) {
    return isDay ? (
      <Sun color="#FBBF24" size={24} strokeWidth={2} />
    ) : (
      <Moon color="#93C5FD" size={22} strokeWidth={2} />
    );
  }
  if (code === 1 || code === 2) {
    return isDay ? (
      <CloudSun color="#FBBF24" size={24} strokeWidth={2} />
    ) : (
      <Cloud color="#93C5FD" size={24} strokeWidth={2} />
    );
  }
  if (code === 3) {
    return <Cloud color="#CBD5E1" size={24} strokeWidth={2} />;
  }
  if (code === 45 || code === 48) {
    return <CloudFog color="#94A3B8" size={24} strokeWidth={2} />;
  }
  if (code >= 51 && code <= 57) {
    return <CloudDrizzle color="#60A5FA" size={24} strokeWidth={2} />;
  }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return <CloudRain color="#38BDF8" size={24} strokeWidth={2} />;
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return <CloudSnow color="#E0F2FE" size={24} strokeWidth={2} />;
  }
  if (code >= 95) {
    return <CloudLightning color="#F59E0B" size={24} strokeWidth={2} />;
  }
  return <CloudSun color="#38BDF8" size={24} strokeWidth={2} />;
}

export function WeatherPage({ weatherCtrl }: WeatherPageProps) {
  const { weather, loading, error, customCity, refresh, updateCity } = weatherCtrl;
  const [now, setNow] = useState<Date>(() => new Date());
  const [editingCity, setEditingCity] = useState(false);
  const [cityInput, setCityInput] = useState(customCity);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const weekStrip = useMemo(() => buildWeekStrip(now), [now]);

  const startEditCity = () => {
    setCityInput(customCity || weather?.city || "");
    setEditingCity(true);
  };

  const cancelEditCity = () => {
    setEditingCity(false);
  };

  const submitCity = (event: FormEvent) => {
    event.preventDefault();
    updateCity(cityInput);
    setEditingCity(false);
  };

  const handleCityKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setEditingCity(false);
    }
  };

  const dayNumber = String(now.getDate()).padStart(2, "0");
  const weekdayLabel = WEEKDAY_LONG[now.getDay()];
  const monthYearLabel = `${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="weather-page">
      <section className="weather-date-col">
        <div className="weather-date-hero">
          <span className="weather-day-num">{dayNumber}</span>
          <div className="weather-date-meta">
            <span className="weather-weekday">{weekdayLabel}</span>
            <span className="weather-month-year">{monthYearLabel}</span>
          </div>
        </div>

        <div className="weather-week-strip" aria-label="Current week">
          {weekStrip.map((cell, idx) => (
            <div
              key={`${cell.dateNum}-${idx}`}
              className={`week-cell ${cell.isToday ? "is-today" : ""}`}
            >
              <span className="week-letter">{cell.label}</span>
              <span className="week-num">{cell.dateNum}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="weather-divider" aria-hidden="true" />

      <section className="weather-info-col">
        <div className="weather-top-bar">
          {editingCity ? (
            <form
              className="weather-city-form"
              onSubmit={submitCity}
              onWheel={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                className="weather-city-input"
                value={cityInput}
                placeholder="City (empty = Auto)"
                autoFocus
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={handleCityKeyDown}
              />
              <button
                type="submit"
                className="weather-mini-btn"
                title="Save city"
                aria-label="Save city"
              >
                <Check size={12} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                className="weather-mini-btn"
                title="Cancel"
                aria-label="Cancel edit"
                onClick={cancelEditCity}
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                className="weather-city-btn"
                title="Click to change city"
                onClick={startEditCity}
              >
                <MapPin size={11} strokeWidth={2.2} />
                <span className="weather-city-name">
                  {weather ? weather.city : loading ? "Locating..." : "Set city"}
                </span>
              </button>

              <button
                type="button"
                className={`weather-mini-btn ${loading ? "is-spinning" : ""}`}
                title="Refresh weather"
                aria-label="Refresh weather"
                onClick={refresh}
              >
                <RefreshCw size={11} strokeWidth={2.2} />
              </button>
            </>
          )}
        </div>

        {weather ? (
          <>
            <div className="weather-main-row">
              <div className="weather-icon-wrap">
                {renderWeatherIcon(weather.weatherCode, weather.isDay)}
              </div>
              <div className="weather-temp">{Math.round(weather.temperatureC)}°</div>
              <div className="weather-cond-stack">
                <span className="weather-condition" title={weather.condition}>
                  {weather.condition}
                </span>
                <span className="weather-hi-lo">
                  H:{Math.round(weather.tempMaxC)}° L:{Math.round(weather.tempMinC)}°
                </span>
              </div>
            </div>

            <div className="weather-metrics-row">
              <span className="weather-metric" title="Humidity">
                <Droplets size={11} strokeWidth={2.1} />
                {weather.humidity}%
              </span>
              <span className="weather-metric" title="Wind speed">
                <Wind size={11} strokeWidth={2.1} />
                {Math.round(weather.windSpeedKmh)} km/h
              </span>
              <span className="weather-metric" title="Feels like">
                Feels {Math.round(weather.apparentTempC)}°
              </span>
            </div>
          </>
        ) : (
          <div className="weather-empty-state">
            {loading ? "Fetching weather..." : error ?? "Weather unavailable"}
          </div>
        )}
      </section>
    </div>
  );
}
