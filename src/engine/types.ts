export type Answer = "yes" | "probably" | "unknown" | "probablyNot" | "no";

export interface Attribute {
  id: string;
  question: string;
}

export interface Item {
  id: string;
  name: string;
  articleType: string;
  image: string;
  /** attribute id -> how true it is for this item, in [0, 1]; missing = 0.5 */
  tags: Record<string, number>;
}

export interface Catalog {
  attributes: Attribute[];
  items: Item[];
}

export type GameStatus = "asking" | "guessing" | "won" | "defeated";

export interface EngineState {
  status: GameStatus;
  /** current question, when status === "asking" */
  question: Attribute | null;
  /** current guess, when status === "guessing" */
  guess: Item | null;
  /** probability of the current front-runner, in [0, 1] */
  topProbability: number;
  questionsAsked: number;
  rejectedCount: number;
  /** top remaining items by probability (used by the defeat screen) */
  ranking: Item[];
}
