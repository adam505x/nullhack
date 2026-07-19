export type Answer = "yes" | "probably" | "unknown" | "probablyNot" | "no";

export type ProductFamily =
  | "tshirt"
  | "shirt"
  | "sweater"
  | "sweatshirt"
  | "outerwear"
  | "pants"
  | "jeans"
  | "shorts"
  | "skirt"
  | "dress"
  | "underwear"
  | "legwear"
  | "footwear"
  | "accessory"
  | "other";

export type AttributeStage =
  | "routing"
  | "construction"
  | "style"
  | "color"
  | "subtype";

export interface Attribute {
  id: string;
  /** Alternate presentation copy for one underlying evidence dimension. */
  prompts: string[];
  /** Interaction topic used to keep adjacent questions varied. */
  topic: string;
  stage: AttributeStage;
  /** A scoped question is eligible once these families hold enough posterior mass. */
  appliesTo?: ProductFamily[];
  /** Exact colors are held back until a broad color-family question has been asked. */
  colorLevel?: "family" | "exact";
}

export interface Item {
  id: string;
  name: string;
  articleType: string;
  productFamily: ProductFamily;
  productSubtype: string;
  image: string;
  /** attribute id -> how true it is for this item, in [0, 1]; missing = unknown */
  tags: Record<string, number>;
}

export interface Catalog {
  attributes: Attribute[];
  items: Item[];
}

export interface PresentedQuestion {
  attributeId: string;
  prompt: string;
  topic: string;
}

export type GameStatus = "asking" | "guessing" | "won" | "defeated";

export interface EngineState {
  status: GameStatus;
  question: PresentedQuestion | null;
  guess: Item | null;
  topProbability: number;
  questionsAsked: number;
  rejectedCount: number;
  /** Top remaining items, used by diagnostics and the defeat screen. */
  ranking: Item[];
}
