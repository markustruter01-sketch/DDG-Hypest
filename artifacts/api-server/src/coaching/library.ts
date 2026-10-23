/**
 * DRAFT exercise library and coach list — to be reviewed by an accredited exercise physiologist
 * before any member trains on it. Single source for the plan engine, swaps and the web app.
 */

export const DISCIPLINES = ["yoga", "strength", "cross", "endurance", "athletic", "pilates"] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const EQUIPMENT = ["dumbbells", "kettlebell", "barbell", "machines", "bands", "pullup_bar", "cardio_machine", "pool"] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const AREAS = ["knee", "lower_back", "shoulder", "wrist", "hip", "ankle", "neck"] as const;
export type Area = (typeof AREAS)[number];

export const GOALS = ["strength", "muscle", "fat_loss", "fitness", "mobility", "endurance", "performance"] as const;
export type Goal = (typeof GOALS)[number];

export const EXPERIENCE = ["beginner", "intermediate", "advanced"] as const;
export type Experience = (typeof EXPERIENCE)[number];

export type Pattern =
  | "squat" | "hinge" | "lunge" | "push" | "pull" | "core" | "plyo" | "cardio" | "intervals" | "carry"
  | "flow" | "standing" | "balance" | "hips" | "spine" | "rest_pose";

export type Exercise = {
  id: string;
  name: string;
  disciplines: Discipline[];
  pattern: Pattern;
  /** Any ONE of these is enough. Empty = no equipment needed. */
  equipment: Equipment[];
  level: 1 | 2 | 3;
  /** Body areas this exercise puts real load on (used to avoid them). */
  loads: Area[];
  measure: "reps" | "time";
  /** Uses added weight, so a target load can be set and logged. */
  weighted: boolean;
  /** Gentler or equipment-free alternatives, best first. */
  swaps: string[];
  cue: string;
};

const S: Discipline[] = ["strength", "cross", "athletic"];
const ALL_FIT: Discipline[] = ["strength", "cross", "athletic", "endurance"];

