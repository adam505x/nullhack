// Convert generated Uniqlo weight vectors into Artemator's richer Catalog shape.
//
// Usage:
//   node scripts/import-uniqlo-catalog.mjs input.jsonl [catalog.json] [report.json]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2];
if (!input) {
  console.error(
    "usage: node scripts/import-uniqlo-catalog.mjs input.jsonl [catalog.json] [report.json]"
  );
  process.exit(1);
}

const output = path.resolve(
  process.argv[3] ?? path.join(ROOT, "src", "data", "catalog.json")
);
const reportOutput = path.resolve(
  process.argv[4] ?? path.join(ROOT, "docs", "uniqlo-catalog-report.json")
);
const overridesPath = path.join(ROOT, "scripts", "uniqlo-overrides.json");
const overrides = fs.existsSync(overridesPath)
  ? JSON.parse(fs.readFileSync(overridesPath, "utf8"))
  : {};

const COLOR_IDS = [
  "black",
  "white",
  "grey",
  "beige",
  "brown",
  "navy",
  "blue",
  "green",
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
  "multicolor",
];

const attr = (id, topic, stage, prompts, extra = {}) => ({
  id,
  prompts,
  topic,
  stage,
  ...extra,
});

const ATTRIBUTES = [
  attr("wearTop", "silhouette", "routing", [
    "Would you wear it above your waist?",
    "Does it mainly live on your top half?",
    "Would it cover your torso?",
  ]),
  attr("wearBottom", "silhouette", "routing", [
    "Is it a main bottom piece, like trousers, shorts, or a skirt?",
    "Would it replace choosing trousers or a skirt?",
    "Is it a bottom garment rather than socks or underwear?",
  ]),
  attr("onePiece", "silhouette", "routing", [
    "Does one piece cover both your top and bottom?",
    "Is it a whole outfit in one move?",
    "Could you skip choosing separate tops and bottoms?",
  ]),
  attr("feetRelated", "body-area", "routing", [
    "Is it specifically socks, tights, or footwear?",
    "Are we somewhere in socks, tights, or shoes territory?",
    "Would it belong near the sock drawer or shoe rack?",
  ]),
  attr("footwear", "category", "routing", [
    "Is it a shoe, sandal, boot, or slipper rather than a sock?",
    "Are we hunting for shoes rather than hosiery?",
    "Does it have a sole you would walk on?",
  ]),
  attr("accessory", "category", "routing", [
    "Is it an accessory rather than clothing?",
    "Does it finish the look instead of forming the outfit?",
    "Could you carry or add it after getting dressed?",
  ]),
  attr("outerwear", "category", "routing", [
    "Is it the layer you put on before heading outside?",
    "Are we in jacket-or-coat territory?",
    "Would it usually be your outermost layer?",
  ]),
  attr("underwear", "category", "routing", [
    "Is it closer to underwear than an outfit piece?",
    "Would it normally be the first layer you put on?",
    "Are we looking in the underwear drawer?",
  ]),
  attr("legwear", "category", "routing", [
    "Is it hosiery or something like socks?",
    "Does it belong in the socks-and-tights drawer?",
    "Is it legwear rather than regular bottoms?",
  ]),
  attr("womenswear", "department", "routing", [
    "Was it listed in Uniqlo's women's section?",
    "Would you find it on the womenswear side of the catalog?",
    "Is Uniqlo merchandising it as womenswear?",
  ]),

  attr("shortSleeve", "sleeves", "construction", [
    "Does it have short sleeves?",
    "Do the sleeves stop around the upper arm?",
    "Are we showing most of the arms?",
  ]),
  attr("longSleeve", "sleeves", "construction", [
    "Does it have long sleeves?",
    "Do the sleeves run down toward the wrists?",
    "Are your arms mostly covered?",
  ]),
  attr("sleeveless", "sleeves", "construction", [
    "Is it sleeveless?",
    "Would your shoulders or arms be left uncovered?",
    "Does it skip sleeves altogether?",
  ]),
  attr("collared", "neckline", "construction", [
    "Would I find a collar near the neckline?",
    "Does a collar frame the top?",
    "Is the neckline finished with a proper collar?",
  ]),
  attr("hooded", "neckline", "construction", [
    "Is there a hood involved?",
    "Could you pull part of it over your head?",
    "Does it come with a hood at the back?",
  ]),
  attr("buttonFront", "closure", "construction", [
    "Does it button down the front?",
    "Are buttons the main way it closes?",
    "Would you fasten it with a row of buttons?",
  ]),
  attr("zipFront", "closure", "construction", [
    "Does a zip run down the front?",
    "Is it a full-zip piece?",
    "Would you close it with a front zipper?",
  ]),
  attr("cropped", "length", "construction", [
    "Is it deliberately cropped?",
    "Does it finish noticeably shorter than usual?",
    "Are we going for a cropped length?",
  ]),
  attr("longLength", "length", "construction", [
    "Is a longer length part of the look?",
    "Does it extend farther down than the usual cut?",
    "Would you describe its silhouette as long?",
  ]),
  attr("graphicOrPrinted", "pattern", "construction", [
    "Is there artwork, a character, or a print on it?",
    "Does the design feature a visible graphic or pattern?",
    "Is it more than a plain solid piece?",
  ]),
  attr("technicalFabric", "fabric", "construction", [
    "Does it use one of Uniqlo's technical fabrics?",
    "Is performance fabric part of the appeal?",
    "Does it sound like AIRism, HEATTECH, DRY, or another tech line?",
  ]),
  attr("knit", "fabric", "construction", [
    "Is it knitted?",
    "Does the fabric have knitwear energy?",
    "Would you put it in the knitwear stack?",
  ]),
  attr("linen", "fabric", "construction", [
    "Is linen involved?",
    "Does it have that breezy linen feel?",
    "Are you thinking of a linen or linen-blend piece?",
  ]),
  attr("fleeceOrPile", "fabric", "construction", [
    "Is it fleece or fluffy pile?",
    "Does the fabric look soft and fuzzy?",
    "Are we after a fleece-like texture?",
  ]),
  attr("downOrPadded", "fabric", "construction", [
    "Is it padded or filled with down?",
    "Does it have visible insulation or puffiness?",
    "Are we talking about a puffer-style piece?",
  ]),
  attr("denim", "fabric", "construction", [
    "Is denim involved?",
    "Would you describe the fabric as denim?",
    "Are we entering jeans-jacket territory?",
  ]),

  attr("licensedCharacter", "graphic", "subtype", [
    "Does the design feature a recognizable character or franchise?",
    "Is a licensed character part of the graphic?",
    "Would fans recognize someone on the design?",
  ], { appliesTo: ["tshirt", "sweatshirt"] }),
  attr("animeOrManga", "graphic", "subtype", [
    "Is the graphic tied to anime or manga?",
    "Would an anime fan recognize the collaboration?",
    "Does the design come from Japanese animation or comics?",
  ], { appliesTo: ["tshirt", "sweatshirt"] }),
  attr("artistOrMuseum", "graphic", "subtype", [
    "Is it connected to an artist, museum, or artwork?",
    "Does the design belong in a gallery collaboration?",
    "Is fine art the source of the graphic?",
  ], { appliesTo: ["tshirt", "sweatshirt"] }),
  attr("textGraphic", "graphic", "subtype", [
    "Is text or lettering the main graphic?",
    "Does the design make its point with words?",
    "Would you notice typography before an illustration?",
  ], { appliesTo: ["tshirt", "sweatshirt"] }),
  attr("collaboration", "graphic", "subtype", [
    "Is it part of a named collaboration?",
    "Did Uniqlo team up with another creator or brand for it?",
    "Does it come from one of the special collaboration collections?",
  ], { appliesTo: ["tshirt", "sweatshirt"] }),

  attr("polo", "shirt-detail", "subtype", [
    "Is it a polo?",
    "Does it have that short placket and polo collar?",
    "Are we looking for polo-shirt energy?",
  ], { appliesTo: ["shirt", "tshirt"] }),
  attr("overshirt", "shirt-detail", "subtype", [
    "Is it an overshirt?",
    "Could it work open as a light layer?",
    "Is it heavier and more layer-like than a regular shirt?",
  ], { appliesTo: ["shirt"] }),
  attr("patterned", "shirt-detail", "subtype", [
    "Does the shirt have a visible pattern?",
    "Is it checked, striped, floral, or otherwise patterned?",
    "Are we steering away from a plain shirt?",
  ], { appliesTo: ["shirt"] }),

  attr("wideLeg", "pants-detail", "subtype", [
    "Do the legs have a wide cut?",
    "Are we looking for a roomy wide-leg silhouette?",
    "Does the shape open up through the leg?",
  ], { appliesTo: ["pants", "jeans"] }),
  attr("pleated", "pants-detail", "subtype", [
    "Are there pleats at the front?",
    "Does tailoring add a visible pleat?",
    "Are pleated trousers the idea?",
  ], { appliesTo: ["pants", "shorts", "skirt"] }),
  attr("cargo", "pants-detail", "subtype", [
    "Does it have cargo pockets?",
    "Are utility pockets part of the look?",
    "Is it in cargo territory?",
  ], { appliesTo: ["pants", "shorts"] }),
  attr("jogger", "pants-detail", "subtype", [
    "Is it a jogger or sweatpant shape?",
    "Do the bottoms lean athletic and relaxed?",
    "Would elasticated joggers describe it?",
  ], { appliesTo: ["pants"] }),
  attr("ankleLength", "pants-detail", "subtype", [
    "Does it finish around the ankle?",
    "Is it intentionally ankle-length?",
    "Would the hem sit a little shorter than full length?",
  ], { appliesTo: ["pants", "jeans"] }),

  attr("peaceForAll", "graphic-collection", "subtype", [
    "Is it from the PEACE FOR ALL collection?",
    "Does PEACE FOR ALL appear in the product name?",
    "Are we thinking of one of Uniqlo's PEACE FOR ALL tees?",
  ], { appliesTo: ["tshirt"] }),
  attr("shueishaManga", "graphic-collection", "subtype", [
    "Is it from the Shueisha manga collection?",
    "Does the MANGA UT SHUEISHA line sound right?",
    "Is it one of the Shueisha anniversary graphic tees?",
  ], { appliesTo: ["tshirt"] }),
  attr("peanutsGraphic", "graphic-collection", "subtype", [
    "Does it feature PEANUTS or Snoopy?",
    "Is Snoopy's world part of the design?",
    "Are we looking at a PEANUTS collaboration?",
  ], { appliesTo: ["tshirt"] }),
  attr("miffyGraphic", "graphic-collection", "subtype", [
    "Does it feature Miffy?",
    "Is Dick Bruna's Miffy part of the design?",
    "Are we looking at a Miffy collaboration?",
  ], { appliesTo: ["tshirt"] }),
  attr("magicForAll", "graphic-collection", "subtype", [
    "Is it from MAGIC FOR ALL?",
    "Does the MAGIC FOR ALL collection ring a bell?",
    "Are Disney icons involved through MAGIC FOR ALL?",
  ], { appliesTo: ["tshirt"] }),
  attr("pokemonGraphic", "graphic-collection", "subtype", [
    "Does it feature Pokémon?",
    "Is Pokémon the franchise on the shirt?",
    "Are we trying to catch a Pokémon graphic?",
  ], { appliesTo: ["tshirt"] }),
  attr("starWarsGraphic", "graphic-collection", "subtype", [
    "Is it a Star Wars graphic?",
    "Does the design come from a galaxy far, far away?",
    "Is Star Wars the collaboration?",
  ], { appliesTo: ["tshirt"] }),
  attr("marioGraphic", "graphic-collection", "subtype", [
    "Does it feature Mario or Mario Kart?",
    "Is Nintendo's Mario world on the design?",
    "Are we racing toward a Mario graphic?",
  ], { appliesTo: ["tshirt"] }),
  attr("museumArtGraphic", "graphic-collection", "subtype", [
    "Is it from an art or museum collection?",
    "Would the graphic feel at home on a gallery wall?",
    "Is a museum or established artwork behind the print?",
  ], { appliesTo: ["tshirt"] }),

  attr("sunglasses", "accessory-detail", "subtype", [
    "Are they sunglasses?",
    "Is the accessory a pair of shades?",
    "Would you wear it over your eyes in the sun?",
  ], { appliesTo: ["accessory"] }),
  attr("metalFrame", "eyewear-detail", "subtype", [
    "Does the eyewear have a metal frame?",
    "Is the frame visibly metallic?",
    "Are we after a lighter metal-frame look?",
  ], { appliesTo: ["accessory"] }),
  attr("squareFrame", "eyewear-detail", "subtype", [
    "Is the eyewear square or rectangular?",
    "Do the lenses have an angular frame?",
    "Are straight-edged frames part of the look?",
  ], { appliesTo: ["accessory"] }),
  attr("roundFrame", "eyewear-detail", "subtype", [
    "Is the eyewear rounded?",
    "Do the lenses lean round rather than angular?",
    "Are we looking for a softer circular frame?",
  ], { appliesTo: ["accessory"] }),
  attr("foldingFrame", "eyewear-detail", "subtype", [
    "Can the sunglasses fold down compactly?",
    "Is it specifically a folding frame?",
    "Do the shades have an extra fold-away trick?",
  ], { appliesTo: ["accessory"] }),
  attr("doubleBridge", "eyewear-detail", "subtype", [
    "Does the frame have a double bridge?",
    "Are there two bars across the bridge?",
    "Is a double-bridge detail part of the eyewear?",
  ], { appliesTo: ["accessory"] }),

  attr("lowRise", "underwear-detail", "subtype", [
    "Is it low rise?",
    "Does it sit lower on the waist?",
    "Are we looking for a low-rise cut?",
  ], { appliesTo: ["underwear", "pants", "jeans"] }),
  attr("highRise", "underwear-detail", "subtype", [
    "Is it high rise?",
    "Does it sit higher on the waist?",
    "Are we looking for a high-rise cut?",
  ], { appliesTo: ["underwear", "pants", "jeans"] }),
  attr("seamless", "underwear-detail", "subtype", [
    "Is it designed to be seamless?",
    "Does it aim to disappear under clothes?",
    "Are visible seams intentionally minimized?",
  ], { appliesTo: ["underwear"] }),
  attr("wireless", "underwear-detail", "subtype", [
    "Is the bra wireless?",
    "Does it skip underwires?",
    "Are we looking for wireless support?",
  ], { appliesTo: ["underwear"] }),
  attr("braTop", "underwear-detail", "subtype", [
    "Is it a bra top or built-in-bra camisole?",
    "Does it combine a top with built-in support?",
    "Are we after one of Uniqlo's bra tops?",
  ], { appliesTo: ["underwear"] }),
  attr("mesh", "underwear-detail", "subtype", [
    "Does it use mesh?",
    "Is breathable mesh part of the construction?",
    "Are there visible mesh panels?",
  ], { appliesTo: ["underwear"] }),

  attr("socks", "legwear-type", "subtype", [
    "Are they socks rather than tights?",
    "Does this belong specifically in the sock drawer?",
    "Are we looking for a pair of socks?",
  ], { appliesTo: ["legwear"] }),
  attr("sockShort", "sock-length", "subtype", [
    "Are they short or low-cut socks?",
    "Would they stop around or below the ankle?",
    "Are we looking for a shorter sock length?",
  ], { appliesTo: ["legwear"] }),
  attr("sockMidLength", "sock-length", "subtype", [
    "Are they crew, half, or regular-length socks?",
    "Would they rise above the ankle without reaching the knee?",
    "Are we in classic mid-length sock territory?",
  ], { appliesTo: ["legwear"] }),
  attr("sockKneeHigh", "sock-length", "subtype", [
    "Do they reach the knee or sit especially high?",
    "Are these knee-high or long socks?",
    "Would they cover most of the lower leg?",
  ], { appliesTo: ["legwear"] }),
  attr("sockRibbed", "sock-texture", "subtype", [
    "Do the socks have a ribbed texture?",
    "Are visible ribs part of the knit?",
    "Does a ribbed sock sound right?",
  ], { appliesTo: ["legwear"] }),
  attr("sockMultipack", "sock-pack", "subtype", [
    "Does the product come as a multipack of socks?",
    "Are there two or three pairs in the pack?",
    "Are we looking for a sock set rather than one pair?",
  ], { appliesTo: ["legwear"] }),
  attr("sockPatterned", "pattern", "subtype", [
    "Do the socks have a visible pattern or contrasting design?",
    "Are they patterned rather than plain?",
    "Is there something like checks, dots, argyle, or color blocking?",
  ], { appliesTo: ["legwear"] }),

  attr("striped", "pattern", "subtype", [
    "Is it striped?",
    "Do stripes run across the design?",
    "Is a striped pattern part of the piece?",
  ], { appliesTo: ["shirt", "pants", "shorts", "skirt", "underwear", "legwear"] }),
  attr("slimFit", "fit", "subtype", [
    "Is it specifically a slim fit?",
    "Does the product name call out a slim cut?",
    "Are we narrowing in on a slim silhouette?",
  ], { appliesTo: ["shirt", "pants", "jeans"] }),
  attr("nonIron", "shirt-detail", "subtype", [
    "Is it a non-iron shirt?",
    "Is easy-care, wrinkle-resistant shirting the point?",
    "Does the name promise non-iron performance?",
  ], { appliesTo: ["shirt"] }),
  attr("jerseyFabric", "fabric", "subtype", [
    "Is it made from jersey fabric?",
    "Does soft jersey construction sound right?",
    "Is jersey called out in the product name?",
  ], { appliesTo: ["shirt", "pants", "dress", "skirt"] }),
  attr("oxfordFabric", "fabric", "subtype", [
    "Is it an Oxford shirt?",
    "Does classic Oxford cloth sound right?",
    "Are we looking for Oxford fabric?",
  ], { appliesTo: ["shirt"] }),
  attr("stretchFabric", "fabric", "subtype", [
    "Does it specifically call out stretch?",
    "Is extra stretch part of the construction?",
    "Should the fabric move and flex?",
  ], { appliesTo: ["shirt", "pants", "jeans", "shorts"] }),
  attr("straightLeg", "pants-detail", "subtype", [
    "Is it a straight-leg cut?",
    "Do the legs fall in a straight line?",
    "Are we avoiding both skinny and wide shapes?",
  ], { appliesTo: ["pants", "jeans"] }),
  attr("balloonOrVolume", "pants-detail", "subtype", [
    "Does it have a balloon or volume silhouette?",
    "Is extra sculptural volume part of the leg shape?",
    "Are we looking for a rounded, roomy cut?",
  ], { appliesTo: ["pants", "skirt"] }),
  attr("easyWaist", "pants-detail", "subtype", [
    "Is it one of the relaxed easy-waist styles?",
    "Does an easy or elastic waist sound right?",
    "Are comfort-first easy pants the idea?",
  ], { appliesTo: ["pants", "shorts", "skirt"] }),

  attr("dressy", "occasion", "style", [
    "Are you dressing up rather than down?",
    "Does it feel ready for a sharper occasion?",
    "Should the look lean polished?",
  ]),
  attr("sporty", "occasion", "style", [
    "Does it have athletic energy?",
    "Would it feel at home in an active outfit?",
    "Is sporty part of the vibe?",
  ]),
  attr("warmWeather", "season", "style", [
    "Is it made for warm weather?",
    "Would you reach for it on a hot day?",
    "Does it belong in the summer rotation?",
  ]),
  attr("dark", "color", "color", [
    "Are you picturing a dark-colored piece?",
    "Does it live on the darker side of the palette?",
    "Would you call its overall color dark?",
  ], { colorLevel: "family" }),
  attr("colourPop", "color", "color", [
    "Should it bring a pop of color?",
    "Does the color want some attention?",
    "Are we avoiding a quiet palette?",
  ], { colorLevel: "family" }),
  attr("neutralTone", "color", "color", [
    "Are you drawn to a neutral tone?",
    "Is the palette white, beige, grey, or similarly calm?",
    "Should the color stay easy and neutral?",
  ], { colorLevel: "family" }),
  attr("layerPiece", "layering", "style", [
    "Is it meant to layer over another piece?",
    "Would you wear something underneath it?",
    "Does it earn its place as a layering piece?",
  ]),
  attr("statement", "aesthetic", "style", [
    "Should it turn heads?",
    "Is the piece meant to make a statement?",
    "Do you want it to be noticed?",
  ]),
  attr("minimal", "aesthetic", "style", [
    "Do you want something clean and minimal?",
    "Should the design keep things beautifully simple?",
    "Are you leaning toward a no-fuss look?",
  ]),
  attr("streetwear", "aesthetic", "style", [
    "Are we in streetwear territory?",
    "Does it have a city-ready streetwear vibe?",
    "Would it fit naturally into a streetwear look?",
  ]),
  attr("classic", "aesthetic", "style", [
    "Is it more timeless classic than passing trend?",
    "Could this piece stay in rotation for years?",
    "Are you after a wardrobe classic?",
  ]),
  attr("cozy", "comfort", "style", [
    "Is comfort the top priority?",
    "Should it feel especially cozy?",
    "Are we dressing for maximum comfort?",
  ]),
  attr("edgy", "aesthetic", "style", [
    "Should it have a bit of an edge?",
    "Does the look need some attitude?",
    "Are you after something slightly rebellious?",
  ]),
  attr("romantic", "aesthetic", "style", [
    "Is the vibe soft and romantic?",
    "Should it feel delicate or romantic?",
    "Are we leaning into a softer mood?",
  ]),
  attr("officeOk", "occasion", "style", [
    "Could you wear it to the office?",
    "Would it pass a workday dress code?",
    "Can it handle a day at work?",
  ]),
  attr("nightOut", "occasion", "style", [
    "Is it destined for a night out?",
    "Would you choose it after dark?",
    "Does it feel ready for evening plans?",
  ]),
  attr("fitted", "fit", "style", [
    "Should it hug the body rather than hang loose?",
    "Are you picturing a fitted silhouette?",
    "Does the cut sit close to the body?",
  ]),
  attr("luxe", "aesthetic", "style", [
    "Should it feel a little luxe?",
    "Are you after an elevated, premium mood?",
    "Does it need a touch of luxury?",
  ]),

  attr("achromatic", "color", "color", [
    "Is it black, white, or grey?",
    "Are we staying in an achromatic palette?",
    "Does the color skip hue altogether?",
  ], { colorLevel: "family" }),
  attr("neutralColor", "color", "color", [
    "Is it in the neutral color family?",
    "Would black, white, grey, beige, brown, or navy fit?",
    "Does it use an easy wardrobe neutral?",
  ], { colorLevel: "family" }),
  attr("warmColor", "color", "color", [
    "Is it a warm color like red, orange, yellow, or pink?",
    "Does the color sit on the warm side of the wheel?",
    "Are we chasing a warm-toned piece?",
  ], { colorLevel: "family" }),
  attr("coolColor", "color", "color", [
    "Is it a cool color like blue, green, or purple?",
    "Does the color sit on the cool side of the wheel?",
    "Are we chasing a cool-toned piece?",
  ], { colorLevel: "family" }),
  ...COLOR_IDS.map((color) =>
    attr("color:" + color, "color", "color", [
      `Is the product ${color}?`,
      `Would you call its main color ${color}?`,
      `Am I looking for a ${color} version?`,
    ], { colorLevel: "exact" })
  ),
];

