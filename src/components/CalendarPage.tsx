import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type WheelEvent,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import {
  EVENT_COLORS,
  toDateKey,
  useCalendarEvents,
} from "../hooks/useCalendarEvents";
import type { WeekStartOption } from "../types/settings";

export interface CalendarPageProps {
  isMega: boolean;
  weekStartsOn: WeekStartOption;
  onSetMega: (mega: boolean) => void;
  onNotify: (message: string) => void;
}

const WEEKDAY_VN = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

const WEEKDAY_HEADERS_MONDAY = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const WEEKDAY_HEADERS_SUNDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

interface MonthGridCell {
  date: Date;
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function buildMonthGrid(
  year: number,
  monthIndex: number,
  todayKey: string,
  weekStartsOn: WeekStartOption
): MonthGridCell[] {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const jsDay = firstOfMonth.getDay();
  const leadingOffset =
    weekStartsOn === "sunday" ? jsDay : jsDay === 0 ? 6 : jsDay - 1;
  const cells: MonthGridCell[] = [];

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(year, monthIndex, 1 - leadingOffset + i);
    const key = toDateKey(cellDate);
    cells.push({
      date: cellDate,
      dateKey: key,
      dayNumber: cellDate.getDate(),
      inCurrentMonth: cellDate.getMonth() === monthIndex,
      isToday: key === todayKey,
    });
  }

  return cells;
}

