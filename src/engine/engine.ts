import type {
  Answer,
  Attribute,
  Catalog,
  EngineState,
  GameStatus,
  Item,
  PresentedQuestion,
  ProductFamily,
} from "./types";

const ANSWER_VALUE: Record<Answer, number> = {
  yes: 1,
  probably: 0.75,
  unknown: 0.5,
  probablyNot: 0.25,
  no: 0,
};

const INFORMATIVE_ANSWERS: Answer[] = [
  "yes",
  "probably",
  "probablyNot",
  "no",
];

/** Soft evidence: a surprising answer demotes a candidate without killing it. */
export function likelihood(answer: Answer, value: number): number {
  if (answer === "unknown") return 1;
  const distance = Math.abs(ANSWER_VALUE[answer] - value);
  return Math.max(0.04, 1 - 1.15 * distance);
}

function responseLikelihood(answer: Answer, value: number): number {
  if (answer === "unknown") return 1;
  const total = INFORMATIVE_ANSWERS.reduce(
    (sum, candidate) => sum + likelihood(candidate, value),
    0
  );
  return likelihood(answer, value) / total;
}

const RESPONSE_CACHE = new Map<number, number[]>();

function responseVector(value: number): number[] {
  const cached = RESPONSE_CACHE.get(value);
  if (cached) return cached;
  const vector = INFORMATIVE_ANSWERS.map((answer) =>
    responseLikelihood(answer, value)
  );
  RESPONSE_CACHE.set(value, vector);
  return vector;
}

export function entropy(probs: number[]): number {
  let result = 0;
  for (const probability of probs) {
    if (probability > 0) result -= probability * Math.log2(probability);
  }
  return result;
}

function normalize(probs: number[]): void {
  const sum = probs.reduce((total, probability) => total + probability, 0);
  if (sum <= 0) {
    probs.fill(1 / probs.length);
    return;
  }
  for (let index = 0; index < probs.length; index++) probs[index] /= sum;
}

/** Equal total mass per populated family, then equal mass per item in it. */
export function familyBalancedPrior(catalog: Catalog): number[] {
  const familyCounts = new Map<ProductFamily, number>();
  for (const item of catalog.items) {
    familyCounts.set(
      item.productFamily,
      (familyCounts.get(item.productFamily) ?? 0) + 1
    );
  }
  const familyMass = 1 / familyCounts.size;
  return catalog.items.map(
    (item) => familyMass / familyCounts.get(item.productFamily)!
  );
}

export interface EngineOptions {
  guessThreshold?: number;
  ratioGuessMinimum?: number;
  guessRatio?: number;
  effectiveCandidateThreshold?: number;
  exploratoryGuessAfter?: number;
  exploratoryGuessThreshold?: number;
  minQuestions?: number;
  maxQuestions?: number;
  maxRejects?: number;
  subtypeActivationMass?: number;
  negligibleGain?: number;
  /** Optional RNG. Omit it for deterministic tests and diagnostics. */
  rng?: () => number;
}

interface QuestionCandidate {
  attr: Attribute;
  gain: number;
  coverage: number;
  score: number;
}

export class ArtematorEngine {
  private readonly catalog: Catalog;
  private readonly valuesByAttribute = new Map<string, Float64Array>();
  private readonly knownByAttribute = new Map<string, Uint8Array>();
  private readonly opts: Required<Omit<EngineOptions, "rng">> & {
    rng?: () => number;
  };
  private probs: number[] = [];
  private asked = new Set<string>();
  private topicHistory: string[] = [];
  private currentAttribute: Attribute | null = null;
  private currentQuestion: PresentedQuestion | null = null;
  private currentGuess: Item | null = null;
  private status: GameStatus = "asking";
  private questionsAsked = 0;
  private rejectedCount = 0;
  private questionsSinceReject = Number.POSITIVE_INFINITY;
  private hasGuessed = false;

