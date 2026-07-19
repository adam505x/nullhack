import fs from "node:fs";

const { ArtematorEngine } = await import("../src/engine/engine.ts");
const catalog = JSON.parse(fs.readFileSync("src/data/catalog.json", "utf8"));

function answerFor(target, attributeId) {
  const value = target.tags[attributeId] ?? 0.5;
  if (value >= 0.7) return "yes";
  if (value >= 0.55) return "probably";
  if (value > 0.4) return "unknown";
  if (value > 0.25) return "probablyNot";
  return "no";
}

function signature(item) {
  return catalog.attributes
    .map(({ id }) => (Object.hasOwn(item.tags, id) ? item.tags[id] : "?"))
    .join("|");
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

const vectorCounts = new Map();
for (const item of catalog.items) {
  const key = signature(item);
  vectorCounts.set(key, (vectorCounts.get(key) ?? 0) + 1);
}

const results = [];
for (const target of catalog.items) {
  const engine = new ArtematorEngine(catalog);
  const topics = [];
  let guesses = 0;
  let firstGuess = null;
  let colorsBeforeFirstGuess = 0;
  for (let step = 0; step < 200; step++) {
    const state = engine.state;
    if (state.status === "asking" && state.question) {
      topics.push(state.question.topic);
      if (firstGuess === null && state.question.topic === "color") {
        colorsBeforeFirstGuess++;
      }
      engine.answer(answerFor(target, state.question.attributeId));
    } else if (state.status === "guessing" && state.guess) {
      if (firstGuess === null) firstGuess = state.questionsAsked;
      guesses++;
      engine.confirmGuess(state.guess.id === target.id);
    } else {
      break;
    }
  }
  const state = engine.state;
  results.push({
    id: target.id,
    family: target.productFamily,
    status: state.status,
    questions: state.questionsAsked,
    firstGuess: firstGuess ?? state.questionsAsked,
    wrongGuesses: Math.max(0, guesses - (state.status === "won" ? 1 : 0)),
    topics,
    colorsBeforeFirstGuess,
    distinguishable: vectorCounts.get(signature(target)) === 1,
  });
}

const wins = results.filter(({ status }) => status === "won");
const distinguishable = results.filter(({ distinguishable }) => distinguishable);
const distinguishableWins = distinguishable.filter(({ status }) => status === "won");
const families = [...new Set(results.map(({ family }) => family))].sort();

console.log(`catalog: ${catalog.items.length} items, ${catalog.attributes.length} attributes`);
console.log(
  `wins: ${wins.length}/${results.length} (${(100 * wins.length / results.length).toFixed(1)}%)`
);
console.log(
  `distinguishable wins: ${distinguishableWins.length}/${distinguishable.length} (${(100 * distinguishableWins.length / distinguishable.length).toFixed(1)}%)`
);
console.log(
  `first guess: median ${median(results.map(({ firstGuess }) => firstGuess))}, max ${Math.max(...results.map(({ firstGuess }) => firstGuess))}`
);
console.log(
  `successful finish: median ${median(wins.map(({ questions }) => questions))}, avg ${(wins.reduce((sum, { questions }) => sum + questions, 0) / wins.length).toFixed(1)}`
);
console.log(
  `wrong guesses: ${results.reduce((sum, { wrongGuesses }) => sum + wrongGuesses, 0)} total`
);
console.log(
  `topic violations: ${results.filter(({ topics }) => topics.some((topic, index) => index > 0 && topic === topics[index - 1])).length}`
);
console.log(
  `color-budget violations: ${results.filter(({ colorsBeforeFirstGuess }) => colorsBeforeFirstGuess > 2).length}`
);
console.log("\nfamily performance:");
for (const family of families) {
  const familyResults = results.filter((result) => result.family === family);
  const familyWins = familyResults.filter(({ status }) => status === "won");
  console.log(
    `${family.padEnd(12)} ${String(familyWins.length).padStart(3)}/${String(familyResults.length).padEnd(3)} wins, first ${median(familyResults.map(({ firstGuess }) => firstGuess))}, finish ${median(familyWins.map(({ questions }) => questions))}`
  );
}
