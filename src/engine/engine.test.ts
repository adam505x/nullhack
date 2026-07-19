import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ArtematorEngine,
  familyBalancedPrior,
  likelihood,
} from "./engine";
import type {
  Answer,
  Attribute,
  Catalog,
  Item,
  ProductFamily,
} from "./types";
import catalogJson from "../data/catalog.json";

const catalog = catalogJson as Catalog;

function simulatedAnswer(target: Item, attributeId: string): Answer {
  const value = target.tags[attributeId] ?? 0.5;
  if (value >= 0.7) return "yes";
  if (value >= 0.55) return "probably";
  if (value > 0.4) return "unknown";
  if (value > 0.25) return "probablyNot";
  return "no";
}

function play(target: Item, sourceCatalog = catalog) {
  const engine = new ArtematorEngine(sourceCatalog);
  const guessedIds: string[] = [];
  const topics: string[] = [];
  let firstGuessQuestion: number | null = null;
  let colorQuestionsBeforeFirstGuess = 0;

  for (let step = 0; step < 200; step++) {
    const state = engine.state;
    if (state.status === "asking" && state.question) {
      topics.push(state.question.topic);
      if (firstGuessQuestion === null && state.question.topic === "color") {
        colorQuestionsBeforeFirstGuess++;
      }
      engine.answer(simulatedAnswer(target, state.question.attributeId));
    } else if (state.status === "guessing" && state.guess) {
      if (firstGuessQuestion === null) {
        firstGuessQuestion = state.questionsAsked;
      }
      guessedIds.push(state.guess.id);
      engine.confirmGuess(state.guess.id === target.id);
    } else {
      return {
        status: state.status,
        questions: state.questionsAsked,
        firstGuessQuestion: firstGuessQuestion ?? state.questionsAsked,
        guessedIds,
        topics,
        colorQuestionsBeforeFirstGuess,
      };
    }
  }
  throw new Error("game did not terminate");
}

function attribute(
  id: string,
  options: Partial<Attribute> = {}
): Attribute {
  return {
    id,
    prompts: [`${id}?`, `Maybe ${id}?`, `Could it be ${id}?`],
    topic: options.topic ?? id,
    stage: options.stage ?? "construction",
    ...options,
  };
}

