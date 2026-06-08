"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  /** 已排序的日期分组(YYYY-MM-DD),与页面中 id={`date-${date}`} 的 section 一一对应 */
  dates: string[];
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function parseDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return { month: d.getMonth() + 1, day: d.getDate(), weekday: WEEKDAYS[d.getDay()] };
}

/**
 * 右侧日期指示器。
 * - 被动:滚动页面时右侧浮现当前可见日期气泡,停滚后淡出。
 * - 主动:在右侧轨道上按住/拖拽可快速定位到任意日期分组(跟手实时跳转)。
 */
export function ScrollDateIndicator({ dates }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const sectionEl = useCallback(
    (date: string) => document.getElementById(`date-${date}`),
    []
  );

  // 浮现并安排淡出
  const flash = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setVisible(false), 1400);
  }, []);

  // 滚动时确定当前顶部可见的日期
  useEffect(() => {
    if (dates.length === 0) return;
    function onScroll() {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const probe = 120; // 视口顶部参考线(避开 sticky header)
        let idx = 0;
        for (let i = 0; i < dates.length; i++) {
          const el = sectionEl(dates[i]);
          if (!el) continue;
          if (el.getBoundingClientRect().top <= probe) idx = i;
          else break;
        }
        setActiveIndex(idx);
        if (!draggingRef.current) flash();
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [dates, flash, sectionEl]);

  // 拖拽 Y 坐标 → 日期分组 → 跳转
  const jumpToClientY = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      if (!track || dates.length === 0) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      const idx = Math.min(dates.length - 1, Math.round(ratio * (dates.length - 1)));
      setActiveIndex(idx);
      setVisible(true);
      const el = sectionEl(dates[idx]);
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 88;
        window.scrollTo({ top: y, behavior: "auto" });
      }
    },
    [dates, sectionEl]
  );

  function onPointerDown(e: React.PointerEvent) {
    setDragging(true);
    draggingRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    jumpToClientY(e.clientY);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    jumpToClientY(e.clientY);
  }
  function endDrag() {
    if (!draggingRef.current) return;
    setDragging(false);
    draggingRef.current = false;
    flash();
  }

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (dates.length <= 1) return null;

  const active = parseDate(dates[activeIndex]);
  const show = visible || dragging;

  return (
    <>
      {/* 右侧拖拽轨道(刻度) */}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-30 flex h-[58vh] w-7 cursor-grab touch-none flex-col items-center justify-between py-2 active:cursor-grabbing"
        aria-hidden="true"
      >
        {dates.map((d, i) => {
          const isActive = i === activeIndex;
          return (
            <span
              key={d}
              className={`rounded-full transition-all duration-200 ${
                isActive ? "h-[3px] w-3.5 bg-highlight" : "h-[2px] w-1.5 bg-border"
              } ${show ? "opacity-100" : "opacity-0"}`}
            />
          );
        })}
      </div>

      {/* 日期气泡 */}
      <div
        className={`pointer-events-none fixed right-6 top-1/2 z-30 -translate-y-1/2 transition-all duration-300 ${
          show ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0"
        }`}
        aria-hidden="true"
      >
        <div
          className={`flex items-center gap-3 rounded-2xl border bg-card/90 px-4 py-2.5 shadow-xl shadow-black/40 backdrop-blur-md transition-colors duration-200 ${
            dragging ? "border-highlight/60" : "border-border"
          }`}
        >
          <div className="flex flex-col items-center leading-none">
            <span className="mb-0.5 text-[10px] font-medium text-muted">{active.month}月</span>
            <span className="text-2xl font-bold tabular-nums text-foreground">{active.day}</span>
          </div>
          <div className="h-8 w-px bg-border" />
          <span className="text-sm font-medium text-highlight">{active.weekday}</span>
        </div>
      </div>
    </>
  );
}