const ATTRIBUTE_IDS = new Set(ATTRIBUTES.map(({ id }) => id));
const TOP_FAMILIES = new Set(["tshirt", "shirt", "sweater", "sweatshirt", "outerwear"]);
const BOTTOM_FAMILIES = new Set(["pants", "jeans", "shorts", "skirt"]);

function classifyFamily(name) {
  const n = name.toLowerCase();
  if (/\b(bra|briefs?|boxers?|trunks?|underwear|shapewear|camisole|slip|hiphuggers?)\b/.test(n)) return "underwear";
  if (/\b(socks?|tights?|stockings?)\b/.test(n)) return "legwear";
  if (/\b(umbrella|bags?|pouch|wallet|belts?|caps?|hats?|beanie|gloves?|scarves?|scarf|stole|sunglasses?|eyewear)\b/.test(n)) return "accessory";
  if (/\b(shoes?|sandals?|slippers?|sneakers?|boots?)\b/.test(n)) return "footwear";
  if (/\b(dresses?|jumpsuits?|rompers?)\b/.test(n)) return "dress";
  if (/\b(skirts?)\b/.test(n)) return "skirt";
  if (/\b(shorts?)\b/.test(n)) return "shorts";
  if (/\bjeans?\b/.test(n)) return "jeans";
  if (/\b(pants?|trousers?|leggings?|joggers?|sweatpants?)\b/.test(n)) return "pants";
  if (/\b(jackets?|coats?|parkas?|blousons?|windbreakers?|outerwear|vests?)\b/.test(n)) return "outerwear";
  if (/\b(hoodies?|sweatshirts?)\b/.test(n)) return "sweatshirt";
  if (/\b(sweaters?|cardigans?|pullovers?|knitwear)\b/.test(n)) return "sweater";
  if (/t-?shirts?|\btees?\b|\bUT\b/i.test(name)) return "tshirt";
  if (/\b(shirts?|blouses?|polos?|overshirts?)\b/.test(n)) return "shirt";
  return "other";
}