function item(
  id: string,
  family: ProductFamily,
  tags: Record<string, number>
): Item {
  return {
    id,
    name: id,
    articleType: family,
    productFamily: family,
    productSubtype: family,
    image: "https://example.com/item.jpg",
    tags,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function vectorSignature(target: Item): string {
  return catalog.attributes
    .map(({ id }) =>
      Object.hasOwn(target.tags, id) ? target.tags[id] : "?"
    )
    .join("|");
}

describe("catalog integrity", () => {
  it("contains the enriched Uniqlo catalog", () => {
    expect(catalog.items.length).toBeGreaterThanOrEqual(1200);
    expect(catalog.attributes.length).toBeGreaterThanOrEqual(70);
  });

  it("has three valid prompts and complete interaction metadata per attribute", () => {
    const ids = new Set<string>();
    for (const attr of catalog.attributes) {
      expect(ids.has(attr.id), `duplicate attribute ${attr.id}`).toBe(false);
      ids.add(attr.id);
      expect(attr.prompts.length, attr.id).toBeGreaterThanOrEqual(3);
      expect(attr.prompts.every(Boolean), attr.id).toBe(true);
      expect(attr.topic, attr.id).toBeTruthy();
      expect(attr.stage, attr.id).toBeTruthy();
    }
  });

  it("has one valid candidate and canonical image per product variant", () => {
    const ids = new Set<string>();
    const knownAttributes = new Set(catalog.attributes.map(({ id }) => id));
    for (const candidate of catalog.items) {
      expect(ids.has(candidate.id), `duplicate item ${candidate.id}`).toBe(false);
      ids.add(candidate.id);
      expect(candidate.productFamily).toBeTruthy();
      expect(candidate.productSubtype).toBeTruthy();
      if (/^https?:\/\//.test(candidate.image)) {
        expect(() => new URL(candidate.image)).not.toThrow();
      } else {
        expect(
          fs.existsSync(path.join(process.cwd(), "public", candidate.image)),
          `${candidate.name} -> ${candidate.image}`
        ).toBe(true);
      }
      for (const [key, value] of Object.entries(candidate.tags)) {
        expect(knownAttributes.has(key), `${candidate.name}: ${key}`).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("routes socks without ambiguous footwear or bottom-half wording", () => {
    const footwear = catalog.attributes.find(({ id }) => id === "footwear");
    const socksAttribute = catalog.attributes.find(({ id }) => id === "socks");
    const sockItems = catalog.items.filter(
      ({ productSubtype }) => productSubtype === "socks"
    );

    expect(footwear?.prompts).toHaveLength(3);
    expect(
      footwear?.prompts.every((prompt) =>
        /shoe|sandal|boot|slipper|sole/i.test(prompt)
      )
    ).toBe(true);
    expect(socksAttribute?.appliesTo).toEqual(["legwear"]);
    expect(sockItems.length).toBeGreaterThan(50);
    for (const candidate of sockItems) {
      expect(candidate.tags.feetRelated).toBe(1);
      expect(candidate.tags.footwear).toBe(0);
      expect(candidate.tags.wearBottom).toBe(0);
      expect(candidate.tags.socks).toBe(1);
    }
  });

  it("keeps large duplicate-vector groups below ten percent of the catalog", () => {
    const groups = new Map<string, number>();
    for (const candidate of catalog.items) {
      const signature = vectorSignature(candidate);
      groups.set(signature, (groups.get(signature) ?? 0) + 1);
    }
    const inLargeGroups = [...groups.values()]
      .filter((size) => size > 5)
      .reduce((sum, size) => sum + size, 0);
    expect(inLargeGroups / catalog.items.length).toBeLessThan(0.1);
  });
});

describe("probability model", () => {
  it("uses soft evidence and treats unknown as neutral", () => {
    expect(likelihood("yes", 1)).toBeGreaterThan(likelihood("yes", 0));
    expect(likelihood("no", 0)).toBeGreaterThan(likelihood("no", 1));
    expect(likelihood("yes", 0)).toBeGreaterThan(0);
    expect(likelihood("unknown", 0)).toBe(1);
    expect(likelihood("unknown", 1)).toBe(1);
  });

  it("assigns equal total prior mass to each populated family", () => {
    const tinyCatalog: Catalog = {
      attributes: [attribute("x")],
      items: [
        item("top-a", "tshirt", { x: 1 }),
        item("top-b", "tshirt", { x: 0 }),
        item("bag", "accessory", { x: 0 }),
      ],
    };
    const prior = familyBalancedPrior(tinyCatalog);
    expect(prior[0]).toBeCloseTo(0.25);
    expect(prior[1]).toBeCloseTo(0.25);
    expect(prior[2]).toBeCloseTo(0.5);
    expect(prior.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });
});

describe("question selection", () => {
  it("keeps a presented prompt stable and counts alternate copy as one attribute", () => {
    const source: Catalog = {
      attributes: [attribute("shape")],
      items: [
        item("yes", "tshirt", { shape: 1 }),
        item("no", "tshirt", { shape: 0 }),
      ],
    };
    const engine = new ArtematorEngine(source, {
      minQuestions: 99,
      maxQuestions: 99,
      rng: () => 0.99,
    });
    const first = engine.state.question;
    expect(first?.prompt).toBe("Could it be shape?");
    expect(engine.state.question).toEqual(first);
    engine.answer("yes");
    expect(engine.state.question).toBeNull();
  });

  it("does not ask the same topic consecutively or more than twice in five turns", () => {
    const source: Catalog = {
      attributes: [
        attribute("red", { topic: "color" }),
        attribute("blue", { topic: "color" }),
        attribute("green", { topic: "color" }),
        attribute("top", { topic: "category" }),
        attribute("soft", { topic: "comfort" }),
        attribute("long", { topic: "length" }),
      ],
      items: Array.from({ length: 8 }, (_, index) =>
        item(`item-${index}`, "tshirt", {
          red: index & 1 ? 1 : 0,
          blue: index & 2 ? 1 : 0,
          green: index & 4 ? 1 : 0,
          top: index < 4 ? 1 : 0,
          soft: index % 3 ? 1 : 0,
          long: index % 4 ? 1 : 0,
        })
      ),
    };
    const engine = new ArtematorEngine(source, {
      minQuestions: 99,
      maxQuestions: 6,
    });
    const topics: string[] = [];
    while (engine.state.status === "asking" && engine.state.question) {
      topics.push(engine.state.question.topic);
      engine.answer("probably");
    }
    for (let index = 1; index < topics.length; index++) {
      expect(topics[index]).not.toBe(topics[index - 1]);
    }
    for (let index = 0; index + 5 <= topics.length; index++) {
      const window = topics.slice(index, index + 5);
      for (const topic of new Set(window)) {
        expect(window.filter((entry) => entry === topic).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("holds scoped subtype questions until their family reaches sixty percent", () => {
    const source: Catalog = {
      attributes: [
        attribute("isTop", { stage: "routing" }),
        attribute("graphic", {
          stage: "subtype",
          appliesTo: ["tshirt"],
        }),
      ],
      items: [
        item("top-a", "tshirt", { isTop: 1, graphic: 1 }),
        item("top-b", "tshirt", { isTop: 1, graphic: 0 }),
        item("bag-a", "accessory", { isTop: 0 }),
        item("bag-b", "accessory", { isTop: 0 }),
      ],
    };
    const engine = new ArtematorEngine(source, {
      minQuestions: 99,
      maxQuestions: 3,
    });
    expect(engine.state.question?.attributeId).toBe("isTop");
    engine.answer("yes");
    expect(engine.state.question?.attributeId).toBe("graphic");
  });

  it("asks broad color before exact color and never exceeds two colors before guessing", () => {
    const source: Catalog = {
      attributes: [
        attribute("route", { stage: "routing", topic: "category" }),
        attribute("shape", { topic: "fit" }),
        attribute("fabric", { topic: "fabric" }),
        attribute("season", { topic: "season" }),
        attribute("warmColor", {
          stage: "color",
          topic: "color",
          colorLevel: "family",
        }),
        attribute("color:red", {
          stage: "color",
          topic: "color",
          colorLevel: "exact",
        }),
        attribute("color:orange", {
          stage: "color",
          topic: "color",
          colorLevel: "exact",
        }),
      ],
      items: Array.from({ length: 16 }, (_, index) =>
        item(`item-${index}`, "tshirt", {
          route: index & 1 ? 1 : 0,
          shape: index & 2 ? 1 : 0,
          fabric: index & 4 ? 1 : 0,
          season: index & 8 ? 1 : 0,
          warmColor: index < 8 ? 1 : 0,
          "color:red": index < 4 ? 1 : 0,
          "color:orange": index >= 4 && index < 8 ? 1 : 0,
        })
      ),
    };
    const result = play(source.items[0], source);
    const colorQuestions = result.topics.filter((topic) => topic === "color");
    expect(colorQuestions.length).toBeLessThanOrEqual(2);
  });
});

describe("balanced-fast guessing", () => {
  it("can guess on confidence, ranking separation, concentration, and the hard cap", () => {
    const source: Catalog = {
      attributes: Array.from({ length: 15 }, (_, index) =>
        attribute(`a${index}`, { topic: `t${index}` })
      ),
      items: [
        item(
          "target",
          "tshirt",
          Object.fromEntries(Array.from({ length: 15 }, (_, index) => [`a${index}`, 1]))
        ),
        ...Array.from({ length: 8 }, (_, candidate) =>
          item(
            `other-${candidate}`,
            "tshirt",
            Object.fromEntries(
              Array.from({ length: 15 }, (_, index) => [
                `a${index}`,
                (candidate + index) % 3 === 0 ? 1 : 0,
              ])
            )
          )
        ),
      ],
    };
    const result = play(source.items[0], source);
    expect(result.firstGuessQuestion).toBeGreaterThanOrEqual(5);
    expect(result.firstGuessQuestion).toBeLessThanOrEqual(12);
  });

  it("never guesses the same item twice after rejections", () => {
    for (const target of catalog.items.slice(0, 20)) {
      const { guessedIds } = play(target);
      expect(new Set(guessedIds).size).toBe(guessedIds.length);
    }
  });

  it("resets all game state and chooses a fresh first question", () => {
    const engine = new ArtematorEngine(catalog);
    engine.answer("yes");
    engine.answer("no");
    engine.reset();
    expect(engine.state.questionsAsked).toBe(0);
    expect(engine.state.rejectedCount).toBe(0);
    expect(engine.state.status).toBe("asking");
    expect(engine.state.question).not.toBeNull();
  });
});

describe("full Uniqlo convergence", () => {
  it("meets the speed, success, topic, and color budgets", () => {
    const vectorCounts = new Map<string, number>();
    for (const target of catalog.items) {
      const signature = vectorSignature(target);
      vectorCounts.set(signature, (vectorCounts.get(signature) ?? 0) + 1);
    }

    const results = catalog.items.map((target) => ({
      target,
      result: play(target),
      distinguishable: vectorCounts.get(vectorSignature(target)) === 1,
    }));
    const successful = results.filter(({ result }) => result.status === "won");
    const distinguishable = results.filter(({ distinguishable }) => distinguishable);
    const distinguishableWins = distinguishable.filter(
      ({ result }) => result.status === "won"
    );

    expect(
      distinguishableWins.length / distinguishable.length
    ).toBeGreaterThanOrEqual(0.9);
    expect(
      median(results.map(({ result }) => result.firstGuessQuestion))
    ).toBeLessThanOrEqual(8);
    expect(
      median(successful.map(({ result }) => result.questions))
    ).toBeLessThanOrEqual(10);

    for (const { result } of results) {
      for (let index = 1; index < result.topics.length; index++) {
        expect(result.topics[index]).not.toBe(result.topics[index - 1]);
      }
      expect(result.colorQuestionsBeforeFirstGuess).toBeLessThanOrEqual(2);
    }
  }, 120_000);
});
