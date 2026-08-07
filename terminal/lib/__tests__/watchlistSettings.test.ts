import { describe, expect, it } from "vitest";
import {
  DEFAULT_WATCHLIST_SETTINGS,
  WATCHLIST_SETTINGS_VERSION,
  resolveWatchlistSettings,
} from "../watchlistSettings";

describe("resolveWatchlistSettings", () => {
  it("turns logos on once for a legacy workspace", () => {
    const result = resolveWatchlistSettings({
      ...DEFAULT_WATCHLIST_SETTINGS,
      logo: false,
      disp: "both",
    }, 0);

    expect(result.migrated).toBe(true);
    expect(result.version).toBe(WATCHLIST_SETTINGS_VERSION);
    expect(result.settings.logo).toBe(true);
    expect(result.settings.disp).toBe("both");
  });

  it("preserves an explicit logo-off choice after migration", () => {
    const result = resolveWatchlistSettings({
      ...DEFAULT_WATCHLIST_SETTINGS,
      logo: false,
    }, WATCHLIST_SETTINGS_VERSION);

    expect(result.migrated).toBe(false);
    expect(result.settings.logo).toBe(false);
  });

  it("preserves legacy columns and custom widths while adding new defaults", () => {
    const result = resolveWatchlistSettings({
      tableView: false,
      cols: { last: false, volume: true },
      colW: { sym: 180 },
      disp: "name",
      logo: false,
    }, 0);

    expect(result.settings).toMatchObject({
      tableView: false,
      cols: {
        last: false,
        changePct: true,
        change: false,
        volume: true,
        ext: true,
      },
      colW: { sym: 180 },
      disp: "name",
      logo: true,
    });
  });

  it("gives a fresh workspace the complete current defaults", () => {
    const result = resolveWatchlistSettings(undefined, Number.NaN);

    expect(result.migrated).toBe(true);
    expect(result.settings).toEqual(DEFAULT_WATCHLIST_SETTINGS);
  });
});