function classifySubtype(name, family) {
  const n = name.toLowerCase();
  const tests = [
    ["hoodie", /\bhood/],
    ["polo", /\bpolo\b/],
    ["overshirt", /\bovershirt\b/],
    ["cardigan", /\bcardigan\b/],
    ["turtleneck", /\b(turtleneck|high neck)\b/],
    ["tank-top", /\b(tank|sleeveless)\b/],
    ["graphic-tshirt", /\b(graphic|printed|ut archive|utme)\b/],
    ["bra", /\bbra\b/],
    ["boxer-or-trunk", /\b(boxer|trunk)\b/],
    ["brief", /\bbrief\b/],
    ["socks", /\bsocks?\b/],
    ["leggings-or-tights", /\b(leggings?|tights?)\b/],
    ["down-jacket", /\b(down|puffer|pufftech)\b/],
    ["parka", /\bparka\b/],
    ["coat", /\bcoat\b/],
    ["jacket", /\bjacket\b/],
    ["wide-leg-pants", /\bwide\b.*\b(pants?|jeans?|trousers?)\b/],
    ["cargo", /\bcargo\b/],
    ["jogger", /\b(jogger|sweatpants?)\b/],
    ["pleated", /\bpleat/],
    ["mini-skirt", /\bmini\b/],
    ["long-dress", /\b(maxi|long)\b.*\bdress\b/],
    ["umbrella", /\bumbrella\b/],
    ["bag", /\b(bag|pouch)\b/],
    ["hat", /\b(cap|hat|beanie)\b/],
  ];
  return tests.find(([, pattern]) => pattern.test(n))?.[0] ?? family;
}

