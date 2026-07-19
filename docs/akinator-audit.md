# Artemator guessing-engine audit

Date: 2026-07-19

## Executive verdict

The Bayesian posterior and expected-information-gain loop are a sound base. The
current problem is the catalog representation: too many products have identical
or near-identical attribute vectors, while most attributes are broad subjective
style judgements. The engine cannot recover information that is not encoded.

Adding alternate wording as additional attributes would make this worse by
double-counting the same evidence. Alternate wording should be presentation
variants of one underlying attribute.

The next version should:

1. Add objective, hierarchical garment attributes.
2. Give each attribute several conversational prompt variants.
3. Group and pace question topics so the game feels varied.
4. Add subtype-specific questions once the posterior enters a product family.
5. Guess based on posterior concentration and ranking separation, not only a
   fixed probability threshold.
6. Learn answer likelihoods and item priors from completed games over time.

## Measured current state

The current Uniqlo catalog has:

- 1,302 candidate product/color variants.
- 38 attributes: 24 general attributes and 14 explicit colors.
- 628 unique complete attribute vectors.
- 902 items sharing their vector with at least one other item.
- 228 duplicate-vector groups.
- A largest indistinguishable group of 51 graphic T-shirts.

An evenly spaced 100-target simulation produced:

- 65 wins and 35 defeats.
- Median 14 questions.
- Average 13.92 questions among wins.
- 205 wrong intermediate guesses.

The catalog begins with about `log2(1302) = 10.35` bits of uncertainty under a
uniform prior. Fourteen questions could be enough only if questions split the
posterior efficiently and every target has a distinguishable answer vector.
Neither condition currently holds.

The most informative initial attributes are `womenswear`, `wearTop`, and
`wearBottom`. This is mathematically reasonable, but their current wording and
the lack of a coherent hierarchy make the interaction feel like a form.

## What the theory supports

Shannon entropy measures uncertainty in a distribution. Information gain is the
expected reduction in that uncertainty after observing an answer.

In unrestricted Twenty Questions, a Huffman-style decision tree can identify a
target in fewer than `H(p) + 1` binary questions on average. Real games use a
restricted question set and noisy human answers, so they need additional
questions. Research on noisy Twenty Questions supports selecting questions that
minimize expected posterior entropy.

That validates Artemator's core loop. It does not validate the current feature
bank. Information gain can choose only among the distinctions the catalog
provides.

Akinator's implementation is not public. Public descriptions confirm five soft
answers, guesses before a fixed upper limit, and learning from prior players.
The linked Medium article is a useful intuition for decision trees and entropy,
but its binary-search/collaborative-filtering description is not an authoritative
account of Akinator's proprietary engine.

References:

- Claude Shannon, *A Mathematical Theory of Communication*:
  https://doi.org/10.1002/j.1538-7305.1948.tb00917.x
- Dagan, Filmus, Gabizon, Moran, *Twenty (simple) questions*:
  https://arxiv.org/abs/1611.01655
- Jedynak, Frazier, Sznitman, *Twenty Questions with Noise*:
  https://doi.org/10.1239/jap/1331216837
- Entropy overview:
  https://en.wikipedia.org/wiki/Entropy_(information_theory)
- Akinator gameplay and disclosed limits:
  https://en.wikipedia.org/wiki/Akinator
- User-supplied Akinator overview:
  https://medium.com/@inemri/how-akinator-reads-your-mind-unveiling-the-games-algorithmic-magic-c8ee86dbc1d3

## Product-family findings

Approximate catalog composition from product names:

| Family | Items |
|---|---:|
| T-shirts | 328 |
| Shirts and blouses | 160 |
| Pants and trousers | 145 |
| Underwear and bras | 97 |
| Sweaters and knitwear | 90 |
| Jackets and coats | 76 |
| Socks | 72 |
| Accessories | 66 |
| Skirts and dresses | 60 |
| Shorts | 53 |
| Jeans | 40 |
| Sweatshirts and hoodies | 14 |
| Other and unresolved | 101 |

The adapter currently stores the product name as `articleType`, which loses a
valuable objective field. A normalized `productFamily` and `productSubtype`
should be generated explicitly.

## Recommended attribute hierarchy

### Stage 1: route the catalog

These should be objective and broadly splitting:

- `womenswear`
- `wearTop`
- `wearBottom`
- `onePiece`
- `outerwear`
- `underwear`
- `legwear`
- `footwear`
- `accessory`

Example prompts:

- “Would you wear it above your waist?”
- “Does it cover both your top and bottom in one piece?”
- “Is it the layer you put on before leaving the house?”
- “Is it closer to underwear or hosiery than an outfit piece?”

### Stage 2: identify silhouette and construction

- `shortSleeve`, `longSleeve`, `sleeveless`
- `collared`
- `hooded`
- `buttonFront`
- `zipFront`
- `cropped`
- `longLength`
- `looseFit` / the existing underlying fit dimension
- `graphicOrPrinted`
- `technicalFabric`
- `knit`
- `denim`
- `linen`
- `fleeceOrPile`
- `downOrPadded`

