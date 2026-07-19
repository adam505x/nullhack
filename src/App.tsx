import { useEffect, useMemo, useReducer, useState } from "react";
import confetti from "canvas-confetti";
import { ArtematorEngine } from "./engine/engine";
import type { Answer, Catalog, EngineState, Item } from "./engine/types";
import catalogJson from "./data/catalog.json";

const catalog = catalogJson as Catalog;

type Pose = "idle" | "waiting" | "thinking" | "focus" | "reveal";

// While asking, the genie cycles through poses every couple of questions so he
// feels alive; "focus" is reserved for when he's closing in on an answer.
const ASKING_CYCLE: Pose[] = ["waiting", "thinking", "idle"];
const IDLE_CUE_DELAY = 15_000;
const IDLE_CUE_LENGTH = 1_400;

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
  const imageFrame = (
    <div className="item-card__frame">
      <img src={item.image} alt={item.name} />
    </div>
  );

  return (
    <figure className={`item-card${large ? " item-card--large" : ""}`}>
      {item.url ? (
        <a
          className="item-card__image-link"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View the product image for ${item.name}`}
        >
          {imageFrame}
        </a>
      ) : (
        imageFrame
      )}
      <figcaption>
        <span className="item-card__type">{item.articleType}</span>
        <span className="item-card__name">{item.name}</span>
        {item.url && (
          <a
            className="item-card__link"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            View product ↗
          </a>
        )}
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

function Mascot({ pose, imageOverride }: { pose: Pose; imageOverride?: string }) {
  const [displayPose, setDisplayPose] = useState(pose);
  const [previousPose, setPreviousPose] = useState<Pose | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (pose === displayPose) return;

    setPreviousPose(displayPose);
    setDisplayPose(pose);
    setIsTransitioning(false);

    const frame = requestAnimationFrame(() => setIsTransitioning(true));
    const timeout = window.setTimeout(() => setPreviousPose(null), 180);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [displayPose, pose]);

  return (
    <div className="genie" data-pose={pose}>
      {previousPose && (
        <img
          className={`genie__image genie__image--previous${isTransitioning ? " is-transitioning" : ""}`}
          src={`/artem/${previousPose}.webp`}
          alt=""
          aria-hidden="true"
        />
      )}
        <img
          className={`genie__image genie__image--current${previousPose && !isTransitioning ? " is-pending" : ""}${isTransitioning ? " is-transitioning" : ""}`}
          src={imageOverride ?? `/artem/${displayPose}.webp`}
        alt="The Artemator genie"
        data-testid="mascot"
        data-pose={pose}
      />
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
  const [isWhistleReaction, setIsWhistleReaction] = useState(false);

  useEffect(() => {
    if (state.status !== "won") return;

    if (window.self !== window.top) {
      window.parent.postMessage({ source: "artemator", type: "won" }, "*");
      return;
    }

    void confetti({
      particleCount: 120,
      spread: 72,
      startVelocity: 32,
      origin: { y: 0.62 },
      colors: ["#b08d4c", "#141414", "#e5e5e5"],
      disableForReducedMotion: true,
    });
  }, [state.status]);

  useEffect(() => {
    if (window.self === window.top) return;

    const cue = new Audio("/sounds/whistle-snap.mp3");
    cue.preload = "auto";
    cue.volume = 1;
    let idleTimer: number | undefined;
    let stopTimer: number | undefined;
    let hasPlayed = false;

    const clearTimers = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      if (stopTimer !== undefined) window.clearTimeout(stopTimer);
    };

    const scheduleCue = () => {
      if (hasPlayed) return;
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        hasPlayed = true;
        setIsWhistleReaction(true);
        cue.currentTime = 0;
        void cue.play().catch(() => undefined);
        stopTimer = window.setTimeout(() => {
          cue.pause();
          cue.currentTime = 0;
          setIsWhistleReaction(false);
        }, IDLE_CUE_LENGTH);
      }, IDLE_CUE_DELAY);
    };

    window.addEventListener("pointerdown", scheduleCue);
    scheduleCue();

    return () => {
      clearTimers();
      cue.pause();
      cue.currentTime = 0;
      setIsWhistleReaction(false);
      window.removeEventListener("pointerdown", scheduleCue);
    };
  }, []);

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

      <Mascot
        pose={pose}
        imageOverride={
          state.status === "won"
            ? "/artem/confetti.webp"
            : isWhistleReaction
              ? "/artem/leonardo.webp"
              : undefined
        }
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
                style={{
                  transform: `scaleX(${state.topProbability})`,
                }}
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