function set(tags, id, value) {
  if (value !== undefined) tags[id] = value;
}

function deriveObjectiveTags(row, family) {
  const name = row.name;
  const n = name.toLowerCase();
  const tags = {};
  const isTop = TOP_FAMILIES.has(family);
  const isBottom = BOTTOM_FAMILIES.has(family);
  const isTopUnderwear = family === "underwear" && /\b(bra|camisole)\b/.test(n);
  const isBottomUnderwear = family === "underwear" && !isTopUnderwear;
  const isSock = family === "legwear" && /\bsocks?\b/.test(n);

  set(tags, "wearTop", isTop || family === "dress" || isTopUnderwear ? 1 : 0);
  set(tags, "wearBottom", isBottom || family === "dress" || isBottomUnderwear ? 1 : 0);
  set(tags, "onePiece", family === "dress" ? 1 : 0);
  set(tags, "feetRelated", family === "footwear" || family === "legwear" ? 1 : 0);
  set(tags, "footwear", family === "footwear" ? 1 : 0);
  set(tags, "accessory", family === "accessory" ? 1 : 0);
  set(tags, "outerwear", family === "outerwear" ? 1 : 0);
  set(tags, "underwear", family === "underwear" ? 1 : 0);
  set(tags, "legwear", family === "legwear" ? 1 : 0);
  set(tags, "womenswear", row.gender === "women" ? 1 : 0);

  const sleeveRelevant = isTop || family === "dress";
  if (!sleeveRelevant) {
    set(tags, "shortSleeve", 0);
    set(tags, "longSleeve", 0);
    set(tags, "sleeveless", 0);
  } else if (/\b(sleeveless|tank|camisole)\b/.test(n)) {
    set(tags, "sleeveless", 1);
    set(tags, "shortSleeve", 0);
    set(tags, "longSleeve", 0);
  } else if (/\b(long[- ]sleeve|3\/4 sleeve)\b/.test(n)) {
    set(tags, "longSleeve", 1);
    set(tags, "shortSleeve", 0);
    set(tags, "sleeveless", 0);
  } else if (/\b(short[- ]sleeve)\b/.test(n) || family === "tshirt") {
    set(tags, "shortSleeve", 1);
    set(tags, "longSleeve", 0);
    set(tags, "sleeveless", 0);
  } else if (family === "sweater" || family === "sweatshirt" || family === "outerwear") {
    set(tags, "longSleeve", 1);
    set(tags, "shortSleeve", 0);
    set(tags, "sleeveless", 0);
  }

  if (!sleeveRelevant) set(tags, "collared", 0);
  else if (/\b(polo|collar|shirt|blouse|overshirt)\b/.test(n)) set(tags, "collared", 1);
  else if (family === "tshirt" || family === "sweatshirt") set(tags, "collared", 0);

  set(tags, "hooded", /\bhood/.test(n) ? 1 : 0);
  if (/\b(button|cardigan)\b/.test(n)) set(tags, "buttonFront", 1);
  else if (!["shirt", "outerwear", "sweater"].includes(family)) set(tags, "buttonFront", 0);
  if (/\b(full[- ]zip|zip[- ]up|zip front)\b/.test(n)) set(tags, "zipFront", 1);
  else if (!["outerwear", "sweatshirt", "sweater"].includes(family)) set(tags, "zipFront", 0);

  set(tags, "cropped", /\b(crop|cropped)\b/.test(n) ? 1 : 0);
  if (/\b(maxi|long coat|long dress|long skirt|long cardigan|long jacket|long vest|full-length)\b/.test(n)) {
    set(tags, "longLength", 1);
  } else if (/\b(mini|cropped|ankle|shorts?)\b/.test(n)) {
    set(tags, "longLength", 0);
  }

  const graphicTerms = /\b(graphic|print|printed|pattern|floral|stripe|checked|plaid|ut archive|utme)\b/.test(n);
  const collaborationTerms =
    /\b(disney|marvel|pixar|pokemon|sanrio|hello kitty|snoopy|peanuts|miffy|doraemon|studio ghibli|one piece|naruto|jujutsu|dragon ball|manga|anime|museum|louvre|moma|warhol|basquiat|hokusai|kaws|marimekko|jw anderson|roger federer|uniqlo u|engineered garments|needles|peace for all)\b/.test(n) ||
    /\bUT\b/.test(name);
  set(tags, "graphicOrPrinted", graphicTerms || collaborationTerms ? 1 : 0);
  set(tags, "technicalFabric", /\b(airism|heattech|dry-ex|dry stretch|blocktech|uv protection|ultra light down|pufftech)\b/.test(n) ? 1 : 0);
  set(tags, "knit", /\b(knit|sweater|cardigan|merino|cashmere|souffl[eé]|ribbed knit)\b/.test(n) ? 1 : 0);
  set(tags, "linen", /\blinen\b/.test(n) ? 1 : 0);
  set(tags, "fleeceOrPile", /\b(fleece|pile|boa)\b/.test(n) ? 1 : 0);
  set(tags, "downOrPadded", /\b(down|padded|puffer|pufftech)\b/.test(n) ? 1 : 0);
  set(tags, "denim", family === "jeans" || /\bdenim\b/.test(n) ? 1 : 0);

  const licensed = /\b(disney|marvel|pixar|pokemon|sanrio|hello kitty|snoopy|peanuts|miffy|doraemon|studio ghibli|one piece|naruto|jujutsu|dragon ball|mario kart|star wars|blue lock|moomin|mofusand|monchhichi|chiikawa|zo&friends|spy.?family|bleach|sakamoto days|coji-coji|magic for all|cheerful characters|dick bruna)\b/.test(n);
  set(tags, "licensedCharacter", licensed ? 1 : 0);
  set(tags, "animeOrManga", /\b(studio ghibli|one piece|naruto|jujutsu|dragon ball|manga|anime|doraemon|pokemon|blue lock|spy.?family|bleach|sakamoto days|coji-coji)\b/.test(n) ? 1 : 0);
  set(tags, "artistOrMuseum", /\b(museum|louvre|moma|warhol|basquiat|hokusai|artwork|artist|ny pop art|ukiyo-e|keith haring|jason polan|daido moriyama|herzog|kashiwa sato|julian opie|yu nagaba|tokujin yoshioka|saul leiter|olivia arthur|cristina de middel|lindokuhle sobekwa|sofia coppola|tadao ando|dick bruna)\b/.test(n) ? 1 : 0);
  set(tags, "textGraphic", /\b(logo|slogan|typography|text|peace for all)\b/.test(n) ? 1 : 0);
  set(tags, "collaboration", collaborationTerms ? 1 : 0);

  set(tags, "polo", /\bpolo\b/.test(n) ? 1 : 0);
  set(tags, "overshirt", /\bovershirt\b/.test(n) ? 1 : 0);
  set(tags, "patterned", /\b(pattern|print|floral|stripe|checked|plaid)\b/.test(n) ? 1 : 0);
  set(tags, "wideLeg", /\bwide\b/.test(n) ? 1 : 0);
  set(tags, "pleated", /\bpleat/.test(n) ? 1 : 0);
  set(tags, "cargo", /\bcargo\b/.test(n) ? 1 : 0);
  set(tags, "jogger", /\b(jogger|sweatpants?)\b/.test(n) ? 1 : 0);
  set(tags, "ankleLength", /\b(ankle|cropped pants|cropped jeans)\b/.test(n) ? 1 : 0);
  set(tags, "peaceForAll", /\bpeace for all\b/.test(n) ? 1 : 0);
  set(tags, "shueishaManga", /\bmanga ut shueisha\b/.test(n) ? 1 : 0);
  set(tags, "peanutsGraphic", /\b(peanuts|snoopy)\b/.test(n) ? 1 : 0);
  set(tags, "miffyGraphic", /\b(miffy|dick bruna)\b/.test(n) ? 1 : 0);
  set(tags, "magicForAll", /\bmagic for all\b/.test(n) ? 1 : 0);
  set(tags, "pokemonGraphic", /\bpok[eé]mon\b/.test(n) ? 1 : 0);
  set(tags, "starWarsGraphic", /\bstar wars\b/.test(n) ? 1 : 0);
  set(tags, "marioGraphic", /\bmario\b/.test(n) ? 1 : 0);
  set(tags, "museumArtGraphic", /\b(museum|louvre|moma|warhol|basquiat|hokusai|ny pop art|ukiyo-e|keith haring|jason polan)\b/.test(n) ? 1 : 0);

  set(tags, "sunglasses", /\bsunglasses?\b/.test(n) ? 1 : 0);
  set(tags, "metalFrame", /\bmetal\b/.test(n) ? 1 : 0);
  set(tags, "squareFrame", /\b(square|rectangle|angular|wellington|flat top)\b/.test(n) ? 1 : 0);
  set(tags, "roundFrame", /\b(round|boston)\b/.test(n) ? 1 : 0);
  set(tags, "foldingFrame", /\bfolding\b/.test(n) ? 1 : 0);
  set(tags, "doubleBridge", /\bdouble bridge\b/.test(n) ? 1 : 0);

  set(tags, "lowRise", /\blow[- ]rise\b/.test(n) ? 1 : 0);
  set(tags, "highRise", /\bhigh[- ]rise\b/.test(n) ? 1 : 0);
  set(tags, "seamless", /\bseamless\b/.test(n) ? 1 : 0);
  set(tags, "wireless", /\bwireless\b/.test(n) ? 1 : 0);
  set(tags, "braTop", /\b(bra top|bra camisole)\b/.test(n) ? 1 : 0);
  set(tags, "mesh", /\bmesh\b/.test(n) ? 1 : 0);

  set(tags, "socks", isSock ? 1 : 0);
  set(
    tags,
    "sockShort",
    isSock && /\b(short|low[- ]cut|ankle)\b/.test(n) ? 1 : 0
  );
  set(
    tags,
    "sockMidLength",
    isSock && /\b(crew|half|regular)\b/.test(n) ? 1 : 0
  );
  set(
    tags,
    "sockKneeHigh",
    isSock && /\b(knee[- ]high|high socks?|long slouch)\b/.test(n) ? 1 : 0
  );
  set(tags, "sockRibbed", isSock && /\bribb?ed\b/.test(n) ? 1 : 0);
  set(
    tags,
    "sockMultipack",
    isSock && /\b[2-9]\s+pairs?\b/.test(n) ? 1 : 0
  );
  set(
    tags,
    "sockPatterned",
    isSock &&
      /\b(argyle|bird.?s eye|bi-colou?red?|checked|color block|dotted|flower|herringbone|multi striped|one point|paisley|pattern|stripe|striped)\b/.test(
        n
      )
      ? 1
      : 0
  );
  set(tags, "striped", /\b(stripe|striped)\b/.test(n) ? 1 : 0);
  set(tags, "slimFit", /\bslim\b/.test(n) ? 1 : 0);
  set(tags, "nonIron", /\bnon[- ]iron\b/.test(n) ? 1 : 0);
  set(tags, "jerseyFabric", /\bjersey\b/.test(n) ? 1 : 0);
  set(tags, "oxfordFabric", /\boxford\b/.test(n) ? 1 : 0);
  set(tags, "stretchFabric", /\bstretch\b/.test(n) ? 1 : 0);
  set(tags, "straightLeg", /\bstraight\b/.test(n) ? 1 : 0);
  set(tags, "balloonOrVolume", /\b(balloon|volume)\b/.test(n) ? 1 : 0);
  set(tags, "easyWaist", /\b(easy|elastic waist)\b/.test(n) ? 1 : 0);
  return tags;
}

