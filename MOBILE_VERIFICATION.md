# Real-device mobile verification checklist

Automated coverage uses a 390×844 headless Edge viewport and synthetic PointerEvents. It does **not** establish physical-device FPS, touch latency, browser chrome behavior, thermal stability, or safe-area correctness.

Automated prerequisites also cover six-face soft-boundary rebound and elite knockback, asteroid wall reflection, inclusive ordinary/elite recycling thresholds, and 60 seconds of simulated clear-field forward flight with rendered/live/finite state checks. These are controlled logic checks, not natural-hazard survival or the real-device run below. Viewport screenshots are preliminary observations, not device-specific sign-off.

Run this checklist on each supported phone/browser and record the device, OS, browser version, orientation, and result. Start from the landing page with a fresh reload.

- [ ] Start a run and fly freely for 60 seconds without a reload, freeze, blank frame, or unintended pause.
- [ ] Observe FPS with the device/browser's own developer tooling for the full 60-second run; record the observed range and any sustained drops rather than inferring performance from headless Edge.
- [ ] In portrait and landscape, hold the left movement stick while dragging the right look area; confirm both inputs remain active and neither steals the other's pointer.
- [ ] Push the left stick slowly past the boost threshold, hover near the edge, then return toward center; confirm boost engages near the outer edge and releases only after moving clearly inward, without rapid flutter.
- [ ] Tap and hold fire while moving and looking; confirm firing starts, continues while held, and stops on release or pointer cancellation.
- [ ] Pause with the touch button, resume, then open and close settings; confirm gameplay pauses behind each overlay, settings focus stays in the dialog, and focus returns to the settings button.
- [ ] From pause, choose **Return home** and confirm the landing page is interactive and the hidden game no longer reacts to touches or keys.
- [ ] Fly toward each world boundary; confirm the soft boundary pushes the ship inward and reduces or reverses outward velocity without a hard stop, getting stuck, or jumping to another axis or the opposite side of the world.
- [ ] Repeat the control checks after forced-landscape mode is entered and exited; confirm movement directions and touch target positions remain correct.

Do not mark real-device validation complete until every checked item has an attached device-specific observation.
