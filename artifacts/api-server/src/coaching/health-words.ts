/**
 * Word lists for the coach agent (docs/COACH-AGENT-SPEC.md §3, §6, §10). DRAFT: Fable and the physiologist review
 * this file; any change is its own PR. All matching is whole-word, case-insensitive.
 */

/** Health details that never go into the coach's memory (spec §3 write_memory, §4). */
export const HEALTH_WORDS = [
  // conditions
  "diabetes", "diabetic", "asthma", "asthmatic", "epilepsy", "epileptic", "seizure", "seizures", "cancer", "tumour", "tumor",
  "hypertension", "blood pressure", "cholesterol", "arthritis", "osteoporosis", "scoliosis", "hernia", "heart condition",
  "heart disease", "stroke", "copd", "thyroid", "pcos", "endometriosis", "fibromyalgia", "ms", "multiple sclerosis",
  "parkinson's", "parkinsons", "lupus", "crohn's", "crohns", "ibs", "kidney", "liver", "hiv", "hepatitis",
  // injuries and procedures
  "injury", "injured", "surgery", "operation", "fracture", "fractured", "broken", "torn", "tear", "acl", "mcl", "meniscus",
  "rotator cuff", "herniated", "slipped disc", "disc bulge", "sciatica", "tendinitis", "tendonitis", "concussion",
  // body states
  "pregnant", "pregnancy", "postpartum", "miscarriage", "menopause", "period", "periods",
  // mind
  "depression", "depressed", "anxiety", "anxious", "adhd", "autism", "autistic", "bipolar", "ptsd", "ocd", "eating disorder",
  "anorexia", "bulimia", "therapy", "therapist", "psychiatrist",
  // medicine
  "medication", "medications", "medicine", "prescribed", "prescription", "pills", "insulin", "doctor said",
];

/** Medicines and supplements the coach must never name (spec §6.5). */
export const MEDICINES = [
  "ibuprofen", "paracetamol", "acetaminophen", "aspirin", "naproxen", "nurofen", "panadol", "voltaren", "diclofenac",
  "codeine", "tramadol", "oxycodone", "morphine", "cortisone", "prednisone", "steroid", "steroids", "anabolic",
  "testosterone", "trt", "sarms", "insulin", "metformin", "ozempic", "semaglutide", "wegovy", "mounjaro", "tirzepatide",
  "creatine", "whey", "protein powder", "pre-workout", "preworkout", "bcaa", "bcaas", "caffeine pills", "fat burner",
  "fat burners", "melatonin", "magnesium", "zinc", "vitamin", "vitamins", "fish oil", "collagen", "ashwagandha",
  "glutamine", "beta-alanine", "electrolytes", "supplement", "supplements",
];

/** Diagnosis words the coach must never use (spec §6.5). */
export const DIAGNOSIS_WORDS = [
  "tear", "torn", "tendinitis", "tendonitis", "tendinopathy", "sprain", "sprained", "strain", "strained", "fracture",
  "fractured", "stress fracture", "herniated", "herniation", "bulging disc", "slipped disc", "sciatica", "arthritis",
  "bursitis", "impingement", "shin splints", "plantar fasciitis", "tennis elbow", "golfer's elbow", "runner's knee",
  "it band syndrome", "rotator cuff", "meniscus", "dislocated", "dislocation", "pinched nerve", "nerve damage",
  "concussion", "diagnose", "diagnosis",
];

/** Phrases only the OUTPUT filter rejects (spec §6.1): they encourage training on through pain. */
export const OUTPUT_ONLY_FLAGS = ["push through", "pushing through", "train through the pain", "work through the pain", "ice it", "no pain no gain"];

/** Coaching cues that contain a warning word but are form cues, excused in the OUTPUT filter only. Draft, for review. */
export const OUTPUT_CUES = ["chest up", "chest tall", "chest proud", "lift your chest", "open your chest", "open the chest", "heart rate"];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const wordsRe = (words: string[]) => new RegExp(`(?<![a-z'])(?:${[...words].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![a-z])`, "i");

const HEALTH_RE = wordsRe(HEALTH_WORDS);
export const mentionsHealth = (text: string) => HEALTH_RE.test(text.replace(/[’`]/g, "'"));
