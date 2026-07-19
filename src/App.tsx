import { useMemo, useReducer } from "react";
import { ArtematorEngine } from "./engine/engine";
import type { Answer, Catalog, EngineState, Item } from "./engine/types";
import catalogJson from "./data/catalog.json";

const catalog = catalogJson as Catalog;

type Pose = "idle" | "waiting" | "thinking" | "focus" | "reveal";

// While asking, the genie cycles through poses every couple of questions so he
// feels alive; "focus" is reserved for when he's closing in on an answer.
const ASKING_CYCLE: Pose[] = ["waiting", "thinking", "idle"];

function poseFor(state: EngineState): Pose {
  if (state.status === "won") return "idle"; // arms crossed, proud
  if (state.status === "guessing") return "reveal";
  if (state.status === "defeated") return "thinking";
  if (state.topProbability > 0.55) return "focus";
  return ASKING_CYCLE[Math.floor(state.questionsAsked / 2) % ASKING_CYCLE.length];
}

const ANSWERS: { value: Answer; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "probably", label: "Probably" },
  { value: "unknown", label: "Not sure" },
  { value: "probablyNot", label: "Probably not" },
  { value: "no", label: "No" },
];

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

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="bubble">
      <span className="bubble__tail" aria-hidden="true" />
      {children}
    </div>
  );
}

export default function App() {
  const engine = useMemo(
    () => new ArtematorEngine(catalog, { rng: Math.random }),
    []
  );
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const state = engine.state;
  const pose = poseFor(state);

  const answer = (a: Answer) => {
    engine.answer(a);
    bump();
  };
  const confirm = (ok: boolean) => {
    engine.confirmGuess(ok);
    bump();
  };
  const restart = () => {
    engine.reset();
    bump();
  };

  return (
    <div className="scene">
      <header className="topbar">
        <span className="topbar__mark">Artemator</span>
        {state.status === "asking" && (
          <span className="topbar__count">Question {state.questionsAsked + 1}</span>
        )}
      </header>

      <img
        key={pose}
        className="genie"
        data-testid="mascot"
        data-pose={pose}
        src={`/artem/${pose}.webp`}
        alt="The Artemator genie"
      />

      <main className="panel" data-status={state.status}>
        {state.status === "asking" && state.question && (
          <section className="beat" key={state.question.attributeId}>
            <Bubble>
              <p className="bubble__text">{state.question.prompt}</p>
            </Bubble>
            <div className="options" role="group" aria-label="Answers">
              {ANSWERS.map((a) => (
                <button key={a.value} className="option" onClick={() => answer(a.value)}>
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

        {state.status === "guessing" && state.guess && (
          <section className="beat">
            <Bubble>
              <p className="bubble__text">I'm seeing it — is this your piece?</p>
            </Bubble>
            <ItemCard item={state.guess} large />
            <div className="options">
              <button className="option" onClick={() => confirm(true)}>
                That's it
              </button>
              <button className="option" onClick={() => confirm(false)}>
                No — keep looking
              </button>
            </div>
          </section>
        )}

        {state.status === "won" && state.guess && (
          <section className="beat">
            <Bubble>
              <p className="bubble__text">
                Read you like a lookbook. Found in {state.questionsAsked} questions
                {state.rejectedCount > 0
                  ? ` — after ${state.rejectedCount} miss${state.rejectedCount > 1 ? "es" : ""}`
                  : ""}
                .
              </p>
            </Bubble>
            <ItemCard item={state.guess} large />
            <div className="options">
              <button className="option" onClick={restart}>
                Play again
              </button>
            </div>
          </section>
        )}

        {state.status === "defeated" && (
          <section className="beat">
            <Bubble>
              <p className="bubble__text">
                You've got rare taste — I'm stumped. My shortlist for you:
              </p>
            </Bubble>
            <div className="shortlist">
              {state.ranking.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
            <div className="options">
              <button className="option" onClick={restart}>
                Play again
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="foot">an Akinator for your wardrobe · nullhacks '26</footer>
    </div>
  );
}
