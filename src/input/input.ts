"use client";
// Action-based input (input-systems skill): gameplay reads actions, never raw keys.
// Keyboard uses physical codes (KeyW…) so WASD works on Arabic/AZERTY layouts.

export const input = {
  move: { x: 0, y: 0 }, // x: strafe right+, y: forward+   (keyboard + joystick merged)
  joy: { x: 0, y: 0 },
  look: { dx: 0, dy: 0 }, // accumulated radians since last frame
  sprint: false,
  interact: false, // edge: consumed by the game loop
  keys: new Set<string>(),
};

const BINDINGS: Record<string, "forward" | "back" | "left" | "right"> = {
  KeyW: "forward", ArrowUp: "forward",
  KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
};

export function recomputeMove() {
  const k = input.keys;
  const has = (a: string) => [...k].some((c) => BINDINGS[c] === a);
  let x = (has("right") ? 1 : 0) - (has("left") ? 1 : 0) + input.joy.x;
  let y = (has("forward") ? 1 : 0) - (has("back") ? 1 : 0) + input.joy.y;
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; } // keep diagonals the same speed
  input.move.x = x;
  input.move.y = y;
}

/** Radial deadzone with rescale, as recommended by input-systems. */
export function applyDeadzone(x: number, y: number, dead = 0.15) {
  const mag = Math.hypot(x, y);
  if (mag < dead) return { x: 0, y: 0 };
  const scaled = Math.min((mag - dead) / (1 - dead), 1);
  return { x: (x / mag) * scaled, y: (y / mag) * scaled };
}

export function isMoveKey(code: string) {
  return code in BINDINGS;
}

export function clearInput() {
  input.keys.clear();
  input.joy.x = input.joy.y = 0;
  input.look.dx = input.look.dy = 0;
  input.sprint = false;
  input.interact = false;
  recomputeMove();
}
