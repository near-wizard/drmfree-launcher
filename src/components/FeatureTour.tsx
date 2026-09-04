import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { track } from "../lib/analytics";
import type { Tab } from "../lib/lastTab";

export interface TourStep {
  id: string;
  tab: Tab;
  /** CSS selector for the real element to spotlight — set via a
   *  data-tour="..." attribute on the target, not a class name, so
   *  this never silently breaks/mismatches when styling changes. */
  selector: string;
  title: string;
  body: string;
}

interface FeatureTourProps {
  steps: TourStep[];
  currentTab: Tab;
  onChangeTab: (tab: Tab) => void;
  onDone: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// A live coach-mark tour over the real UI, not a modal describing it —
// switches tabs itself and spotlights the actual element for each
// step. Deliberately non-blocking (the dimmed overlay has
// pointer-events: none): the app underneath stays fully interactive
// during the tour, including the very element being spotlighted, so
// trying the feature while it's being explained works rather than
// fighting a modal to get out of the way first.
export function FeatureTour({ steps, currentTab, onChangeTab, onDone }: FeatureTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[index];

  useLayoutEffect(() => {
    if (!step) return;
    if (step.tab !== currentTab) {
      onChangeTab(step.tab);
      return; // re-run once currentTab actually reflects the switch
    }

    let cancelled = false;
    let raf: number;
    let checkedExistence = false;
    // Tracks continuously, not just once (+ a window-resize listener)
    // — clicks pass through to the real target underneath (see the
    // component doc comment above), so the page content itself can
    // reflow mid-step (e.g. clicking "+ Add a DRM-free game" expands
    // a form above the search box being spotlighted next). A one-shot
    // measurement went stale the moment that happened: found live,
    // the spotlight box ended up boxing the wrong element entirely
    // once the layout shifted underneath it.
    function measure() {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(step.selector);
      if (!el) {
        // Nothing to spotlight for this step in the library's current
        // state (e.g. an empty library skips the freedom dashboard) —
        // move on rather than getting stuck showing nothing. Only
        // checked once per step: a target legitimately toggling in
        // and out of the DOM later (unlikely here, but not worth
        // relying on) shouldn't itself cause a skip.
        if (!checkedExistence) {
          checkedExistence = true;
          advance();
        }
        return;
      }
      const r = el.getBoundingClientRect();
      setRect((prev) =>
        prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
      raf = requestAnimationFrame(measure);
    }
    raf = requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, currentTab]);

  function advance() {
    if (index >= steps.length - 1) {
      track("feature_tour_completed");
      onDone();
      return;
    }
    setRect(null);
    setIndex((i) => i + 1);
  }

  function skip() {
    track("feature_tour_skipped", { step: step?.id, index });
    onDone();
  }

  if (!step || !rect) return null;

  // Callout below the target by default; flips above when there's
  // not enough room beneath it (e.g. a step near the bottom of the
  // window).
  const flip = rect.top + rect.height + 172 > window.innerHeight;
  const calloutStyle = flip
    ? { top: rect.top - 12, left: Math.max(12, rect.left), transform: "translateY(-100%)" }
    : { top: rect.top + rect.height + 12, left: Math.max(12, rect.left) };

  return createPortal(
    <div className="feature-tour-layer">
      <div
        className="feature-tour-spotlight"
        style={{
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
        }}
      />
      <div className="feature-tour-callout" style={calloutStyle}>
        <p className="feature-tour-progress">
          {index + 1} / {steps.length}
        </p>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="feature-tour-actions">
          <button className="feature-tour-skip" onClick={skip}>
            Skip tour
          </button>
          <button className="compare-deal-buy-button feature-tour-next" onClick={advance}>
            {index === steps.length - 1 ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