Example prompts:

- “Would I find a collar if I looked near the neckline?”
- “Are the sleeves part of the point?”
- “Does it have a zip running down the front?”
- “Is there artwork, a character, or a print on it?”
- “Does it sound like one of Uniqlo's technical fabrics?”

### Stage 3: style, use and feel

Keep the existing soft dimensions, but ask only those that still split the
current posterior:

- `dressy`, `sporty`, `warmWeather`
- `statement`, `minimal`, `streetwear`, `classic`
- `cozy`, `edgy`, `romantic`
- `officeOk`, `nightOut`, `fitted`, `luxe`

### Stage 4: targeted disambiguation

Only activate these when the surviving family makes them useful:

- Graphic T-shirts: `licensedCharacter`, `animeOrManga`, `artistOrMuseum`,
  `textGraphic`, `largeFrontGraphic`, `collaboration`.
- Shirts: collar type, sleeve length, pattern, fit, fabric.
- Pants: rise, width, length, pleats, cargo pockets, technical fabric.
- Outerwear: insulation, hood, closure, length, water/wind protection.
- Underwear: bra/brief/boxer, rise, seamless, lace, support.
- Accessories: bag/headwear/eyewear/scarf/belt/umbrella.

Specific collection questions can appear near the end when they are genuinely
high-information, similar to Akinator asking about a franchise after establishing
the character's general domain.

## Multiple phrasings without duplicate evidence

Change the attribute schema from:

```ts
{ id: "wearTop", question: "Is it something you'd wear on your top half?" }
```

to:

```ts
{
  id: "wearTop",
  prompts: [
    "Would you wear it above your waist?",
    "Does it mainly cover your torso?",
    "Would you normally pair it with separate bottoms?"
  ],
  group: "routing"
}
```

The engine chooses one prompt per game. It still updates `wearTop` once and
never treats alternate wording as independent evidence.

## Question-selection changes

Pure information gain should remain the main signal, with interaction-aware
constraints:

```text
selectionScore =
  expectedInformationGain
  + stageRelevanceBonus
  - recentGroupPenalty
  - ambiguityPenalty
```

Recommended rules:

- Never ask the same attribute twice.
- Never ask the same group twice consecutively.
- Allow at most two questions from one group in a rolling five-question window.
- Prefer routing questions for the first two turns when their information gain
  is within 15% of the best available question.
- Activate subtype questions only when at least 60% of posterior mass belongs
  to their product family.
- Penalize questions whose tag values are mostly `0.5`; they are uncertain data,
  not useful splits.
- Do not hard-cap all exact colors to one forever. Ask broad color-family
  questions first, then one exact color only when color separates the top
  candidates.

Suggested color hierarchy:

- `achromatic`: black, white, grey
- `neutralColor`: beige, brown, navy, achromatic
- `warmColor`: red, orange, yellow, pink
- `coolColor`: blue, green, purple
- `dark`: existing brightness signal
- Exact color only for final disambiguation

## Guess policy

The current policy waits for `topProbability >= 0.75` or question 14. With many
near-duplicate candidates, the threshold is rarely reached.

Use several signals:

- Guess after at least 5 questions when `topProbability >= 0.55`.
- Guess when the top candidate is at least 3 times more likely than the second.
- Guess when posterior entropy is low enough that only a small shortlist remains.
- If several candidates have the same effective vector, guess the highest-prior
  one early and use rejection as information.
- Stop asking when the best remaining question has negligible expected gain.

## Priors and learning

The current prior is uniform across all 1,302 variants. This means categories
with many color variants receive more initial mass. Replace it with either:

- a hierarchical prior that first allocates mass to product families, then
  variants; or
- an empirical prior learned from completed games.

Store game outcomes:

- target item
- questions shown
- answers
- rejected guesses
- final success/failure

Use this to estimate `P(answer | item, attribute)`, product popularity priors,
and which prompt variants users answer consistently. This is the closest
practical analogue to Akinator's disclosed learning-from-past-players behavior.

## Recommended delivery order

1. Normalize product families and add 12–18 objective construction attributes.
2. Add prompt variants while preserving one evidence dimension per attribute.
3. Add staged/group-diverse question selection.
4. Change the guess policy and measure again.
5. Add subtype question banks, beginning with graphic T-shirts, pants, and
   shirts because they dominate the catalog.
6. Add telemetry and learn priors/likelihoods from play.

## Acceptance targets

Measure with both simulation and human play:

- Median first guess by question 8.
- Median successful finish by question 10.
- At least 90% simulated success on distinguishable vectors.
- No repeated question group on consecutive turns.
- No more than two color-related questions before the first guess.
- Fewer than 10% of targets in duplicate-vector groups larger than five.
