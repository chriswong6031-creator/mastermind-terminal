# OpenMarket-inspired Drawing Studio verification

Captured from the shared Terminal implementation on 2026-07-31 with fixture
market data and a seeded Fibonacci, XABCD, and Long Position collection.

| Artifact | Contract proved |
|---|---|
| `desktop-dark-lines.png` | 1440x900 desktop rail, line-family flyout, chart overlays |
| `desktop-dark-fib-inspector.png` | Selected Fibonacci, contextual style/settings inspector |
| `tablet-dark-shapes.png` | 820x1180 portalled shapes menu and horizontal dock |
| `mobile-dark-forecasting.png` | 390x844 forecasting flyout, touch dock, safe viewport fit |
| `desktop-zh-shapes.png` | Chinese LEX strings remain isolated from the English state |

Terminal is intentionally dark-only: the account Light preference is synchronized
for Macro Dashboard but is not applied to Terminal. Therefore a fabricated light
Terminal capture would not be a valid product state; the English dark and Chinese
dark states above are the applicable theme/language proof.

Automated verification additionally covers keyboard focus boundaries, reduced
motion, safe-area offsets, pointer cancellation, tool switching, genuine text
double-click editing, drawing styles, dense paths, and serialized persistence.
