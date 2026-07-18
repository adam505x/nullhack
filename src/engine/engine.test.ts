import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ArtematorEngine, likelihood } from "./engine";
import type { Answer, Catalog, Item } from "./types";
import catalogJson from "../data/catalog.json";

const catalog = catalogJson as Catalog;

/** a simulated user who "wants" `target` and answers from its tags */
function simulatedAnswer(target: Item, attrId: string): Answer {
  const v = target.tags[attrId] ?? 0.5;
  if (v >= 0.7) return "yes";
  if (v >= 0.55) return "probably";
  if (v > 0.4) return "unknown";
  if (v > 0.25) return "probablyNot";
  return "no";
}

/** play a full game as the simulated user; returns the outcome */
function play(target: Item) {
  const engine = new ArtematorEngine(catalog); // deterministic, no rng
  const guessedIds: string[] = [];
  for (let step = 0; step < 200; step++) {
    const s = engine.state;
    if (s.status === "asking" && s.question) {
      engine.answer(simulatedAnswer(target, s.question.id));
    } else if (s.status === "guessing" && s.guess) {
      guessedIds.push(s.guess.id);
      engine.confirmGuess(s.guess.id === target.id);
    } else {
      return { status: s.status, questions: s.questionsAsked, guessedIds };
    }
  }
  throw new Error("game did not terminate");
}

describe("catalog integrity", () => {
  it("has a healthy number of items and attributes", () => {
    expect(catalog.items.length).toBeGreaterThanOrEqual(45);
    expect(catalog.attributes.length).toBeGreaterThanOrEqual(20);
  });

  it("every item image file exists", () => {
    for (const item of catalog.items) {
      const file = path.join(process.cwd(), "public", item.image);
      expect(fs.existsSync(file), `${item.name} -> ${item.image}`).toBe(true);
    }
  });

  it("every tag value is within [0, 1] and refers to a known attribute", () => {
    const known = new Set(catalog.attributes.map((a) => a.id));
    for (const item of catalog.items) {
      for (const [k, v] of Object.entries(item.tags)) {
        expect(known.has(k), `unknown attribute ${k} on ${item.name}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("no two items are near-identical", () => {
    const dist = (a: Item, b: Item) => {
      let d = 0;
      for (const attr of catalog.attributes) {
        d += Math.abs((a.tags[attr.id] ?? 0.5) - (b.tags[attr.id] ?? 0.5));
      }
      return d;
    };
    for (let i = 0; i < catalog.items.length; i++) {
      for (let j = i + 1; j < catalog.items.length; j++) {
        const d = dist(catalog.items[i], catalog.items[j]);
        expect(
          d,
          `${catalog.items[i].name} vs ${catalog.items[j].name} too similar (${d.toFixed(2)})`
        ).toBeGreaterThan(0.25);
      }
    }
  });
});

describe("likelihood model", () => {
  it("rewards agreement and softly penalises disagreement", () => {
    expect(likelihood("yes", 1)).toBeGreaterThan(likelihood("yes", 0));
    expect(likelihood("no", 0)).toBeGreaterThan(likelihood("no", 1));
    expect(likelihood("yes", 0)).toBeGreaterThan(0); // never a hard kill
    expect(likelihood("unknown", 0)).toBe(1);
    expect(likelihood("unknown", 1)).toBe(1);
  });
});

describe("engine convergence (the Akinator moment)", () => {
  it("finds the target item for the overwhelming majority of the catalog", () => {
    let won = 0;
    let totalQuestions = 0;
    const failures: string[] = [];
    for (const target of catalog.items) {
      const result = play(target);
      if (result.status === "won") {
        won++;
        totalQuestions += result.questions;
      } else {
        failures.push(target.name);
      }
    }
    const rate = won / catalog.items.length;
    expect(rate, `win rate ${(rate * 100).toFixed(0)}%; failed: ${failures.join(", ")}`).toBeGreaterThanOrEqual(0.9);
    expect(totalQuestions / won).toBeLessThanOrEqual(13);
  });

  it("never guesses the same item twice in one game", () => {
    for (const target of catalog.items.slice(0, 10)) {
      const { guessedIds } = play(target);
      expect(new Set(guessedIds).size).toBe(guessedIds.length);
    }
  });

  it("recovers when its first guess is rejected", () => {
    // adversarial user: rejects the first guess no matter what, then answers honestly
    const target = catalog.items[0];
    const engine = new ArtematorEngine(catalog);
    let rejectedOnce = false;
    let outcome = "";
    for (let step = 0; step < 200; step++) {
      const s = engine.state;
      if (s.status === "asking" && s.question) {
        engine.answer(simulatedAnswer(target, s.question.id));
      } else if (s.status === "guessing" && s.guess) {
        if (!rejectedOnce) {
          rejectedOnce = true;
          engine.confirmGuess(false);
        } else {
          engine.confirmGuess(s.guess.id === target.id);
        }
      } else {
        outcome = s.status;
        break;
      }
    }
    // the game must end gracefully either way — and keep playing after the reject
    expect(rejectedOnce).toBe(true);
    expect(["won", "defeated"]).toContain(outcome);
  });

  it("resets cleanly", () => {
    const engine = new ArtematorEngine(catalog);
    engine.answer("yes");
    engine.answer("no");
    expect(engine.state.questionsAsked).toBe(2);
    engine.reset();
    expect(engine.state.questionsAsked).toBe(0);
    expect(engine.state.status).toBe("asking");
    expect(engine.state.question).not.toBeNull();
  });
});
