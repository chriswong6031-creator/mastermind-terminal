"use client";

interface CsvDownload {
  csv: string;
  filename: string;
}

export interface OptionsCsvExportButtonProps {
  label: string;
  rowCount: number;
  buildDownload: () => CsvDownload;
  exportId?: string;
  exportContract?: string;
}

/** Browser-only download control kept separate from the pure CSV contract. */
export function OptionsCsvExportButton({
  label,
  rowCount,
  buildDownload,
  exportId = "tape-csv-v1",
  exportContract = "terminal.options_tape_csv/v1",
}: OptionsCsvExportButtonProps) {
  const download = () => {
    if (rowCount === 0) return;
    const artifact = buildDownload();
    const blob = new Blob([artifact.csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = artifact.filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
    }
  };

  return (
    <button
      type="button"
      className="chip"
      disabled={rowCount === 0}
      onClick={download}
      aria-label={`${label}: ${rowCount}`}
      title={`${label} (${rowCount})`}
      data-options-export={exportId}
      data-export-contract={exportContract}
      style={{
        height: 28,
        marginLeft: "auto",
        flexShrink: 0,
        whiteSpace: "nowrap",
        fontSize: 11,
      }}
    >
      {label} · {rowCount.toLocaleString("en-US")}
    </button>
  );
}
