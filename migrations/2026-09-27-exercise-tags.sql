-- Adds muscle group and equipment to the exercise library, for the Planner's
-- filters. schema.sql creates these columns on a fresh database; this file is
-- for the live one, which predates them. Applied to live D1 on 27 Sep 2026.
-- ALTER TABLE is not idempotent, so this runs ONCE — deploy.sh does not run it.
--
-- muscle:    Chest | Back | Shoulders | Biceps | Triceps | Legs | Core | Full body
-- equipment: barbell | dumbbell | band | bodyweight | kettlebell | other

ALTER TABLE exercises ADD COLUMN muscle TEXT;
ALTER TABLE exercises ADD COLUMN equipment TEXT;

UPDATE exercises SET muscle = CASE name
  WHEN '21 Matrix Curls' THEN 'Biceps'
  WHEN 'Band Face Pull' THEN 'Shoulders'
  WHEN 'Banded Lat Pulldown' THEN 'Back'
  WHEN 'Banded Straight-Arm Pulldown' THEN 'Back'
  WHEN 'Barbell Back Squat' THEN 'Legs'
  WHEN 'Barbell Bench Press' THEN 'Chest'
  WHEN 'Barbell Bent Over Row' THEN 'Back'
  WHEN 'Barbell Bicep Curl' THEN 'Biceps'
  WHEN 'Barbell Deadlift' THEN 'Legs'
  WHEN 'Barbell Floor Glute Bridge' THEN 'Legs'
  WHEN 'Barbell Forward Lunge' THEN 'Legs'
  WHEN 'Barbell Front Racked Lunge' THEN 'Legs'
  WHEN 'Barbell Hip Thrust' THEN 'Legs'
  WHEN 'Barbell Incline Bench Press' THEN 'Chest'
  WHEN 'Barbell Overhead Press' THEN 'Shoulders'
  WHEN 'Barbell Reverse Lunge' THEN 'Legs'
  WHEN 'Barbell Romanian Deadlift' THEN 'Legs'
  WHEN 'Barbell Seated Shoulder Press' THEN 'Shoulders'
  WHEN 'Barbell Upright Row' THEN 'Shoulders'
  WHEN 'Chest Supported Rear Delt Fly' THEN 'Shoulders'
  WHEN 'Curl Up Crunch' THEN 'Core'
  WHEN 'DB Curl' THEN 'Biceps'
  WHEN 'DB Lateral Raise' THEN 'Shoulders'
  WHEN 'DB Skull Crusher' THEN 'Triceps'
  WHEN 'Diamond Push Up' THEN 'Triceps'
  WHEN 'Dumbbell Bent Over Row' THEN 'Back'
  WHEN 'Dumbbell Bulgarian Split Squat' THEN 'Legs'
  WHEN 'Dumbbell Deadlift' THEN 'Legs'
  WHEN 'Dumbbell Flat Bench Chest Fly' THEN 'Chest'
  WHEN 'Dumbbell Forward Lunge' THEN 'Legs'
  WHEN 'Dumbbell Incline Bicep Curl' THEN 'Biceps'
  WHEN 'Dumbbell Pullover' THEN 'Back'
  WHEN 'Dumbbell Romanian Deadlift' THEN 'Legs'
  WHEN 'Dumbbell Seated Arnold Press' THEN 'Shoulders'
  WHEN 'Dumbbell Seated Overhead Tricep Extension' THEN 'Triceps'
  WHEN 'Dumbbell Seated Shoulder Press' THEN 'Shoulders'
  WHEN 'Dumbbell Standing Back Fly' THEN 'Shoulders'
  WHEN 'Dumbbell Standing Shoulder Press' THEN 'Shoulders'
  WHEN 'Elbow Side Plank' THEN 'Core'
  WHEN 'Flat DB Bench Press' THEN 'Chest'
  WHEN 'Hammer Curl' THEN 'Biceps'
  WHEN 'Incline DB Flye' THEN 'Chest'
  WHEN 'Incline DB Press' THEN 'Chest'
  WHEN 'Kettlebell Goblet Squat' THEN 'Legs'
  WHEN 'Kettlebell Single Arm Row' THEN 'Back'
  WHEN 'Kettlebell Split Squat' THEN 'Legs'
  WHEN 'Kettlebell Swing' THEN 'Full body'
  WHEN 'Leaning DB Lateral Raise' THEN 'Shoulders'
  WHEN 'Lying T-Bar Row' THEN 'Back'
  WHEN 'Power Clean' THEN 'Full body'
  WHEN 'Rear Delt Flye' THEN 'Shoulders'
  WHEN 'Rotator cuff 90 deg external rotation' THEN 'Shoulders'
  WHEN 'Scaption with DB' THEN 'Shoulders'
  WHEN 'Single-Arm DB Row' THEN 'Back'
  WHEN 'Skull Crusher' THEN 'Triceps'
  WHEN 'Snatch Grip Behind Head Press' THEN 'Shoulders'
  WHEN 'Stability Ball Hamstring Curl with Glute Bridge' THEN 'Legs'
  WHEN 'Standing shoulder extension' THEN 'Shoulders'
  WHEN 'Svend Press' THEN 'Chest'
  WHEN 'Underhand barbell row' THEN 'Back'
  WHEN 'Underhand Grip Lat Pulldown' THEN 'Back'
  WHEN 'Worlds Greatest Stretch' THEN 'Full body'
  WHEN 'Zottman Curl' THEN 'Biceps'
  ELSE muscle END;

UPDATE exercises SET equipment = CASE
  WHEN name IN ('Band Face Pull','Banded Lat Pulldown','Banded Straight-Arm Pulldown') THEN 'band'
  WHEN name IN ('Curl Up Crunch','Diamond Push Up','Elbow Side Plank','Worlds Greatest Stretch',
                'Stability Ball Hamstring Curl with Glute Bridge') THEN 'bodyweight'
  WHEN name LIKE 'Kettlebell %' THEN 'kettlebell'
  WHEN name IN ('Lying T-Bar Row','Underhand Grip Lat Pulldown','Svend Press') THEN 'other'
  WHEN name LIKE 'Barbell %' OR name IN ('Skull Crusher','Power Clean','Snatch Grip Behind Head Press',
                'Underhand barbell row') THEN 'barbell'
  ELSE 'dumbbell' END
WHERE equipment IS NULL;
