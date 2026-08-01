import WorkoutLogger from "./workout-logger";

export default function Home() {
  return (
    <main>
      <nav>
        <strong>Athletica Log</strong>
        <span>Übersicht&nbsp;&nbsp; Training&nbsp;&nbsp; Planung</span>
      </nav>
      <header>
        <p className="eyebrow">TRAIN. TRACK. PROGRESS.</p>
        <h1>Dein Training.<br />Messbar besser.</h1>
        <p className="intro">
          Erfasse deine Übungen und speichere deine erste vollständige Trainingseinheit.
        </p>
      </header>
      <WorkoutLogger />
    </main>
  );
}

