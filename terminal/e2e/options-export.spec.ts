import { expect, test, type Download } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

type FixtureEvent = Record<string, unknown> & { id: string; root: string; ts: string };
type FixtureFeed = Record<string, unknown> & { events: FixtureEvent[] };

function fullTapeFeed(): FixtureFeed {
  const fixture = JSON.parse(
    readFileSync(path.join(process.cwd(), "public", "data", "flow_fixture.json"), "utf8"),
  ) as { feed: FixtureFeed };
  const source = fixture.feed.events;
  return {
    ...fixture.feed,
    events: Array.from({ length: 175 }, (_, index): FixtureEvent => ({
      ...source[index % source.length],
      id: `csv-${String(index).padStart(3, "0")}`,
      ts: new Date(Date.parse("2026-07-05T15:42:00Z") - index * 1_000).toISOString(),
    })),
  };
}

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("download stream unavailable");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function csvLines(csv: string): string[] {
  expect(csv.charCodeAt(0)).toBe(0xFEFF);
  expect(csv.endsWith("\r\n")).toBe(true);
  return csv.slice(1).split("\r\n");
}

test("Tape exports the complete filtered/sorted set with display-only metadata", async ({ page }, testInfo) => {
  const feed = fullTapeFeed();
  await page.route(/\/api\/flow\/stream\?f=feed$/, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
      },
      // A long retry prevents the finite intercepted frame from reconnecting and
      // being replaced by the smaller stock fixture during the assertions.
      body: `retry: 60000\n\ndata: ${JSON.stringify(feed)}\n\n`,
    });
  });

  await page.goto("/options?tab=tape");
  const exportButton = page.locator('[data-options-export="tape-csv-v1"]');
  await expect(exportButton).toBeVisible();
  await expect(exportButton).toContainText("Export CSV · 175");
  await expect(exportButton).toHaveAttribute("data-export-contract", "terminal.options_tape_csv/v1");
  if (testInfo.project.name === "mobile") {
    const bounds = await exportButton.evaluate((button) => {
      const control = button.getBoundingClientRect();
      const rail = button.closest(".flow-filter-bar")?.getBoundingClientRect();
      return {
        controlLeft: control.left,
        controlRight: control.right,
        railLeft: rail?.left ?? Number.NaN,
        railRight: rail?.right ?? Number.NaN,
        viewportWidth: window.innerWidth,
      };
    });
    expect(bounds.controlLeft).toBeGreaterThanOrEqual(bounds.railLeft - 1);
    expect(bounds.controlRight).toBeLessThanOrEqual(bounds.railRight + 1);
    expect(bounds.controlRight).toBeLessThanOrEqual(bounds.viewportWidth);
  }

  const fullDownloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const fullDownload = await fullDownloadPromise;
  const fullCsv = await downloadText(fullDownload);
  const fullLines = csvLines(fullCsv);

  expect(fullDownload.suggestedFilename()).toBe(
    "mastermind-options-tape_2026-07-05_20260705T154200Z.csv",
  );
  expect(fullLines).toHaveLength(177); // header + 175 events + final empty segment
  const columns = fullLines[0].split(",");
  const idColumn = columns.indexOf("event_id");
  const rootColumn = columns.indexOf("root");
  expect(idColumn).toBeGreaterThan(-1);
  expect(rootColumn).toBeGreaterThan(-1);
  expect(fullLines[1].split(",")[idColumn]).toBe("csv-000");
  expect(fullLines[175].split(",")[idColumn]).toBe("csv-174");
  expect(fullLines[1]).toContain("terminal.options_tape_csv/v1,display_only,tilde_inferred");
  expect(fullCsv).toContain(",~buy,");
  expect(fullCsv).toContain(",~sell,");

  const expectedNvda = feed.events.filter((event) => event.root === "NVDA").length;
  await page.getByPlaceholder("Ticker…").fill("NVDA");
  await expect(exportButton).toContainText(`Export CSV · ${expectedNvda}`);

  const filteredDownloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const filteredLines = csvLines(await downloadText(await filteredDownloadPromise));
  expect(filteredLines).toHaveLength(expectedNvda + 2);
  for (const line of filteredLines.slice(1, -1)) {
    expect(line.split(",")[rootColumn]).toBe("NVDA");
  }

  await page.getByPlaceholder("Ticker…").fill("ZZZZZZ");
  await expect(exportButton).toContainText("Export CSV · 0");
  await expect(exportButton).toBeDisabled();

  // Returning Chinese users hydrate from the persisted locale before the hub
  // paints; the export control must follow the same bilingual contract.
  await page.evaluate(() => window.localStorage.setItem("mm.lang", "zh"));
  await page.reload();
  await expect(exportButton).toContainText("导出 CSV · 175");
  await expect(exportButton).toHaveAttribute("aria-label", "导出 CSV: 175");
});