export function CalendarPage({
  isMega,
  weekStartsOn,
  onSetMega,
  onNotify,
}: CalendarPageProps) {
  const { eventsByDate, addEvent, deleteEvent, getEventsForDate } =
    useCalendarEvents();

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [adding, setAdding] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [timeInput, setTimeInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [selectedColor, setSelectedColor] = useState(EVENT_COLORS[0]);

  const wheelCooldownRef = useRef<number>(0);
  const activeDayBtnRef = useRef<HTMLButtonElement | null>(null);

  const today = new Date();
  const todayKey = toDateKey(today);
  const selectedKey = toDateKey(selectedDate);
  const viewYear = selectedDate.getFullYear();
  const viewMonth = selectedDate.getMonth();
  const isSelectedToday = selectedKey === todayKey;

  const dayEvents = getEventsForDate(selectedKey);
  const totalDays = daysInMonth(viewYear, viewMonth);

  const weekdayHeaders =
    weekStartsOn === "sunday" ? WEEKDAY_HEADERS_SUNDAY : WEEKDAY_HEADERS_MONDAY;

  const monthDays = useMemo(() => {
    const list: { day: number; date: Date; key: string }[] = [];
    for (let d = 1; d <= totalDays; d++) {
      const dt = new Date(viewYear, viewMonth, d);
      list.push({ day: d, date: dt, key: toDateKey(dt) });
    }
    return list;
  }, [totalDays, viewYear, viewMonth]);

  const monthGrid = useMemo(
    () => buildMonthGrid(viewYear, viewMonth, todayKey, weekStartsOn),
    [viewYear, viewMonth, todayKey, weekStartsOn]
  );

  useEffect(() => {
    if (isMega) return;
    activeDayBtnRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [selectedKey, isMega]);

  const shiftDay = (delta: number) => {
    setSelectedDate(
      (prev) =>
        new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + delta)
    );
  };

  const shiftMonth = (delta: number) => {
    setSelectedDate((prev) => {
      const targetYear = prev.getFullYear();
      const targetMonth = prev.getMonth() + delta;
      const maxDay = daysInMonth(targetYear, targetMonth);
      return new Date(targetYear, targetMonth, Math.min(prev.getDate(), maxDay));
    });
  };

  const jumpToToday = () => {
    const now = new Date();
    setSelectedDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  };

  const handleDateWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (Math.abs(event.deltaY) < 6) return;
    const nowMs = Date.now();
    if (nowMs - wheelCooldownRef.current < 85) return;
    wheelCooldownRef.current = nowMs;
    shiftDay(event.deltaY > 0 ? 1 : -1);
  };

  const openAddForm = () => {
    setTitleInput("");
    setTimeInput("");
    setNoteInput("");
    setSelectedColor(EVENT_COLORS[0]);
    setAdding(true);
  };

  const handleCreateEvent = (event: FormEvent) => {
    event.preventDefault();
    const created = addEvent({
      dateKey: selectedKey,
      title: titleInput,
      time: timeInput,
      note: noteInput,
      color: selectedColor,
    });
    if (!created) {
      onNotify("Nhập tên lịch trình trước khi lưu");
      return;
    }
    setAdding(false);
    setTitleInput("");
    setTimeInput("");
    setNoteInput("");
    onNotify(`Đã thêm "${created.title}"`);
  };

  const weekdayText = WEEKDAY_VN[selectedDate.getDay()];
  const monthLabel = `Tháng ${viewMonth + 1}, ${viewYear}`;
  const selectedShortDate = `${String(selectedDate.getDate()).padStart(2, "0")}/${String(
    viewMonth + 1
  ).padStart(2, "0")}/${viewYear}`;

  const renderEventsPanel = (compact: boolean) => (
    <section className={`cal-events-col ${compact ? "is-compact" : "is-mega"}`}>
      <div className="cal-events-header">
        <div className="cal-events-heading">
          <span className="cal-events-title">
            {compact ? "Sự kiện" : `${weekdayText}, ${selectedShortDate}`}
          </span>
          {dayEvents.length > 0 && (
            <span className="cal-events-badge">{dayEvents.length}</span>
          )}
        </div>

        <button
          type="button"
          className={`cal-icon-btn ${adding ? "is-active" : ""}`}
          title={adding ? "Đóng biểu mẫu" : "Thêm lịch trình mới"}
          aria-label={adding ? "Đóng biểu mẫu" : "Thêm lịch trình mới"}
          onClick={() => (adding ? setAdding(false) : openAddForm())}
        >
          {adding ? <X size={12} strokeWidth={2.4} /> : <Plus size={12} strokeWidth={2.4} />}
        </button>
      </div>

      {adding ? (
        <form
          className="cal-add-form"
          onSubmit={handleCreateEvent}
          onWheel={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            className="cal-input"
            placeholder="Tên lịch trình..."
            value={titleInput}
            autoFocus
            onChange={(e) => setTitleInput(e.target.value)}
          />

          <div className="cal-form-row">
            <input
              type="text"
              className="cal-input cal-input-time"
              placeholder="Giờ (vd 09:30)"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
            />
            <div className="cal-color-dots" role="radiogroup" aria-label="Màu sự kiện">
              {EVENT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`cal-color-dot ${selectedColor === color ? "is-selected" : ""}`}
                  style={{ backgroundColor: color }}
                  aria-label={`Chọn màu ${color}`}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </div>
          </div>

          <input
            type="text"
            className="cal-input"
            placeholder="Ghi chú (không bắt buộc)..."
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
          />

          <div className="cal-form-actions">
            <button
              type="button"
              className="cal-btn-ghost"
              onClick={() => setAdding(false)}
            >
              Hủy
            </button>
            <button type="submit" className="cal-btn-primary">
              Lưu
            </button>
          </div>
        </form>
      ) : dayEvents.length === 0 ? (
        <div className="cal-events-empty">
          <span>Không có lịch trình</span>
          <button type="button" className="cal-empty-add" onClick={openAddForm}>
            + Thêm sự kiện
          </button>
        </div>
      ) : (
        <div
          className="cal-events-list"
          onWheel={(e) => e.stopPropagation()}
        >
          {dayEvents.map((item) => (
            <div key={item.id} className="cal-event-card">
              <span
                className="cal-event-dot"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <div className="cal-event-body">
                <div className="cal-event-top">
                  <span className="cal-event-name" title={item.title}>
                    {item.title}
                  </span>
                  {item.time && (
                    <span className="cal-event-time">
                      <Clock size={9} strokeWidth={2.2} />
                      {item.time}
                    </span>
                  )}
                </div>
                {item.note && (
                  <div className="cal-event-note" title={item.note}>
                    <StickyNote size={9} strokeWidth={2} />
                    <span>{item.note}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="cal-event-del"
                title="Xóa lịch trình"
                aria-label={`Xóa ${item.title}`}
                onClick={() => deleteEvent(selectedKey, item.id)}
              >
                <Trash2 size={10} strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  if (isMega) {
    return (
      <div className="cal-app cal-app-mega">
        <div className="cal-mega-body">
          <section className="cal-month-col">
            <div className="cal-month-toolbar">
              <div className="cal-month-nav">
                <button
                  type="button"
                  className="cal-icon-btn"
                  aria-label="Tháng trước"
                  onClick={() => shiftMonth(-1)}
                >
                  <ChevronLeft size={13} strokeWidth={2.3} />
                </button>
                <span className="cal-month-title">{monthLabel}</span>
                <button
                  type="button"
                  className="cal-icon-btn"
                  aria-label="Tháng sau"
                  onClick={() => shiftMonth(1)}
                >
                  <ChevronRight size={13} strokeWidth={2.3} />
                </button>
              </div>

              <button
                type="button"
                className={`cal-today-pill ${isSelectedToday ? "is-current" : ""}`}
                onClick={jumpToToday}
              >
                Hôm nay
              </button>
            </div>

            <div className="cal-weekdays-row">
              {weekdayHeaders.map((label) => (
                <span key={label} className="cal-weekday-head">
                  {label}
                </span>
              ))}
            </div>

            <div className="cal-month-grid">
              {monthGrid.map((cell) => {
                const cellEvents = eventsByDate[cell.dateKey] ?? [];
                const isSelected = cell.dateKey === selectedKey;
                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    className={`cal-grid-cell ${
                      !cell.inCurrentMonth ? "is-outside" : ""
                    } ${cell.isToday ? "is-today" : ""} ${
                      isSelected ? "is-selected" : ""
                    }`}
                    onClick={() => setSelectedDate(cell.date)}
                  >
                    <span className="cal-grid-num">{cell.dayNumber}</span>
                    <span className="cal-grid-dots" aria-hidden="true">
                      {cellEvents.slice(0, 3).map((ev) => (
                        <span
                          key={ev.id}
                          className="cal-grid-dot"
                          style={{
                            backgroundColor: isSelected ? "#FFFFFF" : ev.color,
                          }}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="cal-vdivider" aria-hidden="true" />

          {renderEventsPanel(false)}
        </div>

        <button
          type="button"
          className="cal-expand-bar"
          title="Thu gọn lịch"
          aria-label="Thu gọn lịch"
          onClick={() => onSetMega(false)}
        >
          <ChevronUp size={14} strokeWidth={2.3} />
          <span>Thu gọn lịch tháng</span>
        </button>
      </div>
    );
  }

  return (
    <div className="cal-app cal-app-compact">
      <div className="cal-compact-body">
        <section
          className="cal-date-col"
          onWheel={handleDateWheel}
          title="Lăn chuột lên/xuống để chuyển ngày"
        >
          <div className="cal-day-rail">
            {monthDays.map((item) => {
              const isSelected = item.key === selectedKey;
              const isTodayItem = item.key === todayKey;
              const hasEvents = (eventsByDate[item.key]?.length ?? 0) > 0;
              return (
                <button
                  key={item.key}
                  ref={isSelected ? activeDayBtnRef : null}
                  type="button"
                  className={`cal-rail-day ${isSelected ? "is-selected" : ""} ${
                    isTodayItem ? "is-today" : ""
                  }`}
                  onClick={() => setSelectedDate(item.date)}
                >
                  <span>{item.day}</span>
                  {hasEvents && <span className="cal-rail-dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <div className="cal-day-hero">
            <div className="cal-hero-top">
              <button
                type="button"
                className="cal-hero-month-btn"
                aria-label="Tháng trước"
                onClick={() => shiftMonth(-1)}
              >
                <ChevronLeft size={11} strokeWidth={2.3} />
              </button>
              <span className="cal-hero-month">{monthLabel}</span>
              <button
                type="button"
                className="cal-hero-month-btn"
                aria-label="Tháng sau"
                onClick={() => shiftMonth(1)}
              >
                <ChevronRight size={11} strokeWidth={2.3} />
              </button>
            </div>

            <div className="cal-hero-number">{selectedDate.getDate()}</div>

            <div className="cal-hero-footer">
              <span className="cal-hero-weekday">{weekdayText}</span>
              {!isSelectedToday ? (
                <button
                  type="button"
                  className="cal-jump-today"
                  onClick={jumpToToday}
                >
                  Hôm nay
                </button>
              ) : (
                <span className="cal-today-tag">Hôm nay</span>
              )}
            </div>
          </div>
        </section>

        <div className="cal-vdivider" aria-hidden="true" />

        {renderEventsPanel(true)}
      </div>

      <button
        type="button"
        className="cal-expand-bar"
        title="Mở rộng lịch cả tháng"
        aria-label="Mở rộng lịch cả tháng"
        onClick={() => onSetMega(true)}
      >
        <ChevronDown size={14} strokeWidth={2.3} />
      </button>
    </div>
  );
}
