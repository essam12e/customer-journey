"use client";
import { useRef, useState } from "react";
import { applyDeadzone, input, recomputeMove } from "@/input/input";

const R = 56; // joystick radius in px

/** Virtual joystick (left thumb). Pointer events so it works with touch, pen and mouse. */
export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const pid = useRef<number | null>(null);

  const update = (cx: number, cy: number) => {
    const r = base.current!.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > R) { dx = (dx / m) * R; dy = (dy / m) * R; }
    setKnob({ x: dx, y: dy, active: true });
    const v = applyDeadzone(dx / R, -dy / R, 0.15);
    input.joy.x = v.x;
    input.joy.y = v.y;
    input.sprint = Math.hypot(v.x, v.y) > 0.95;
    recomputeMove();
  };
  const end = () => {
    pid.current = null;
    setKnob({ x: 0, y: 0, active: false });
    input.joy.x = input.joy.y = 0;
    input.sprint = false;
    recomputeMove();
  };

  return (
    <div
      ref={base}
      id="joystick"
      className={`joystick ${knob.active ? "on" : ""}`}
      onPointerDown={(e) => { pid.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); update(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (e.pointerId === pid.current) update(e.clientX, e.clientY); }}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="عصا الحركة"
    >
      <div className="joy-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
