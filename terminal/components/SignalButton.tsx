interface Half {
  label: string;
  color: string;
  sub?: string | null;
  dim?: boolean;
  note?: string | null;
}

interface Props {
  oracle: Half;
  desk: Half;
  oracleLabel: string;
  deskLabel: string;
  viewLabel: string;
  onView: () => void;
}

export default function SignalButton({ oracle, desk, oracleLabel, deskLabel, viewLabel, onView }: Props) {
  const title =
    oracleLabel + (oracle.note ? ` — ${oracle.note}` : "") +
    " · " +
    deskLabel + (desk.note ? ` — ${desk.note}` : "");
  return (
    <button className="sig-btn" onClick={onView} title={title}>
      <span className={"sig-btn-half sig-btn-go" + (oracle.dim ? " sig-btn-stale" : "")} style={{ ["--vc" as any]: oracle.color }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" fill="var(--vc)" />
        </svg>
        <span className="sig-btn-lbl">{oracleLabel}</span>
        {/* sub always renders (nbsp placeholder) so the two halves stay height-symmetric
            and the absolutely-centered View pill sits exactly on their boundary */}
        <span className="sig-btn-vwrap">
          <span className="sig-btn-vd">{oracle.label}</span>
          <span className="sig-btn-sub">{oracle.sub || " "}</span>
        </span>
      </span>
      <span className="sig-btn-seam">
        <span className="sig-btn-view">{viewLabel}</span>
      </span>
      <span className={"sig-btn-half sig-btn-rd" + (desk.dim ? " sig-btn-stale" : "")} style={{ ["--vc" as any]: desk.color }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--vc)" strokeWidth={2} aria-hidden="true">
          <path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" />
        </svg>
        <span className="sig-btn-lbl">{deskLabel}</span>
        <span className="sig-btn-vwrap">
          <span className="sig-btn-vd">{desk.label}</span>
          <span className="sig-btn-sub">{desk.sub || " "}</span>
        </span>
      </span>
    </button>
  );
}
