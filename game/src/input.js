// Keyboard + mouse + pointer lock. Keeps its own state object that the
// sim reads each fixed step; look deltas are consumed once per frame.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    lookX: 0,
    lookY: 0,
    firing: false,
    ads: false,
    locked: false,
  };

  function onKeyDown(e) {
    if (e.repeat) return;
    state.keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) {
    state.keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (!state.locked) return;
    state.lookX += e.movementX || 0;
    state.lookY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (!state.locked) return;
    if (e.button === 0) state.firing = true;
    if (e.button === 2) state.ads = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) state.firing = false;
    if (e.button === 2) state.ads = false;
  }
  function onLock() {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) { state.firing = false; state.ads = false; }
    onLockChange(state.locked);
  }
  function onContextMenu(e) {
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    state,
    requestLock() {
      if (document.pointerLockElement !== canvas) {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const out = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return out;
    },
    pressed(code) {
      return state.keys.has(code);
    },
  };
}