  constructor(catalog: Catalog, options: EngineOptions = {}) {
    if (catalog.items.length === 0) throw new Error("catalog has no items");
    if (catalog.attributes.length === 0) {
      throw new Error("catalog has no attributes");
    }
    this.catalog = catalog;
    for (const attribute of catalog.attributes) {
      const values = new Float64Array(catalog.items.length);
      const known = new Uint8Array(catalog.items.length);
      for (let index = 0; index < catalog.items.length; index++) {
        const tags = catalog.items[index].tags;
        if (Object.hasOwn(tags, attribute.id)) {
          values[index] = tags[attribute.id];
          known[index] = 1;
        } else {
          values[index] = 0.5;
        }
      }
      this.valuesByAttribute.set(attribute.id, values);
      this.knownByAttribute.set(attribute.id, known);
    }
    this.opts = {
      guessThreshold: options.guessThreshold ?? 0.55,
      ratioGuessMinimum: options.ratioGuessMinimum ?? 0.2,
      guessRatio: options.guessRatio ?? 3,
      effectiveCandidateThreshold:
        options.effectiveCandidateThreshold ?? 3,
      exploratoryGuessAfter: options.exploratoryGuessAfter ?? 8,
      exploratoryGuessThreshold: options.exploratoryGuessThreshold ?? 0.06,
      minQuestions: options.minQuestions ?? 5,
      maxQuestions: options.maxQuestions ?? 12,
      maxRejects: options.maxRejects ?? 6,
      subtypeActivationMass: options.subtypeActivationMass ?? 0.6,
      negligibleGain: options.negligibleGain ?? 0.01,
      rng: options.rng,
    };
    this.reset();
  }

  reset(): void {
    this.probs = familyBalancedPrior(this.catalog);
    this.asked = new Set();
    this.topicHistory = [];
    this.currentAttribute = null;
    this.currentQuestion = null;
    this.currentGuess = null;
    this.status = "asking";
    this.questionsAsked = 0;
    this.rejectedCount = 0;
    this.questionsSinceReject = Number.POSITIVE_INFINITY;
    this.hasGuessed = false;
    const next = this.pickQuestion();
    if (next) this.present(next.attr);
    else this.startGuess();
  }

  get state(): EngineState {
    return {
      status: this.status,
      question: this.status === "asking" ? this.currentQuestion : null,
      guess:
        this.status === "guessing" || this.status === "won"
          ? this.currentGuess
          : null,
      topProbability: this.topProbability(),
      questionsAsked: this.questionsAsked,
      rejectedCount: this.rejectedCount,
      ranking: this.ranking(3),
    };
  }

