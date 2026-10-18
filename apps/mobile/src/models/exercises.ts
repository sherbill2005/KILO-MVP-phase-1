export interface ExerciseDefinition {
  name: string;
  slug: string;
  primaryMuscle: 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core';
  secondaryMuscles?: string[];
  aliases?: string[];
}

export const CANONICAL_EXERCISES: ExerciseDefinition[] = [
  { name: 'Bench Press', slug: 'bench-press', primaryMuscle: 'Chest', aliases: ['flat bench', 'barbell bench', 'bench'] },
  { name: 'Incline Bench Press', slug: 'incline-bench-press', primaryMuscle: 'Chest', aliases: ['incline bench', 'incline press'] },
  { name: 'Decline Bench Press', slug: 'decline-bench-press', primaryMuscle: 'Chest', aliases: ['decline bench'] },
  { name: 'Deadlift', slug: 'deadlift', primaryMuscle: 'Back', aliases: ['conventional deadlift', 'dead lift'] },
  { name: 'Romanian Deadlift', slug: 'romanian-deadlift', primaryMuscle: 'Legs', aliases: ['rdl', 'stiff leg deadlift'] },
  { name: 'Squat', slug: 'squat', primaryMuscle: 'Legs', aliases: ['back squat', 'barbell squat'] },
  { name: 'Front Squat', slug: 'front-squat', primaryMuscle: 'Legs', aliases: ['front squats'] },
  { name: 'Overhead Press', slug: 'overhead-press', primaryMuscle: 'Shoulders', aliases: ['ohp', 'military press'] },
  { name: 'Shoulder Press', slug: 'shoulder-press', primaryMuscle: 'Shoulders', aliases: ['dumbbell shoulder press', 'dumbbell press'] },
  { name: 'Lat Pulldown', slug: 'lat-pulldown', primaryMuscle: 'Back', aliases: ['lat pull down', 'pulldown'] },
  { name: 'Pull Up', slug: 'pull-up', primaryMuscle: 'Back', aliases: ['pullups', 'pull ups'] },
  { name: 'Chin Up', slug: 'chin-up', primaryMuscle: 'Back', aliases: ['chinups', 'chin ups'] },
  { name: 'Barbell Row', slug: 'barbell-row', primaryMuscle: 'Back', aliases: ['bent over row', 'pendlay row'] },
  { name: 'Dumbbell Row', slug: 'dumbbell-row', primaryMuscle: 'Back', aliases: ['single arm row', 'db row'] },
  { name: 'Seated Row', slug: 'seated-row', primaryMuscle: 'Back', aliases: ['cable row', 'seated cable row'] },
  { name: 'Bicep Curl', slug: 'bicep-curl', primaryMuscle: 'Arms', aliases: ['bicep curls', 'barbell curl', 'dumbbell curl'] },
  { name: 'Hammer Curl', slug: 'hammer-curl', primaryMuscle: 'Arms', aliases: ['hammer curls'] },
  { name: 'Tricep Pushdown', slug: 'tricep-pushdown', primaryMuscle: 'Arms', aliases: ['tricep extension', 'rope pushdown'] },
  { name: 'Skull Crusher', slug: 'skull-crusher', primaryMuscle: 'Arms', aliases: ['skull crushers', 'lying tricep extension'] },
  { name: 'Leg Press', slug: 'leg-press', primaryMuscle: 'Legs', aliases: ['leg press machine'] },
  { name: 'Leg Extension', slug: 'leg-extension', primaryMuscle: 'Legs', aliases: ['quad extension'] },
  { name: 'Leg Curl', slug: 'leg-curl', primaryMuscle: 'Legs', aliases: ['hamstring curl', 'lying leg curl'] },
  { name: 'Calf Raise', slug: 'calf-raise', primaryMuscle: 'Legs', aliases: ['standing calf raise', 'seated calf raise'] },
  { name: 'Hip Thrust', slug: 'hip-thrust', primaryMuscle: 'Legs', aliases: ['barbell hip thrust', 'glute thrust'] },
  { name: 'Glute Bridge', slug: 'glute-bridge', primaryMuscle: 'Legs', aliases: ['bridges'] },
  { name: 'Lunge', slug: 'lunge', primaryMuscle: 'Legs', aliases: ['walking lunges', 'lunges'] },
  { name: 'Split Squat', slug: 'split-squat', primaryMuscle: 'Legs', aliases: ['bulgarian split squat', 'bulgarian squat'] },
  { name: 'Pec Deck', slug: 'pec-deck', primaryMuscle: 'Chest', aliases: ['pec fly', 'machine fly', 'chest fly'] },
  { name: 'Cable Fly', slug: 'cable-fly', primaryMuscle: 'Chest', aliases: ['cable crossover', 'cable flies'] },
  { name: 'Lateral Raise', slug: 'lateral-raise', primaryMuscle: 'Shoulders', aliases: ['side raise', 'lateral raises', 'side lateral'] },
  { name: 'Face Pull', slug: 'face-pull', primaryMuscle: 'Shoulders', aliases: ['face pulls', 'cable face pull'] },
  { name: 'Z Press', slug: 'z-press', primaryMuscle: 'Shoulders', aliases: ['seated overhead z press'] },
];

export const EXERCISE_NAMES = CANONICAL_EXERCISES.map(e => e.name);