function deriveColorTags(weights) {
  const tags = {};
  for (const color of COLOR_IDS) tags[`color:${color}`] = Number(weights[color] ?? 0);
  const max = (...ids) => Math.max(...ids.map((id) => tags[`color:${id}`] ?? 0));
  tags.achromatic = max("black", "white", "grey");
  tags.neutralColor = max("black", "white", "grey", "beige", "brown", "navy");
  tags.warmColor = max("red", "orange", "yellow", "pink");
  tags.coolColor = max("navy", "blue", "green", "purple");
  return tags;
}

const sourceRows = fs
  .readFileSync(path.resolve(input), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map(JSON.parse);
const rows = [
  ...new Map(
    sourceRows.map((row) => [
      `${row.productId}|${row.canonicalImageUrl}`,
      row,
    ])
  ).values(),
];

function germanProductUrl(productPageUrl) {
  const url = new URL(productPageUrl);
  if (url.hostname === "www.uniqlo.com") {
    url.pathname = url.pathname.replace(/^\/us\/en(?=\/|$)/, "/de/en");
  }
  return url.toString();
}

const ROUTING_IDS = new Set([
  "wearTop",
  "wearBottom",
  "feetRelated",
  "footwear",
  "accessory",
  "womenswear",
  "denim",
]);

const items = rows.map((row) => {
  const override = overrides[row.productId] ?? {};
  const name = override.name ?? row.name;
  const productFamily = override.productFamily ?? classifyFamily(name);
  const productSubtype =
    override.productSubtype ?? classifySubtype(name, productFamily);
  const imageFilename = `${row.productId.replace(
    /[^A-Za-z0-9._-]/g,
    "_"
  )}.webp`;
  const localImage = `/uniqlo/${imageFilename}`;
  const inheritedStyle = Object.fromEntries(
    Object.entries(row.weights ?? {})
      .filter(([id]) => ATTRIBUTE_IDS.has(id) && !ROUTING_IDS.has(id) && !COLOR_IDS.includes(id))
      .map(([id, value]) => [id, Number(value)])
  );
  const tags = {
    ...inheritedStyle,
    ...deriveObjectiveTags({ ...row, name }, productFamily),
    ...deriveColorTags(row.weights ?? {}),
    ...(override.tags ?? {}),
  };
  for (const [id, value] of Object.entries(tags)) {
    if (!ATTRIBUTE_IDS.has(id)) throw new Error(`override produced unknown attribute ${id} on ${row.productId}`);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`invalid ${id}=${value} on ${row.productId}`);
    }
  }
  return {
    id: row.productId,
    name,
    articleType: productSubtype,
    productFamily,
    productSubtype,
    image: fs.existsSync(path.join(ROOT, "public", "uniqlo", imageFilename))
      ? localImage
      : row.canonicalImageUrl,
    url: germanProductUrl(row.productPageUrl),
    tags,
  };
});

