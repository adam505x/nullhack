import type { Answer, Attribute, Catalog, EngineState, GameStatus, Item } from "./types";

// The Akinator method: a Bayesian posterior over catalog items, updated on every
// answer, with the next question chosen by maximum expected information gain.

const ANSWER_VALUE: Record<Answer, number> = {
  yes: 1,
  probably: 0.75,
  unknown: 0.5,
  probablyNot: 0.25,
  no: 0,
};

const INFORMATIVE_ANSWERS: Answer[] = ["yes", "probably", "probablyNot", "no"];

/** P(answer | item attribute value). Soft, so a "wrong" answer demotes, never kills. */
export function likelihood(answer: Answer, value: number): number {
  if (answer === "unknown") return 1;
  const d = Math.abs(ANSWER_VALUE[answer] - value);
  return Math.max(0.04, 1 - 1.15 * d);
}

function entropy(probs: number[]): number {
  let h = 0;
  for (const p of probs) if (p > 0) h -= p * Math.log2(p);
  return h;
}

function normalize(probs: number[]): void {
  let sum = 0;
  for (const p of probs) sum += p;
  if (sum <= 0) {
    const n = probs.length;
    probs.fill(1 / n);
    return;
  }
  for (let i = 0; i < probs.length; i++) probs[i] /= sum;
}

export interface EngineOptions {
  /** guess once the front-runner reaches this probability */
  guessThreshold?: number;
  /** never guess before this many questions (unless we run out) */
  minQuestions?: number;
  /** always guess once this many questions have been asked */
  maxQuestions?: number;
  /** questions to ask between a rejected guess and the next guess */
  cooldownAfterReject?: number;
  /** rejected guesses before conceding defeat */
  maxRejects?: number;
  /** optional RNG for tie-breaking between near-equal questions (deterministic when omitted) */
  rng?: () => number;
}

export class ArtematorEngine {
  private readonly catalog: Catalog;
  private readonly opts: Required<Omit<EngineOptions, "rng">> & { rng?: () => number };
  private probs: number[] = [];
  private asked = new Set<string>();
  private status: GameStatus = "asking";
  private currentQuestion: Attribute | null = null;
  private currentGuess: Item | null = null;
  private questionsAsked = 0;
  private rejectedCount = 0;
  private sinceReject = Infinity;

  constructor(catalog: Catalog, opts: EngineOptions = {}) {
    if (catalog.items.length === 0) throw new Error("catalog has no items");
    this.catalog = catalog;
    this.opts = {
      guessThreshold: opts.guessThreshold ?? 0.75,
      minQuestions: opts.minQuestions ?? 4,
      maxQuestions: opts.maxQuestions ?? 14,
      cooldownAfterReject: opts.cooldownAfterReject ?? 2,
      maxRejects: opts.maxRejects ?? 4,
      rng: opts.rng,
    };
    this.reset();
  }

  reset(): void {
    this.probs = new Array<number>(this.catalog.items.length).fill(1 / this.catalog.items.length);
    this.asked = new Set();
    this.status = "asking";
    this.currentGuess = null;
    this.questionsAsked = 0;
    this.rejectedCount = 0;
    this.sinceReject = Infinity;
    this.currentQuestion = this.pickQuestion();
    if (!this.currentQuestion) this.startGuess();
  }

  get state(): EngineState {
    return {
      status: this.status,
      question: this.status === "asking" ? this.currentQuestion : null,
      guess:
        this.status === "guessing" || this.status === "won" ? this.currentGuess : null,
      topProbability: this.topProbability(),
      questionsAsked: this.questionsAsked,
      rejectedCount: this.rejectedCount,
      ranking: this.ranking(3),
    };
  }

  answer(a: Answer): void {
    if (this.status !== "asking" || !this.currentQuestion) return;
    const attr = this.currentQuestion.id;
    this.asked.add(attr);
    this.questionsAsked++;
    this.sinceReject++;
    for (let i = 0; i < this.probs.length; i++) {
      this.probs[i] *= likelihood(a, this.value(i, attr));
    }
    normalize(this.probs);
    this.advance();
  }

  confirmGuess(correct: boolean): void {
    if (this.status !== "guessing" || !this.currentGuess) return;
    if (correct) {
      this.status = "won";
      return;
    }
    // "No, keep looking": eliminate the guess and carry on.
    const idx = this.catalog.items.findIndex((it) => it.id === this.currentGuess!.id);
    if (idx >= 0) this.probs[idx] = 0;
    normalize(this.probs);
    this.rejectedCount++;
    this.sinceReject = 0;
    this.currentGuess = null;
    if (this.rejectedCount >= this.opts.maxRejects) {
      this.status = "defeated";
      return;
    }
    this.status = "asking";
    this.advance();
  }

  private advance(): void {
    const top = this.topProbability();
    const cooled = this.sinceReject >= this.opts.cooldownAfterReject;
    const next = this.pickQuestion();
    const shouldGuess =
      (top >= this.opts.guessThreshold && this.questionsAsked >= this.opts.minQuestions && cooled) ||
      this.questionsAsked >= this.opts.maxQuestions ||
      next === null;
    if (shouldGuess) this.startGuess();
    else {
      this.status = "asking";
      this.currentQuestion = next;
    }
  }

  private startGuess(): void {
    this.status = "guessing";
    this.currentGuess = this.ranking(1)[0] ?? null;
  }

  /** expected information gain of asking about `attr` under the current posterior */
  private gain(attr: string): number {
    const h = entropy(this.probs);
    let expected = 0;
    for (const a of INFORMATIVE_ANSWERS) {
      let pa = 0;
      const post: number[] = new Array(this.probs.length);
      for (let i = 0; i < this.probs.length; i++) {
        const v = this.value(i, attr);
        // user's chance of giving answer `a` for item i, over the informative answers
        let wSum = 0;
        for (const b of INFORMATIVE_ANSWERS) wSum += likelihood(b, v);
        const w = likelihood(a, v) / wSum;
        pa += this.probs[i] * w;
        post[i] = this.probs[i] * likelihood(a, v);
      }
      if (pa <= 0) continue;
      normalize(post);
      expected += pa * entropy(post);
    }
    return h - expected;
  }

  private pickQuestion(): Attribute | null {
    const candidates = this.catalog.attributes
      .filter((attr) => !this.asked.has(attr.id))
      .map((attr) => ({ attr, gain: this.gain(attr.id) }))
      .filter((c) => c.gain > 1e-4)
      .sort((x, y) => y.gain - x.gain);
    if (candidates.length === 0) return null;
    if (this.opts.rng) {
      // a touch of variety between games: pick among questions within 10% of the best
      const best = candidates[0].gain;
      const near = candidates.filter((c) => c.gain >= best * 0.9);
      return near[Math.floor(this.opts.rng() * near.length)].attr;
    }
    return candidates[0].attr;
  }

  private value(itemIdx: number, attr: string): number {
    return this.catalog.items[itemIdx].tags[attr] ?? 0.5;
  }

  private topProbability(): number {
    return Math.max(...this.probs);
  }

  private ranking(n: number): Item[] {
    return this.catalog.items
      .map((item, i) => ({ item, p: this.probs[i] }))
      .sort((a, b) => b.p - a.p)
      .slice(0, n)
      .filter((e) => e.p > 0)
      .map((e) => e.item);
  }
}