export const EXERCISES: Exercise[] = [
  // Squat
  { id: "bodyweight_squat", name: "Bodyweight squat", disciplines: ALL_FIT, pattern: "squat", equipment: [], level: 1, loads: ["knee", "hip"], measure: "reps", weighted: false, swaps: ["box_squat", "glute_bridge", "wall_sit"], cue: "Sit back, chest up, knees track over toes." },
  { id: "box_squat", name: "Sit-to-stand", disciplines: ALL_FIT, pattern: "squat", equipment: [], level: 1, loads: ["knee"], measure: "reps", weighted: false, swaps: ["glute_bridge", "leg_extension"], cue: "Sit to a chair, stand tall, control the way down." },
  { id: "goblet_squat", name: "Goblet squat", disciplines: S, pattern: "squat", equipment: ["dumbbells", "kettlebell"], level: 1, loads: ["knee", "hip"], measure: "reps", weighted: true, swaps: ["box_squat", "leg_press", "glute_bridge"], cue: "Weight at chest, elbows inside knees." },
  { id: "back_squat", name: "Barbell back squat", disciplines: ["strength", "athletic"], pattern: "squat", equipment: ["barbell"], level: 2, loads: ["knee", "lower_back", "hip"], measure: "reps", weighted: true, swaps: ["goblet_squat", "leg_press", "reverse_lunge"], cue: "Brace, sit between the hips, drive up through mid-foot." },
  { id: "leg_press", name: "Leg press", disciplines: ["strength", "athletic"], pattern: "squat", equipment: ["machines"], level: 1, loads: ["knee"], measure: "reps", weighted: true, swaps: ["leg_extension", "glute_bridge"], cue: "Lower back stays on the pad." },
  { id: "leg_extension", name: "Leg extension", disciplines: ["strength", "athletic"], pattern: "squat", equipment: ["machines"], level: 1, loads: ["knee"], measure: "reps", weighted: true, swaps: ["glute_bridge", "wall_sit"], cue: "Slow up, pause, slow down." },
  { id: "wall_sit", name: "Wall sit", disciplines: ALL_FIT, pattern: "squat", equipment: [], level: 1, loads: ["knee"], measure: "time", weighted: false, swaps: ["glute_bridge"], cue: "Back flat on the wall, stop above pain-free depth." },
  // Hinge
  { id: "glute_bridge", name: "Glute bridge", disciplines: [...ALL_FIT, "yoga", "pilates"], pattern: "hinge", equipment: [], level: 1, loads: ["hip"], measure: "reps", weighted: false, swaps: ["dead_bug"], cue: "Squeeze glutes, ribs down, pause at the top." },
  { id: "hip_thrust", name: "Hip thrust", disciplines: S, pattern: "hinge", equipment: ["barbell", "dumbbells"], level: 2, loads: ["hip"], measure: "reps", weighted: true, swaps: ["glute_bridge"], cue: "Upper back on bench, chin tucked, full lockout." },
  { id: "romanian_deadlift", name: "Romanian deadlift", disciplines: S, pattern: "hinge", equipment: ["dumbbells", "barbell", "kettlebell"], level: 2, loads: ["lower_back", "hip"], measure: "reps", weighted: true, swaps: ["glute_bridge", "back_extension"], cue: "Push hips back, soft knees, flat back." },
  { id: "kettlebell_swing", name: "Kettlebell swing", disciplines: ["cross", "athletic"], pattern: "hinge", equipment: ["kettlebell"], level: 2, loads: ["lower_back", "hip"], measure: "reps", weighted: true, swaps: ["glute_bridge", "romanian_deadlift"], cue: "Snap the hips; arms just guide the bell." },
  { id: "deadlift", name: "Barbell deadlift", disciplines: ["strength", "athletic"], pattern: "hinge", equipment: ["barbell"], level: 3, loads: ["lower_back", "hip"], measure: "reps", weighted: true, swaps: ["romanian_deadlift", "hip_thrust", "glute_bridge"], cue: "Bar over mid-foot, brace, push the floor away." },
  { id: "back_extension", name: "Back extension", disciplines: ["strength"], pattern: "hinge", equipment: ["machines"], level: 1, loads: ["lower_back"], measure: "reps", weighted: false, swaps: ["glute_bridge", "bird_dog"], cue: "Move from the hips, stop at a straight line." },
  // Lunge
  { id: "reverse_lunge", name: "Reverse lunge", disciplines: ALL_FIT, pattern: "lunge", equipment: [], level: 1, loads: ["knee", "hip"], measure: "reps", weighted: false, swaps: ["step_up", "glute_bridge"], cue: "Step back, both knees to 90 degrees." },
  { id: "split_squat", name: "Split squat", disciplines: ALL_FIT, pattern: "lunge", equipment: [], level: 1, loads: ["knee", "hip"], measure: "reps", weighted: false, swaps: ["step_up", "glute_bridge"], cue: "Stay tall, front heel down." },
  { id: "step_up", name: "Step-up", disciplines: ALL_FIT, pattern: "lunge", equipment: [], level: 1, loads: ["knee"], measure: "reps", weighted: false, swaps: ["glute_bridge"], cue: "Low step, push through the whole foot." },
  { id: "db_walking_lunge", name: "Dumbbell walking lunge", disciplines: S, pattern: "lunge", equipment: ["dumbbells"], level: 2, loads: ["knee", "hip"], measure: "reps", weighted: true, swaps: ["reverse_lunge", "step_up"], cue: "Long stride, control each step." },
  { id: "lateral_lunge", name: "Lateral lunge", disciplines: ["cross", "athletic"], pattern: "lunge", equipment: [], level: 2, loads: ["knee", "hip"], measure: "reps", weighted: false, swaps: ["reverse_lunge", "glute_bridge"], cue: "Sit into one hip, other leg straight." },
  // Push
  { id: "incline_pushup", name: "Incline push-up", disciplines: ALL_FIT, pattern: "push", equipment: [], level: 1, loads: ["shoulder", "wrist"], measure: "reps", weighted: false, swaps: ["band_chest_press", "db_floor_press"], cue: "Hands on a bench, body in one line." },
  { id: "pushup", name: "Push-up", disciplines: ALL_FIT, pattern: "push", equipment: [], level: 1, loads: ["shoulder", "wrist"], measure: "reps", weighted: false, swaps: ["incline_pushup", "db_floor_press"], cue: "Elbows about 45 degrees, chest to the floor." },
  { id: "db_floor_press", name: "Dumbbell floor press", disciplines: S, pattern: "push", equipment: ["dumbbells"], level: 1, loads: ["shoulder"], measure: "reps", weighted: true, swaps: ["band_chest_press"], cue: "Upper arms touch the floor, press up." },
  { id: "db_bench_press", name: "Dumbbell bench press", disciplines: S, pattern: "push", equipment: ["dumbbells"], level: 1, loads: ["shoulder"], measure: "reps", weighted: true, swaps: ["db_floor_press", "band_chest_press"], cue: "Shoulder blades back, controlled lower." },
  { id: "bench_press", name: "Barbell bench press", disciplines: ["strength", "athletic"], pattern: "push", equipment: ["barbell"], level: 2, loads: ["shoulder", "wrist"], measure: "reps", weighted: true, swaps: ["db_bench_press", "db_floor_press"], cue: "Feet planted, bar to lower chest." },
  { id: "db_shoulder_press", name: "Dumbbell shoulder press", disciplines: S, pattern: "push", equipment: ["dumbbells"], level: 2, loads: ["shoulder"], measure: "reps", weighted: true, swaps: ["band_chest_press", "incline_pushup"], cue: "Ribs down, press overhead without arching." },
  { id: "band_chest_press", name: "Band chest press", disciplines: ALL_FIT, pattern: "push", equipment: ["bands"], level: 1, loads: ["shoulder"], measure: "reps", weighted: false, swaps: [], cue: "Band behind back, press forward slowly." },
  // Pull
  { id: "band_row", name: "Band row", disciplines: ALL_FIT, pattern: "pull", equipment: ["bands"], level: 1, loads: ["shoulder"], measure: "reps", weighted: false, swaps: ["band_pull_apart"], cue: "Pull elbows back, squeeze shoulder blades." },
  { id: "db_row", name: "One-arm dumbbell row", disciplines: S, pattern: "pull", equipment: ["dumbbells"], level: 1, loads: ["shoulder"], measure: "reps", weighted: true, swaps: ["band_row", "seated_row"], cue: "Hand on bench, flat back, elbow to hip." },
  { id: "seated_row", name: "Seated cable row", disciplines: S, pattern: "pull", equipment: ["machines"], level: 1, loads: ["shoulder"], measure: "reps", weighted: true, swaps: ["band_row"], cue: "Sit tall, pull to the belly button." },
  { id: "lat_pulldown", name: "Lat pulldown", disciplines: S, pattern: "pull", equipment: ["machines"], level: 1, loads: ["shoulder"], measure: "reps", weighted: true, swaps: ["band_row", "seated_row"], cue: "Bar to upper chest, elbows down." },
  { id: "inverted_row", name: "Inverted row", disciplines: S, pattern: "pull", equipment: ["pullup_bar"], level: 2, loads: ["shoulder"], measure: "reps", weighted: false, swaps: ["band_row"], cue: "Body straight, chest to the bar." },
  { id: "pullup", name: "Pull-up", disciplines: ["strength", "cross", "athletic"], pattern: "pull", equipment: ["pullup_bar"], level: 3, loads: ["shoulder"], measure: "reps", weighted: false, swaps: ["inverted_row", "lat_pulldown", "band_row"], cue: "Full hang, chin over the bar." },
  { id: "band_pull_apart", name: "Band pull-apart", disciplines: ALL_FIT, pattern: "pull", equipment: ["bands"], level: 1, loads: [], measure: "reps", weighted: false, swaps: [], cue: "Straight arms, pull the band to your chest." },
  // Core
  { id: "dead_bug", name: "Dead bug", disciplines: [...ALL_FIT, "yoga", "pilates"], pattern: "core", equipment: [], level: 1, loads: [], measure: "reps", weighted: false, swaps: ["breathing"], cue: "Lower back stays pressed down." },
  { id: "bird_dog", name: "Bird dog", disciplines: [...ALL_FIT, "yoga", "pilates"], pattern: "core", equipment: [], level: 1, loads: ["wrist"], measure: "reps", weighted: false, swaps: ["dead_bug"], cue: "Reach long, hips stay level." },
  { id: "plank", name: "Plank", disciplines: [...ALL_FIT, "pilates"], pattern: "core", equipment: [], level: 1, loads: ["shoulder", "wrist"], measure: "time", weighted: false, swaps: ["dead_bug"], cue: "Squeeze glutes, ribs down, breathe." },
  { id: "side_plank", name: "Side plank", disciplines: [...ALL_FIT, "pilates"], pattern: "core", equipment: [], level: 1, loads: ["shoulder"], measure: "time", weighted: false, swaps: ["dead_bug"], cue: "Hips high, body in one line." },
  { id: "pallof_press", name: "Pallof press", disciplines: ALL_FIT, pattern: "core", equipment: ["bands"], level: 1, loads: [], measure: "reps", weighted: false, swaps: ["dead_bug"], cue: "Resist the twist, press out and back." },
  { id: "hollow_hold", name: "Hollow hold", disciplines: ["cross", "athletic"], pattern: "core", equipment: [], level: 2, loads: ["lower_back"], measure: "time", weighted: false, swaps: ["dead_bug"], cue: "Lower back down, arms and legs long." },
  { id: "mountain_climber", name: "Mountain climber", disciplines: ["cross", "athletic"], pattern: "core", equipment: [], level: 2, loads: ["wrist", "shoulder"], measure: "time", weighted: false, swaps: ["dead_bug"], cue: "Hips low, drive the knees." },
  // Plyo / athletic
  { id: "pogo_hops", name: "Pogo hops", disciplines: ["athletic", "cross"], pattern: "plyo", equipment: [], level: 1, loads: ["ankle"], measure: "reps", weighted: false, swaps: ["glute_bridge"], cue: "Quick, springy, stiff ankles." },
  { id: "jump_squat", name: "Jump squat", disciplines: ["athletic", "cross"], pattern: "plyo", equipment: [], level: 2, loads: ["knee", "ankle"], measure: "reps", weighted: false, swaps: ["bodyweight_squat", "glute_bridge"], cue: "Land soft and quiet." },
  { id: "broad_jump", name: "Broad jump", disciplines: ["athletic"], pattern: "plyo", equipment: [], level: 2, loads: ["knee", "ankle"], measure: "reps", weighted: false, swaps: ["glute_bridge"], cue: "Swing the arms, stick the landing." },
  { id: "skater_jump", name: "Skater jump", disciplines: ["athletic", "cross"], pattern: "plyo", equipment: [], level: 2, loads: ["knee", "ankle"], measure: "reps", weighted: false, swaps: ["lateral_lunge", "glute_bridge"], cue: "Side to side, balance each landing." },
  { id: "burpee", name: "Burpee", disciplines: ["cross"], pattern: "plyo", equipment: [], level: 2, loads: ["wrist", "knee", "shoulder"], measure: "reps", weighted: false, swaps: ["bodyweight_squat", "jumping_jack"], cue: "Smooth, not rushed." },
  // Cardio and intervals
  { id: "brisk_walk", name: "Brisk walk", disciplines: ["endurance", "cross", "yoga"], pattern: "cardio", equipment: [], level: 1, loads: [], measure: "time", weighted: false, swaps: [], cue: "Fast enough to talk in short sentences." },
  { id: "easy_run", name: "Easy run", disciplines: ["endurance", "athletic"], pattern: "cardio", equipment: [], level: 1, loads: ["knee", "ankle"], measure: "time", weighted: false, swaps: ["bike_easy", "brisk_walk", "swim_easy"], cue: "Conversational pace." },
  { id: "bike_easy", name: "Easy bike", disciplines: ["endurance", "cross"], pattern: "cardio", equipment: ["cardio_machine"], level: 1, loads: [], measure: "time", weighted: false, swaps: ["brisk_walk"], cue: "Steady, smooth pedalling." },
  { id: "row_easy", name: "Easy row", disciplines: ["endurance", "cross"], pattern: "cardio", equipment: ["cardio_machine"], level: 1, loads: ["lower_back"], measure: "time", weighted: false, swaps: ["bike_easy", "brisk_walk"], cue: "Legs, then body, then arms." },
  { id: "swim_easy", name: "Easy swim", disciplines: ["endurance"], pattern: "cardio", equipment: ["pool"], level: 1, loads: ["shoulder"], measure: "time", weighted: false, swaps: ["bike_easy", "brisk_walk"], cue: "Relaxed, long strokes." },
  { id: "jumping_jack", name: "Jumping jacks", disciplines: ["cross"], pattern: "intervals", equipment: [], level: 1, loads: ["ankle"], measure: "time", weighted: false, swaps: ["brisk_walk"], cue: "Light on the feet." },
  { id: "run_intervals", name: "Run intervals", disciplines: ["endurance", "athletic"], pattern: "intervals", equipment: [], level: 2, loads: ["knee", "ankle"], measure: "time", weighted: false, swaps: ["bike_intervals", "swim_intervals", "brisk_walk"], cue: "Hard but controlled, recover fully." },
  { id: "bike_intervals", name: "Bike intervals", disciplines: ["endurance", "cross", "athletic"], pattern: "intervals", equipment: ["cardio_machine"], level: 2, loads: [], measure: "time", weighted: false, swaps: ["bike_easy"], cue: "Push the work, spin easy in rest." },
  { id: "swim_intervals", name: "Swim intervals", disciplines: ["endurance"], pattern: "intervals", equipment: ["pool"], level: 2, loads: ["shoulder"], measure: "time", weighted: false, swaps: ["bike_intervals", "swim_easy"], cue: "Strong strokes, full rest at the wall." },
  { id: "shuttle_runs", name: "Shuttle runs", disciplines: ["athletic"], pattern: "intervals", equipment: [], level: 2, loads: ["knee", "ankle"], measure: "time", weighted: false, swaps: ["bike_intervals", "pogo_hops"], cue: "Low and quick at each turn." },
  // Carry
  { id: "farmer_carry", name: "Farmer carry", disciplines: ["strength", "cross", "athletic"], pattern: "carry", equipment: ["dumbbells", "kettlebell"], level: 1, loads: [], measure: "time", weighted: true, swaps: ["plank"], cue: "Tall, shoulders down, slow steps." },
  // Yoga and mobility (held for time)
  { id: "sun_salutation", name: "Sun salutation", disciplines: ["yoga"], pattern: "flow", equipment: [], level: 1, loads: ["wrist", "shoulder"], measure: "time", weighted: false, swaps: ["cat_cow", "breathing"], cue: "One breath, one movement." },
  { id: "cat_cow", name: "Cat-cow", disciplines: ["yoga", "strength", "endurance", "pilates"], pattern: "spine", equipment: [], level: 1, loads: ["wrist"], measure: "time", weighted: false, swaps: ["supine_twist", "breathing"], cue: "Slow, move with the breath." },
  { id: "downward_dog", name: "Downward dog", disciplines: ["yoga"], pattern: "flow", equipment: [], level: 1, loads: ["wrist", "shoulder"], measure: "time", weighted: false, swaps: ["childs_pose", "cat_cow"], cue: "Long spine, knees soft if needed." },
  { id: "warrior_two", name: "Warrior II", disciplines: ["yoga"], pattern: "standing", equipment: [], level: 1, loads: ["knee", "hip"], measure: "time", weighted: false, swaps: ["tree_pose", "breathing"], cue: "Front knee over ankle, arms long." },
  { id: "chair_pose", name: "Chair pose", disciplines: ["yoga"], pattern: "standing", equipment: [], level: 1, loads: ["knee"], measure: "time", weighted: false, swaps: ["tree_pose"], cue: "Sit back, arms up, breathe." },
  { id: "tree_pose", name: "Tree pose", disciplines: ["yoga", "athletic", "pilates"], pattern: "balance", equipment: [], level: 1, loads: ["ankle"], measure: "time", weighted: false, swaps: ["breathing"], cue: "Foot to calf or thigh, never the knee." },
  { id: "low_lunge", name: "Low lunge", disciplines: ["yoga", "endurance", "athletic"], pattern: "hips", equipment: [], level: 1, loads: ["knee", "hip"], measure: "time", weighted: false, swaps: ["reclined_butterfly", "supine_twist"], cue: "Pad the back knee, hips forward." },
  { id: "pigeon_pose", name: "Pigeon pose", disciplines: ["yoga"], pattern: "hips", equipment: [], level: 2, loads: ["knee", "hip"], measure: "time", weighted: false, swaps: ["reclined_butterfly", "supine_twist"], cue: "Back off if the knee complains." },
  { id: "reclined_butterfly", name: "Reclined butterfly", disciplines: ["yoga"], pattern: "hips", equipment: [], level: 1, loads: [], measure: "time", weighted: false, swaps: ["breathing"], cue: "Soles together, let the knees fall." },
  { id: "supine_twist", name: "Supine twist", disciplines: ["yoga", "endurance", "strength", "pilates"], pattern: "spine", equipment: [], level: 1, loads: [], measure: "time", weighted: false, swaps: ["breathing"], cue: "Shoulders stay down, gentle twist." },
  { id: "seated_fold", name: "Seated forward fold", disciplines: ["yoga"], pattern: "spine", equipment: [], level: 1, loads: ["lower_back"], measure: "time", weighted: false, swaps: ["supine_twist"], cue: "Hinge from the hips, knees soft." },
  { id: "thread_the_needle", name: "Thread the needle", disciplines: ["yoga"], pattern: "spine", equipment: [], level: 1, loads: ["shoulder"], measure: "time", weighted: false, swaps: ["supine_twist"], cue: "Slide the arm under, rest the shoulder." },
  { id: "childs_pose", name: "Child's pose", disciplines: ["yoga"], pattern: "rest_pose", equipment: [], level: 1, loads: ["knee"], measure: "time", weighted: false, swaps: ["legs_up_wall", "breathing"], cue: "Knees wide, sink the hips back." },
  { id: "legs_up_wall", name: "Legs up the wall", disciplines: ["yoga", "endurance"], pattern: "rest_pose", equipment: [], level: 1, loads: [], measure: "time", weighted: false, swaps: ["breathing"], cue: "Rest and breathe slowly." },
  { id: "breathing", name: "Slow breathing", disciplines: ["yoga", "endurance", "strength", "cross", "athletic", "pilates"], pattern: "rest_pose", equipment: [], level: 1, loads: [], measure: "time", weighted: false, swaps: [], cue: "In for 4, out for 6." },
  // Pilates mat (DRAFT — physiologist to review loads and levels)
  { id: "pelvic_curl", name: "Pelvic curl", disciplines: ["pilates"], pattern: "hinge", equipment: [], level: 1, loads: [], measure: "reps", weighted: false, swaps: ["dead_bug", "breathing"], cue: "Peel the spine up one bone at a time, then roll down slowly." },
  { id: "shoulder_bridge", name: "Single-leg shoulder bridge", disciplines: ["pilates"], pattern: "hinge", equipment: [], level: 2, loads: ["hip"], measure: "reps", weighted: false, swaps: ["pelvic_curl", "glute_bridge"], cue: "Hips stay level as the leg lifts." },
  { id: "pilates_hundred", name: "The Hundred", disciplines: ["pilates"], pattern: "core", equipment: [], level: 1, loads: ["neck"], measure: "time", weighted: false, swaps: ["dead_bug"], cue: "Pump the arms, breathe in for 5, out for 5. Head down if the neck strains." },
  { id: "single_leg_stretch", name: "Single-leg stretch", disciplines: ["pilates"], pattern: "core", equipment: [], level: 1, loads: ["neck"], measure: "reps", weighted: false, swaps: ["dead_bug"], cue: "Lower back stays down as the legs switch." },
  { id: "double_leg_stretch", name: "Double-leg stretch", disciplines: ["pilates"], pattern: "core", equipment: [], level: 2, loads: ["neck", "lower_back"], measure: "reps", weighted: false, swaps: ["single_leg_stretch", "dead_bug"], cue: "Reach long, circle back in. Legs higher if the back lifts." },
  { id: "criss_cross", name: "Criss-cross", disciplines: ["pilates"], pattern: "core", equipment: [], level: 2, loads: ["neck"], measure: "reps", weighted: false, swaps: ["dead_bug", "single_leg_stretch"], cue: "Rotate from the ribs, not the elbows." },
  { id: "teaser", name: "Teaser", disciplines: ["pilates"], pattern: "core", equipment: [], level: 3, loads: ["lower_back"], measure: "reps", weighted: false, swaps: ["double_leg_stretch", "dead_bug"], cue: "Roll up to balance on the sit bones, roll down with control." },
  { id: "roll_up", name: "Roll-up", disciplines: ["pilates"], pattern: "spine", equipment: [], level: 2, loads: ["lower_back", "neck"], measure: "reps", weighted: false, swaps: ["spine_stretch", "cat_cow"], cue: "Slow and even, no jerking up." },
  { id: "spine_stretch", name: "Spine stretch forward", disciplines: ["pilates"], pattern: "spine", equipment: [], level: 1, loads: [], measure: "reps", weighted: false, swaps: ["cat_cow", "breathing"], cue: "Sit tall, curl forward like over a ball, stack back up." },
  { id: "pilates_saw", name: "Saw", disciplines: ["pilates"], pattern: "spine", equipment: [], level: 2, loads: ["lower_back"], measure: "reps", weighted: false, swaps: ["spine_stretch", "supine_twist"], cue: "Twist, then reach the little finger past the little toe." },
  { id: "swan_prep", name: "Swan prep", disciplines: ["pilates"], pattern: "spine", equipment: [], level: 1, loads: ["lower_back"], measure: "reps", weighted: false, swaps: ["cat_cow", "bird_dog"], cue: "Lift the chest a little, long neck, belly drawn in." },
  { id: "pilates_swimming", name: "Swimming", disciplines: ["pilates"], pattern: "spine", equipment: [], level: 2, loads: ["lower_back", "neck"], measure: "time", weighted: false, swaps: ["bird_dog", "swan_prep"], cue: "Small quick flutters, reach long from the centre." },
  { id: "mermaid", name: "Mermaid side stretch", disciplines: ["pilates"], pattern: "spine", equipment: [], level: 1, loads: [], measure: "reps", weighted: false, swaps: ["breathing"], cue: "Reach up and over, both sit bones down." },
  { id: "leg_circles", name: "Single-leg circles", disciplines: ["pilates"], pattern: "hips", equipment: [], level: 1, loads: ["hip"], measure: "reps", weighted: false, swaps: ["clamshell", "breathing"], cue: "Small circles, pelvis stays still." },
  { id: "side_kick", name: "Side-lying leg lift", disciplines: ["pilates"], pattern: "hips", equipment: [], level: 1, loads: ["hip"], measure: "reps", weighted: false, swaps: ["clamshell"], cue: "Stack the hips, lift without rocking back." },
  { id: "clamshell", name: "Clamshell", disciplines: ["pilates", "strength", "endurance"], pattern: "hips", equipment: [], level: 1, loads: [], measure: "reps", weighted: false, swaps: ["breathing"], cue: "Heels together, open the top knee, hips still." },
];

