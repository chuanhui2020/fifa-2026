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

const HEADER_OFFSET = 88; // sticky header 高度,跳转定位时让出
const PROBE = 120;        // 视口顶部参考线,确定当前可见日期(避开 header)

/**
 * 右侧日期指示器,按设备能力分两套交互:
 *
 * - **移动端(pointer: coarse)**:平时不拦截滚动。滚动时左侧浮现日期气泡(避开右手拇指),
 *   同时右侧浮出一个可抓握的胶囊「快滚把手」;**只有抓住把手**才进入拖拽定位(iOS 长列表范式),
 *   不抓则页面正常滚动,彻底消除误触劫持。把手内移离开屏幕边缘,避开系统返回手势。
 * - **桌面端(pointer: fine)**:保留右侧刻度轨道,鼠标 hover/拖拽定位,气泡在右侧。
 */
export function ScrollDateIndicator({ dates }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(false);   // 气泡显隐(滚动浮现 / 停滚淡出)
  const [scrolling, setScrolling] = useState(false); // 活跃滚动中(驱动移动端把手显隐)
  const [dragging, setDragging] = useState(false);

  const hideTimer = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const sectionEl = useCallback(
    (date: string) => document.getElementById(`date-${date}`),
    []
  );

  // 气泡浮现并安排淡出
  const flash = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setVisible(false), 1400);
  }, []);

  // 标记活跃滚动:停滚 1.2s 后判定为静止(移动端把手随之隐藏)
  const markScrolling = useCallback(() => {
    setScrolling(true);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setScrolling(false), 1200);
  }, []);

  // 滚动时确定当前顶部可见的日期
  useEffect(() => {
    if (dates.length === 0) return;
    function onScroll() {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        let idx = 0;
        for (let i = 0; i < dates.length; i++) {
          const el = sectionEl(dates[i]);
          if (!el) continue;
          if (el.getBoundingClientRect().top <= PROBE) idx = i;
          else break;
        }
        setActiveIndex(idx);
        if (!draggingRef.current) {
          flash();
          markScrolling();
        }
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [dates, flash, markScrolling, sectionEl]);

  // 拖拽 Y 坐标 → 日期分组 → 跳转。container 为做映射的元素(移动端=把手区轨道,桌面=刻度轨道)。
  const jumpToClientY = useCallback(
    (clientY: number, container: HTMLElement | null) => {
      if (!container || dates.length === 0) return;
      const rect = container.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      const idx = Math.min(dates.length - 1, Math.round(ratio * (dates.length - 1)));
      setActiveIndex(idx);
      setVisible(true);
      const el = sectionEl(dates[idx]);
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
        window.scrollTo({ top: y, behavior: "auto" });
      }
    },
    [dates, sectionEl]
  );

  function startDrag(e: React.PointerEvent, container: HTMLElement | null) {
    setDragging(true);
    draggingRef.current = true;
    setScrolling(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    jumpToClientY(e.clientY, container);
  }
  function moveDrag(e: React.PointerEvent, container: HTMLElement | null) {
    if (!draggingRef.current) return;
    jumpToClientY(e.clientY, container);
  }
  function endDrag() {
    if (!draggingRef.current) return;
    setDragging(false);
    draggingRef.current = false;
    flash();
    markScrolling();
  }

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, []);

  if (dates.length <= 1) return null;

  const active = parseDate(dates[activeIndex]);
  const showBubble = visible || dragging;
  // 移动端把手:常驻(闲时低透明度),活跃滚动 / 拖拽时高亮——避免"停滚即消失"
  const showHandle = scrolling || dragging;
  const valueText = `${active.month}月${active.day}日 ${active.weekday}`;

  return (
    <>
      {/* ===== 桌面端:右侧刻度轨道(pointer: fine) ===== */}
      <div
        ref={trackRef}
        onPointerDown={(e) => startDrag(e, trackRef.current)}
        onPointerMove={(e) => moveDrag(e, trackRef.current)}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="fixed right-0 top-1/2 z-30 hidden h-[58vh] w-7 -translate-y-1/2 cursor-grab touch-none flex-col items-center justify-between py-2 active:cursor-grabbing [@media(pointer:fine)]:flex"
        role="slider"
        aria-label="按日期快速定位"
        aria-valuemin={0}
        aria-valuemax={dates.length - 1}
        aria-valuenow={activeIndex}
        aria-valuetext={valueText}
        tabIndex={-1}
      >
        {dates.map((d, i) => {
          const isActive = i === activeIndex;
          return (
            <span
              key={d}
              className={`rounded-full transition-all duration-200 ${
                isActive
                  ? "h-[3px] w-3.5 bg-highlight opacity-100"
                  : `h-[2px] w-1.5 bg-border ${showBubble ? "opacity-100" : "opacity-40"}`
              }`}
            />
          );
        })}
      </div>

      {/* ===== 移动端:右侧快滚把手(pointer: coarse) =====
           只有按在把手本身才拖拽;把手区域之外不拦截,页面正常滚动。 */}
      <div
        ref={handleRef}
        className="fixed right-0 top-1/2 z-30 hidden h-[60vh] w-12 -translate-y-1/2 [@media(pointer:coarse)]:block"
        aria-hidden="true"
      >
        {/* 把手胶囊:绝对定位在轨道内,按 activeIndex 比例上下移动,跟手 */}
        <div
          onPointerDown={(e) => startDrag(e, handleRef.current)}
          onPointerMove={(e) => moveDrag(e, handleRef.current)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ top: `${(activeIndex / Math.max(1, dates.length - 1)) * 100}%` }}
          className={`absolute right-1.5 flex h-11 w-11 -translate-y-1/2 touch-none items-center justify-center rounded-full border shadow-lg shadow-black/40 backdrop-blur-md transition-[opacity,transform,border-color] duration-200 ${
            dragging
              ? "scale-110 border-highlight/70 bg-card"
              : "border-border bg-card/85"
          } ${showHandle ? "opacity-100" : "opacity-60"}`}
          role="slider"
          aria-label="按日期快速定位"
          aria-valuemin={0}
          aria-valuemax={dates.length - 1}
          aria-valuenow={activeIndex}
          aria-valuetext={valueText}
          tabIndex={-1}
        >
          <span className="text-sm font-bold tabular-nums text-foreground">{active.day}</span>
        </div>
      </div>

      {/* ===== 移动端拖拽 HUD =====
           拖拽把手时,屏幕正中浮现大号实心日期卡(iOS 快滚范式),彻底不压内容、最醒目。
           仅移动端 + dragging 时显示;松手即消失。 */}
      <div
        className={`pointer-events-none fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 transition-all duration-150 [@media(pointer:fine)]:hidden ${
          dragging ? "scale-100 opacity-100" : "scale-90 opacity-0"
        }`}
        aria-hidden="true"
      >
        <div className="flex flex-col items-center gap-1 rounded-3xl border border-highlight/40 bg-card px-8 py-6 shadow-2xl shadow-black/60">
          <span className="text-xs font-medium text-muted">{active.month}月</span>
          <span className="text-5xl font-bold tabular-nums leading-none text-foreground">{active.day}</span>
          <span className="mt-1 text-base font-semibold text-highlight">{active.weekday}</span>
        </div>
      </div>

      {/* ===== 常规日期气泡 =====
           移动端:被动滚动时小号贴左、跟随把手垂直位置(拖拽时隐藏,让位给上面的 HUD)。
           桌面端:固定屏幕中部右侧(双列留白区,不遮挡;拖拽时也显示)。 */}
      <div
        style={{ ["--ratio" as string]: activeIndex / Math.max(1, dates.length - 1) }}
        className={`pointer-events-none fixed z-30 left-3 top-[calc(20vh+var(--ratio)*60vh)] -translate-y-1/2 transition-all duration-200 [@media(pointer:fine)]:left-auto [@media(pointer:fine)]:right-12 [@media(pointer:fine)]:top-1/2 [@media(pointer:fine)]:duration-300 ${
          // 移动端:滚动浮现且非拖拽时显示(拖拽交给居中 HUD)
          showBubble && !dragging ? "translate-x-0 opacity-100" : "-translate-x-3 opacity-0"
        } ${
          // 桌面端:只要 showBubble 就显示(含拖拽),覆盖移动端的隐藏态
          showBubble ? "[@media(pointer:fine)]:!translate-x-0 [@media(pointer:fine)]:!opacity-100" : "[@media(pointer:fine)]:!translate-x-3 [@media(pointer:fine)]:!opacity-0"
        }`}
        aria-hidden="true"
      >
        <div
          className={`flex items-center gap-3 rounded-2xl border bg-card/95 px-4 py-2.5 shadow-xl shadow-black/50 backdrop-blur-md transition-[transform,border-color] duration-200 ${
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