const familyCounts = Object.fromEntries(
  [...new Set(items.map(({ productFamily }) => productFamily))]
    .sort()
    .map((family) => [
      family,
      items.filter((item) => item.productFamily === family).length,
    ])
);
const unknownCoverage = Object.fromEntries(
  ATTRIBUTES.map(({ id }) => [
    id,
    Number(
      (
        items.filter((item) => !Object.hasOwn(item.tags, id)).length /
        items.length
      ).toFixed(4)
    ),
  ])
);
const vectors = new Map();
for (const item of items) {
  const signature = ATTRIBUTES.map(({ id }) =>
    Object.hasOwn(item.tags, id) ? item.tags[id] : "?"
  ).join("|");
  const group = vectors.get(signature) ?? [];
  group.push(item);
  vectors.set(signature, group);
}
const duplicateGroups = [...vectors.values()]
  .filter((group) => group.length > 1)
  .sort((a, b) => b.length - a.length);
const itemsInLargeGroups = duplicateGroups
  .filter((group) => group.length > 5)
  .reduce((sum, group) => sum + group.length, 0);
const report = {
  generatedAt: new Date().toISOString(),
  products: items.length,
  attributes: ATTRIBUTES.length,
  familyCounts,
  unknownCoverage,
  uniqueVectors: vectors.size,
  duplicateGroups: duplicateGroups.length,
  itemsInDuplicateGroups: duplicateGroups.reduce(
    (sum, group) => sum + group.length,
    0
  ),
  itemsInGroupsLargerThanFive: itemsInLargeGroups,
  largeGroupShare: Number((itemsInLargeGroups / items.length).toFixed(4)),
  largestGroups: duplicateGroups.slice(0, 25).map((group) => ({
    size: group.length,
    family: group[0].productFamily,
    subtype: group[0].productSubtype,
    items: group.map(({ id, name }) => ({ id, name })),
  })),
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.mkdirSync(path.dirname(reportOutput), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ attributes: ATTRIBUTES, items }, null, 2) + "\n");
fs.writeFileSync(reportOutput, JSON.stringify(report, null, 2) + "\n");
console.log(
  `Wrote ${items.length} items and ${ATTRIBUTES.length} attributes -> ${output}`
);
console.log(
  `Catalog report -> ${reportOutput} (${(report.largeGroupShare * 100).toFixed(1)}% in groups > 5)`
);
