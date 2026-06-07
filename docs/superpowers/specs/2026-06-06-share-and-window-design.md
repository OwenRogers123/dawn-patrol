# Design: Working Share Button + Narrower Best Window

Date: 2026-06-06

## Problem

1. **Share button does nothing on desktop.** On Mac browsers `navigator.share`
   is undefined, so the code falls back to `clipboard.writeText`. The only
   feedback is the button text flipping for 1.8s — easy to miss, and the write
   can silently fail if the page isn't focused. Result: "nothing happens."

2. **Best window is too wide.** `bestWindow()` extends the window while each
   next hour is within 10 points of the *start* hour, producing ranges over
   4 hours. Not useful for deciding when to paddle out.

## Design

### 1. Share this call (`js/app.js`)

- Keep `navigator.share` path for mobile (native share sheet).
- Desktop: copy to clipboard, then show **both** a toast confirmation and a
  small selectable text box containing the share text.
- If clipboard throws, still show the box (never silently fails).
- Toast auto-dismisses (~2s). The box persists until the next call is
  generated or the user dismisses it.

### 2. Best window (`js/coach.js bestWindow`)

New algorithm:
- Find the single peak hour (highest score).
- Extend left and right only to neighbors within **4 points** of the peak.
- **Cap total window length at 2 hours.**
- If no neighbor qualifies, window = the single peak hour
  (renders as "around 7am").
- Otherwise renders a tight range (e.g. "7–9am").

Both `buildShareText()` and `renderTimeline()` already read `result.window`,
so they pick up the tighter window automatically.

## Testing

- Unit-test `bestWindow()`: single clear peak collapses to one hour; a genuine
  plateau yields a ≤2-hour range; never exceeds 2 hours.
- Manual: load app on desktop, click Share, confirm toast + text box appear and
  clipboard contains the text.
