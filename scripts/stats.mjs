import fs from "node:fs";
const { ArtematorEngine } = await import("../src/engine/engine.ts");
const catalog = JSON.parse(fs.readFileSync("src/data/catalog.json", "utf8"));
function answerFor(target, attrId) {
  const v = target.tags[attrId] ?? 0.5;
  if (v >= 0.7) return "yes";
  if (v >= 0.55) return "probably";
  if (v > 0.4) return "unknown";
  if (v > 0.25) return "probablyNot";
  return "no";
}
let won = 0, qs = [], rejects = 0, fails = [];
for (const target of catalog.items) {
  const e = new ArtematorEngine(catalog);
  for (let i = 0; i < 200; i++) {
    const s = e.state;
    if (s.status === "asking" && s.question) e.answer(answerFor(target, s.question.id));
    else if (s.status === "guessing" && s.guess) { if (s.guess.id !== target.id) rejects++; e.confirmGuess(s.guess.id === target.id); }
    else break;
  }
  const s = e.state;
  if (s.status === "won") { won++; qs.push(s.questionsAsked); } else fails.push(target.name);
}
qs.sort((a,b)=>a-b);
console.log(`win rate: ${won}/${catalog.items.length} (${(100*won/catalog.items.length).toFixed(0)}%)`);
console.log(`questions: avg ${(qs.reduce((a,b)=>a+b,0)/qs.length).toFixed(1)}, median ${qs[Math.floor(qs.length/2)]}, min ${qs[0]}, max ${qs[qs.length-1]}`);
console.log(`wrong guesses along the way: ${rejects}; failures: ${fails.join(", ") || "none"}`);
