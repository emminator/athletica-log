const metrics = [
  { value: "4", label: "Einheiten diese Woche" },
  { value: "18.240 kg", label: "Trainingsvolumen" },
  { value: "+7,5 %", label: "Fortschritt in 30 Tagen" },
];

export default function Home() {
  return (
    <main>
      <nav><strong>Athletica Log</strong><span>Übersicht&nbsp;&nbsp; Training&nbsp;&nbsp; Planung</span></nav>
      <header>
        <p className="eyebrow">TRAIN. TRACK. PROGRESS.</p>
        <h1>Dein Training.<br />Messbar besser.</h1>
        <p className="intro">Plane deine nächste Einheit, erfasse jeden Satz und erkenne, was dich wirklich voranbringt.</p>
        <button>Training starten</button>
      </header>
      <section aria-label="Trainingsübersicht">
        {metrics.map((metric) => <article key={metric.label}><b>{metric.value}</b><span>{metric.label}</span></article>)}
      </section>
    </main>
  );
}

