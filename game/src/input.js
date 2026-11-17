// SOLMAR HEAT — input.js
// One clear job: keyboard + mouse state for the whole game. The game loop
// reads this; nothing else touches DOM events. Mouse drag orbits the
// camera; clicking the canvas also tries pointer lock (best effort).

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, consumed by the game loop
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false; // edge-triggered left click
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        if (document.pointerLockElement !== canvas) {
          canvas.requestPointerLock?.();
        }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseDown = false;
        this.dragging = false;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      } else if (this.dragging) {
        this.mouseDX += e.clientX - this.lastX;
        this.mouseDY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas) this.dragging = false;
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once, on the frame the key went down. The game loop calls
  // endFrame() to clear the edge sets.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  consumeMouseDelta() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  consumeClick() {
    const c = this.mouseClicked;
    this.mouseClicked = false;
    return c;
  }

  endFrame() {
    this.pressed.clear();
  }

  // Synthetic input for headless play-tests and shot staging: the test
  // harness (or ?shot=) can drive the game through window.__solmarTest.
  injectKey(code, down) {
    if (down) {
      this.keys.add(code);
      this.pressed.add(code);
    } else {
      this.keys.delete(code);
    }
  }
}