export const EXERCISE_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export type Coach = {
  id: string;
  name: string;
  discipline: Discipline;
  title: string;
  personality: string;
  goodFor: string;
  photo: string;
  /** Which goals this coach offers in onboarding. */
  goals: Goal[];
  /** Session patterns by slot, rotated across the week. */
  dayTemplates: Pattern[][];
};

export const COACHES: Coach[] = [
  {
    id: "mara", name: "Mara", discipline: "yoga", title: "Yoga and mobility", personality: "Calm, warm, patient",
    goodFor: "Flexibility, stress, recovery", photo: "coach-mara.svg", goals: ["mobility", "fitness"],
    dayTemplates: [
      ["flow", "standing", "balance", "hips", "spine", "rest_pose"],
      ["spine", "flow", "standing", "core", "hips", "rest_pose"],
    ],
  },
  {
    id: "rex", name: "Rex", discipline: "strength", title: "Strength and gym", personality: "Direct, no fluff, numbers-driven",
    goodFor: "Building muscle and strength", photo: "coach-rex.svg", goals: ["strength", "muscle", "fat_loss"],
    dayTemplates: [
      ["squat", "push", "hinge", "pull", "core", "carry"],
      ["hinge", "pull", "lunge", "push", "core", "carry"],
    ],
  },
  {
    id: "jade", name: "Jade", discipline: "cross", title: "Cross training", personality: "High energy, playful",
    goodFor: "Fitness, fat loss, variety", photo: "coach-jade.svg", goals: ["fat_loss", "fitness", "muscle"],
    dayTemplates: [
      ["cardio", "squat", "push", "plyo", "pull", "core"],
      ["intervals", "lunge", "hinge", "core", "push", "carry"],
    ],
  },
  {
    id: "kip", name: "Kip", discipline: "endurance", title: "Endurance: run, ride, swim", personality: "Steady, data-minded",
    goodFor: "5 km to triathlon", photo: "coach-kip.svg", goals: ["endurance", "fitness"],
    dayTemplates: [
      ["cardio", "core", "hips", "spine"],
      ["intervals", "lunge", "hinge", "core"],
      ["cardio", "spine", "rest_pose"],
    ],
  },
  {
    id: "ivy", name: "Ivy", discipline: "pilates", title: "Pilates and core", personality: "Precise, encouraging, all about form",
    goodFor: "Core strength, posture, control", photo: "coach-ivy.svg", goals: ["fitness", "mobility"],
    dayTemplates: [
      ["core", "hinge", "spine", "hips", "core", "rest_pose"],
      ["spine", "core", "hips", "balance", "core", "rest_pose"],
    ],
  },
  {
    id: "ace", name: "Ace", discipline: "athletic", title: "Athletic performance", personality: "Competitive, sharp",
    goodFor: "Speed, power, sport", photo: "coach-ace.svg", goals: ["performance", "strength", "fitness"],
    dayTemplates: [
      ["plyo", "squat", "pull", "intervals", "core", "balance"],
      ["plyo", "hinge", "push", "lunge", "core", "carry"],
    ],
  },
];

export const COACH_BY_ID = new Map(COACHES.map((c) => [c.id, c]));
