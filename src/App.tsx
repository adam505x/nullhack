import { useMemo, useReducer, useState } from "react";
import { ArtematorEngine } from "./engine/engine";
import type { Answer, Catalog, EngineState, Item } from "./engine/types";
import catalogJson from "./data/catalog.json";

const catalog = catalogJson as Catalog;

type Pose = "idle" | "waiting" | "thinking" | "focus" | "reveal";

function poseFor(state: EngineState, phase: "start" | "playing"): Pose {
  if (phase === "start") return "idle";
  if (state.status === "won") return "reveal";
  if (state.status === "guessing") return "reveal";
  if (state.status === "defeated") return "thinking";
  if (state.topProbability > 0.55) return "focus";
  if (state.topProbability > 0.25) return "thinking";
  return "waiting";
}

const ANSWERS: { value: Answer; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "probably", label: "Probably" },
  { value: "unknown", label: "Not sure" },
  { value: "probablyNot", label: "Probably not" },
  { value: "no", label: "No" },
];

function Mascot({ pose }: { pose: Pose }) {
  return (
    <div className="mascot" data-testid="mascot" data-pose={pose}>
      <img src={`/artem/${pose}.jpg`} alt={`Artemator looking ${pose}`} />
    </div>
  );
}

function ItemCard({ item, large }: { item: Item; large?: boolean }) {
  return (
    <figure className={`item-card${large ? " item-card--large" : ""}`}>
      <div className="item-card__frame">
        <img src={item.image} alt={item.name} />
      </div>
      <figcaption>
        <span className="item-card__type">{item.articleType}</span>
        <span className="item-card__name">{item.name}</span>
      </figcaption>
    </figure>
  );
}

export default function App() {
  const engine = useMemo(
    () => new ArtematorEngine(catalog, { rng: Math.random }),
    []
  );
  const [phase, setPhase] = useState<"start" | "playing">("start");
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const state = engine.state;
  const pose = poseFor(state, phase);

  const start = () => {
    engine.reset();
    setPhase("playing");
    bump();
  };
  const answer = (a: Answer) => {
    engine.answer(a);
    bump();
  };
  const confirm = (ok: boolean) => {
    engine.confirmGuess(ok);
    bump();
  };

  return (
    <div className="stage">
      <header className="brand">
        <span className="brand__mark">Artemator</span>
        {phase === "playing" && state.status === "asking" && (
          <span className="brand__count">Question {state.questionsAsked + 1}</span>
        )}
      </header>

      <main className="card" data-status={phase === "start" ? "start" : state.status}>
        <Mascot pose={pose} />

        {phase === "start" && (
          <section className="screen">
            <h1 className="display">
              Think of a piece <em>you're craving.</em>
            </h1>
            <p className="sub">
              Answer a few questions — I'll read your style and find it. No
              wrong answers.
            </p>
            <button className="btn btn--primary" onClick={start}>
              Start
            </button>
          </section>
        )}

        {phase === "playing" && state.status === "asking" && state.question && (
          <section className="screen" key={state.question.id}>
            <h1 className="display display--question">{state.question.question}</h1>
            <div className="answers">
              {ANSWERS.map((a) => (
                <button
                  key={a.value}
                  className="btn btn--answer"
                  onClick={() => answer(a.value)}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div className="confidence" aria-hidden="true">
              <div
                className="confidence__fill"
                style={{ width: `${Math.round(state.topProbability * 100)}%` }}
              />
            </div>
          </section>
        )}

        {phase === "playing" && state.status === "guessing" && state.guess && (
          <section className="screen">
            <p className="eyebrow">I'm seeing it…</p>
            <ItemCard item={state.guess} large />
            <div className="answers answers--confirm">
              <button className="btn btn--primary" onClick={() => confirm(true)}>
                That's it
              </button>
              <button className="btn btn--answer" onClick={() => confirm(false)}>
                No — keep looking
              </button>
            </div>
          </section>
        )}

        {phase === "playing" && state.status === "won" && state.guess && (
          <section className="screen">
            <p className="eyebrow">Read you like a lookbook.</p>
            <ItemCard item={state.guess} large />
            <p className="sub">
              Found in {state.questionsAsked} questions
              {state.rejectedCount > 0 ? ` (after ${state.rejectedCount} miss${state.rejectedCount > 1 ? "es" : ""})` : ""}.
            </p>
            <button className="btn btn--primary" onClick={start}>
              Play again
            </button>
          </section>
        )}

        {phase === "playing" && state.status === "defeated" && (
          <section className="screen">
            <p className="eyebrow">You've got rare taste.</p>
            <h1 className="display">My shortlist for you</h1>
            <div className="shortlist">
              {state.ranking.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
            <button className="btn btn--primary" onClick={start}>
              Play again
            </button>
          </section>
        )}
      </main>

      <footer className="foot">an Akinator for your wardrobe · nullhacks '26</footer>
    </div>
  );
}