  answer(answer: Answer): void {
    if (
      this.status !== "asking" ||
      !this.currentAttribute ||
      !this.currentQuestion
    ) {
      return;
    }
    const attributeId = this.currentAttribute.id;
    this.asked.add(attributeId);
    this.topicHistory.push(this.currentAttribute.topic);
    this.questionsAsked++;
    this.questionsSinceReject++;

    for (let index = 0; index < this.probs.length; index++) {
      this.probs[index] *= responseLikelihood(
        answer,
        this.value(index, attributeId)
      );
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

    const rejectedIndex = this.catalog.items.findIndex(
      (item) => item.id === this.currentGuess!.id
    );
    if (rejectedIndex >= 0) this.probs[rejectedIndex] = 0;
    normalize(this.probs);
    this.rejectedCount++;
    this.questionsSinceReject = 0;
    this.currentGuess = null;

    if (this.rejectedCount >= this.opts.maxRejects) {
      this.status = "defeated";
      return;
    }
    this.status = "asking";
    this.advance(true);
  }

  private advance(afterReject = false): void {
    const next = this.pickQuestion();
    if (afterReject && next && next.gain >= this.opts.negligibleGain) {
      this.status = "asking";
      this.present(next.attr);
      return;
    }

    const [top, second = 0] = this.topTwoProbabilities();
    const candidateCount = 2 ** entropy(this.probs);
    const sufficientlyAsked = this.questionsAsked >= this.opts.minQuestions;
    const confident = top >= this.opts.guessThreshold;
    const separated =
      top >= this.opts.ratioGuessMinimum &&
      (second === 0 || top / second >= this.opts.guessRatio);
    const concentrated =
      candidateCount <= this.opts.effectiveCandidateThreshold;
    const exploratory =
      this.questionsAsked >= this.opts.exploratoryGuessAfter &&
      top >= this.opts.exploratoryGuessThreshold;
    const noUsefulQuestion =
      next === null || next.gain < this.opts.negligibleGain;
    const shouldGuess =
      noUsefulQuestion ||
      this.questionsAsked >= this.opts.maxQuestions ||
      (sufficientlyAsked &&
        (confident || separated || concentrated || exploratory));

    if (shouldGuess) this.startGuess();
    else {
      this.status = "asking";
      this.present(next!.attr);
    }
  }

  private startGuess(): void {
    this.status = "guessing";
    this.hasGuessed = true;
    this.currentAttribute = null;
    this.currentQuestion = null;
    this.currentGuess = this.ranking(1)[0] ?? null;
  }

  private present(attribute: Attribute): void {
    this.currentAttribute = attribute;
    const promptIndex = this.opts.rng
      ? Math.floor(this.opts.rng() * attribute.prompts.length)
      : 0;
    this.currentQuestion = {
      attributeId: attribute.id,
      prompt: attribute.prompts[promptIndex] ?? attribute.prompts[0],
      topic: attribute.topic,
    };
  }

  /** Compute gain and known coverage in one item pass, without allocating four
   * posterior arrays for every candidate question. */
  private questionMetrics(
    attributeId: string,
    currentEntropy: number
  ): { gain: number; coverage: number } {
    const values = this.valuesByAttribute.get(attributeId)!;
    const known = this.knownByAttribute.get(attributeId)!;
    const answerMass = [0, 0, 0, 0];
    const weightedLogs = [0, 0, 0, 0];
    let coverage = 0;
    for (let index = 0; index < this.probs.length; index++) {
      const prior = this.probs[index];
      if (prior <= 0) continue;
      if (known[index]) coverage += prior;
      const responses = responseVector(values[index]);
      for (let answerIndex = 0; answerIndex < 4; answerIndex++) {
        const weighted = prior * responses[answerIndex];
        answerMass[answerIndex] += weighted;
        if (weighted > 0) {
          weightedLogs[answerIndex] += weighted * Math.log2(weighted);
        }
      }
    }
    let expectedEntropy = 0;
    for (let answerIndex = 0; answerIndex < 4; answerIndex++) {
      const mass = answerMass[answerIndex];
      if (mass > 0) {
        expectedEntropy +=
          mass * Math.log2(mass) - weightedLogs[answerIndex];
      }
    }
    return { gain: currentEntropy - expectedEntropy, coverage };
  }

  private familyMass(families: ProductFamily[]): number {
    const eligible = new Set(families);
    let mass = 0;
    for (let index = 0; index < this.catalog.items.length; index++) {
      if (eligible.has(this.catalog.items[index].productFamily)) {
        mass += this.probs[index];
      }
    }
    return mass;
  }

  private topicAllowed(topic: string): boolean {
    const recent = this.topicHistory.slice(-4);
    if (recent.at(-1) === topic) return false;
    if (recent.filter((entry) => entry === topic).length >= 2) return false;
    if (
      !this.hasGuessed &&
      topic === "color" &&
      this.topicHistory.filter((entry) => entry === "color").length >= 2
    ) {
      return false;
    }
    return true;
  }

  private pickQuestion(): QuestionCandidate | null {
    const askedBroadColor = this.catalog.attributes.some(
      (attribute) =>
        attribute.colorLevel === "family" && this.asked.has(attribute.id)
    );
    const currentEntropy = entropy(this.probs);
    let candidates = this.catalog.attributes
      .filter((attribute) => {
        if (this.asked.has(attribute.id)) return false;
        if (!this.topicAllowed(attribute.topic)) return false;
        if (
          attribute.appliesTo &&
          this.familyMass(attribute.appliesTo) <
            this.opts.subtypeActivationMass
        ) {
          return false;
        }
        if (
          attribute.colorLevel === "exact" &&
          (this.questionsAsked < 4 || !askedBroadColor)
        ) {
          return false;
        }
        return true;
      })
      .map((attribute) => {
        const { gain, coverage } = this.questionMetrics(
          attribute.id,
          currentEntropy
        );
        return {
          attr: attribute,
          gain,
          coverage,
          score: gain * coverage,
        };
      })
      .filter(({ gain, score }) => gain > 1e-6 && score > 1e-6)
      .sort((left, right) => right.score - left.score);

    if (candidates.length === 0) return null;

    if (this.questionsAsked < 2) {
      const bestScore = candidates[0].score;
      const routing = candidates.filter(
        ({ attr: attribute, score }) =>
          attribute.stage === "routing" && score >= bestScore * 0.85
      );
      if (routing.length > 0) candidates = routing;
    }

    if (!this.opts.rng) return candidates[0];
    const bestScore = candidates[0].score;
    const nearBest = candidates.filter(
      ({ score }) => score >= bestScore * 0.9
    );
    return nearBest[Math.floor(this.opts.rng() * nearBest.length)];
  }

  private value(itemIndex: number, attributeId: string): number {
    return this.valuesByAttribute.get(attributeId)?.[itemIndex] ?? 0.5;
  }

  private topProbability(): number {
    return Math.max(...this.probs);
  }

  private topTwoProbabilities(): [number, number] {
    let first = 0;
    let second = 0;
    for (const probability of this.probs) {
      if (probability > first) {
        second = first;
        first = probability;
      } else if (probability > second) {
        second = probability;
      }
    }
    return [first, second];
  }

  private ranking(limit: number): Item[] {
    return this.catalog.items
      .map((item, index) => ({ item, probability: this.probs[index] }))
      .sort((left, right) => right.probability - left.probability)
      .slice(0, limit)
      .filter(({ probability }) => probability > 0)
      .map(({ item }) => item);
  }
}
