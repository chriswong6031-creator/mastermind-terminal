interface Props {
  oracle: { label: string; color: string };
  desk: { label: string; color: string };
  oracleLabel: string;
  deskLabel: string;
  viewLabel: string;
  onView: () => void;
}

export default function SignalButton({ oracle, desk, oracleLabel, deskLabel, viewLabel, onView }: Props) {
  return (
    <button className="sig-btn" onClick={onView} title={oracleLabel + " · " + deskLabel}>
      <span className="sig-btn-half sig-btn-go" style={{ ["--vc" as any]: oracle.color }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" fill="var(--vc)" />
        </svg>
        <span className="sig-btn-lbl">{oracleLabel}</span>
        <span className="sig-btn-vd">{oracle.label}</span>
      </span>
      <span className="sig-btn-seam">
        <span className="sig-btn-view">{viewLabel}</span>
      </span>
      <span className="sig-btn-half sig-btn-rd" style={{ ["--vc" as any]: desk.color }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--vc)" strokeWidth={2} aria-hidden="true">
          <path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" />
        </svg>
        <span className="sig-btn-lbl">{deskLabel}</span>
        <span className="sig-btn-vd">{desk.label}</span>
      </span>
    </button>
  );
}
