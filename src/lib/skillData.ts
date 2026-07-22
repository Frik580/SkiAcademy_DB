export interface SkillItem {
  id: string;
  levelTarget: number; // 1 = Beginner->Carve (Level 1->2), 2 = Carve->Performance (Level 2->3), 3 = Performance->Expert (Level 3->4)
  section: string;
  num: string;
  title: string;
  maxPoints: number;
  controlPoints: number;
  speedPoints: number;
  techniquePoints: number;
}

export interface SkillConfig {
  passPercentage: number; // default 80
  items: SkillItem[];
}

export const DEFAULT_SKILL_ITEMS: SkillItem[] = [
  // --- Level 1 -> Level 2 (От Beginner к Carve) - Max 100 points ---
  { id: 'l1_1', levelTarget: 1, section: 'Баланс', num: '1', title: 'Удержать базовую стойку в движении 100 м', maxPoints: 3, controlPoints: 3, speedPoints: 0, techniquePoints: 0 },
  { id: 'l1_2', levelTarget: 1, section: 'Баланс', num: '2', title: 'Проехать 20 м на крутом склоне боковым соскальзыванием', maxPoints: 5, controlPoints: 3, speedPoints: 0, techniquePoints: 2 },
  { id: 'l1_3', levelTarget: 1, section: 'Контроль', num: '3', title: 'Контролируемое торможение плугом', maxPoints: 4, controlPoints: 2, speedPoints: 0, techniquePoints: 2 },
  { id: 'l1_4', levelTarget: 1, section: 'Контроль', num: '4', title: 'Хоккейная остановка', maxPoints: 5, controlPoints: 2, speedPoints: 0, techniquePoints: 3 },
  { id: 'l1_5', levelTarget: 1, section: 'Повороты', num: '5', title: '10 последовательных поворотов в плуге', maxPoints: 5, controlPoints: 1, speedPoints: 1, techniquePoints: 3 },
  { id: 'l1_6', levelTarget: 1, section: 'Повороты', num: '6', title: '10 последовательных поворотов на параллельных лыжах', maxPoints: 10, controlPoints: 2, speedPoints: 3, techniquePoints: 5 },
  { id: 'l1_7', levelTarget: 1, section: 'Координация', num: '7', title: 'Проехать на одной лыже 20 метров', maxPoints: 5, controlPoints: 4, speedPoints: 0, techniquePoints: 1 },
  { id: 'l1_8', levelTarget: 1, section: 'Координация', num: '8', title: 'Упражнение «джавилин»', maxPoints: 5, controlPoints: 3, speedPoints: 0, techniquePoints: 2 },
  { id: 'l1_9', levelTarget: 1, section: 'Техника', num: '9', title: 'Элемент «укол палкой»', maxPoints: 2, controlPoints: 0, speedPoints: 0, techniquePoints: 2 },
  { id: 'l1_10', levelTarget: 1, section: 'Техника', num: '10', title: 'Карвинговый поворот начального уровня', maxPoints: 5, controlPoints: 0, speedPoints: 0, techniquePoints: 5 },
  { id: 'l1_11', levelTarget: 1, section: 'Уверенность', num: '11', title: 'Спуск по синей трассе без остановок', maxPoints: 3, controlPoints: 0, speedPoints: 1, techniquePoints: 2 },
  { id: 'l1_12', levelTarget: 1, section: 'Уверенность', num: '12', title: 'Контроль скорости на всём спуске', maxPoints: 10, controlPoints: 8, speedPoints: 2, techniquePoints: 0 },
  { id: 'l1_13', levelTarget: 1, section: 'Финальный спуск', num: '13', title: 'Связанный спуск поворотами большого радиуса с уколом палкой', maxPoints: 25, controlPoints: 5, speedPoints: 5, techniquePoints: 15 },
  { id: 'l1_14', levelTarget: 1, section: 'Финальный спуск', num: '14', title: 'Правильная посадка на подъёмник', maxPoints: 3, controlPoints: 2, speedPoints: 0, techniquePoints: 1 },
  { id: 'l1_15', levelTarget: 1, section: 'Финальный спуск', num: '15', title: 'Элемент «снежинка»', maxPoints: 10, controlPoints: 2, speedPoints: 0, techniquePoints: 8 },

  // --- Level 2 -> Level 3 (От Carve к Performance) - Max 150 points ---
  { id: 'l2_1', levelTarget: 2, section: 'Техника', num: '1', title: 'Поворот малого радиуса с проскальзыванием', maxPoints: 10, controlPoints: 5, speedPoints: 0, techniquePoints: 5 },
  { id: 'l2_2', levelTarget: 2, section: 'Техника', num: '2', title: 'Карвинговый поворот большого радиуса', maxPoints: 15, controlPoints: 5, speedPoints: 5, techniquePoints: 5 },
  { id: 'l2_3', levelTarget: 2, section: 'Техника', num: '3', title: 'Карвинговый поворот малого радиуса', maxPoints: 20, controlPoints: 5, speedPoints: 5, techniquePoints: 10 },
  { id: 'l2_4', levelTarget: 2, section: 'Техника', num: '4', title: 'Элемент «дрифт»', maxPoints: 10, controlPoints: 4, speedPoints: 2, techniquePoints: 4 },
  { id: 'l2_5', levelTarget: 2, section: 'Скорость', num: '5', title: 'Контролировать скорость за счет поворотов', maxPoints: 7, controlPoints: 5, speedPoints: 0, techniquePoints: 2 },
  { id: 'l2_6', levelTarget: 2, section: 'Скорость', num: '6', title: 'Выполнить длинную серию дуг на скорости', maxPoints: 5, controlPoints: 1, speedPoints: 3, techniquePoints: 1 },
  { id: 'l2_7', levelTarget: 2, section: 'Скорость', num: '7', title: 'Стабильно держать внешний кант', maxPoints: 7, controlPoints: 2, speedPoints: 0, techniquePoints: 5 },
  { id: 'l2_8', levelTarget: 2, section: 'Работа ног и корпуса', num: '8', title: 'Правильная работа ног', maxPoints: 7, controlPoints: 0, speedPoints: 0, techniquePoints: 7 },
  { id: 'l2_9', levelTarget: 2, section: 'Работа ног и корпуса', num: '9', title: 'Правильное положение корпуса в поворотах большого радиуса', maxPoints: 7, controlPoints: 0, speedPoints: 0, techniquePoints: 7 },
  { id: 'l2_10', levelTarget: 2, section: 'Работа ног и корпуса', num: '10', title: 'Стабильный верх корпуса в поворотах малого радиуса', maxPoints: 7, controlPoints: 0, speedPoints: 0, techniquePoints: 7 },
  { id: 'l2_11', levelTarget: 2, section: 'Баланс', num: '11', title: 'Проехать участок на одной лыже', maxPoints: 10, controlPoints: 5, speedPoints: 0, techniquePoints: 5 },
  { id: 'l2_12', levelTarget: 2, section: 'Баланс', num: '12', title: 'Выполнить серию поворотов спиной вперед', maxPoints: 10, controlPoints: 5, speedPoints: 0, techniquePoints: 5 },
  { id: 'l2_13', levelTarget: 2, section: 'Баланс', num: '13', title: 'Проехать зип лайн', maxPoints: 15, controlPoints: 5, speedPoints: 0, techniquePoints: 10 },
  { id: 'l2_14', levelTarget: 2, section: 'Финальный спуск', num: '14', title: 'Спуск по красной/черной трассе', maxPoints: 20, controlPoints: 5, speedPoints: 5, techniquePoints: 10 },

  // --- Level 3 -> Level 4 (От Performance к Expert) - Max 250 points ---
  { id: 'l3_1', levelTarget: 3, section: 'Высокая скорость', num: '1', title: 'Чистый карвинг на высокой скорости', maxPoints: 12, controlPoints: 5, speedPoints: 7, techniquePoints: 0 },
  { id: 'l3_2', levelTarget: 3, section: 'Высокая скорость', num: '2', title: 'Контроль положения корпуса (центра масс)', maxPoints: 10, controlPoints: 4, speedPoints: 2, techniquePoints: 4 },
  { id: 'l3_3', levelTarget: 3, section: 'Высокая скорость', num: '3', title: 'Работа с большим углом закантовки', maxPoints: 10, controlPoints: 4, speedPoints: 2, techniquePoints: 4 },
  { id: 'l3_4', levelTarget: 3, section: 'Техника', num: '4', title: 'Короткие спортивные дуги', maxPoints: 20, controlPoints: 6, speedPoints: 6, techniquePoints: 8 },
  { id: 'l3_5', levelTarget: 3, section: 'Техника', num: '5', title: 'Длинные GS-дуги', maxPoints: 20, controlPoints: 6, speedPoints: 6, techniquePoints: 8 },
  { id: 'l3_6', levelTarget: 3, section: 'Техника', num: '6', title: 'Могульные повороты', maxPoints: 20, controlPoints: 8, speedPoints: 4, techniquePoints: 8 },
  { id: 'l3_7', levelTarget: 3, section: 'Техника', num: '7', title: 'Катание на коротких лыжах (UPS)', maxPoints: 10, controlPoints: 4, speedPoints: 2, techniquePoints: 4 },
  { id: 'l3_8', levelTarget: 3, section: 'Техника', num: '8', title: 'Изменение ритма поворотов', maxPoints: 10, controlPoints: 4, speedPoints: 2, techniquePoints: 4 },
  { id: 'l3_9', levelTarget: 3, section: 'Сложный склон', num: '7', title: 'Ледяной участок', maxPoints: 20, controlPoints: 8, speedPoints: 4, techniquePoints: 8 },
  { id: 'l3_10', levelTarget: 3, section: 'Сложный склон', num: '8', title: 'Разбитая трасса', maxPoints: 10, controlPoints: 4, speedPoints: 2, techniquePoints: 4 },
  { id: 'l3_11', levelTarget: 3, section: 'Сложный склон', num: '9', title: 'Узкий коридор', maxPoints: 10, controlPoints: 4, speedPoints: 2, techniquePoints: 4 },
  { id: 'l3_12', levelTarget: 3, section: 'Сложный склон', num: '10', title: 'Глубокий снег', maxPoints: 20, controlPoints: 8, speedPoints: 4, techniquePoints: 8 },
  { id: 'l3_13', levelTarget: 3, section: 'Сложный склон', num: '11', title: 'Крутой склон', maxPoints: 20, controlPoints: 8, speedPoints: 4, techniquePoints: 8 },
  { id: 'l3_14', levelTarget: 3, section: 'Универсальность', num: '10', title: 'Переход между разными стилями катания', maxPoints: 15, controlPoints: 4, speedPoints: 3, techniquePoints: 8 },
  { id: 'l3_15', levelTarget: 3, section: 'Универсальность', num: '11', title: 'Синхронное катание «демо»', maxPoints: 15, controlPoints: 6, speedPoints: 3, techniquePoints: 6 },
  { id: 'l3_16', levelTarget: 3, section: 'Универсальность', num: '12.1', title: 'Поворот «Чарльстон»', maxPoints: 3, controlPoints: 1, speedPoints: 1, techniquePoints: 1 },
  { id: 'l3_17', levelTarget: 3, section: 'Универсальность', num: '12.2', title: 'Поворот «Флигент»', maxPoints: 3, controlPoints: 1, speedPoints: 1, techniquePoints: 1 },
  { id: 'l3_18', levelTarget: 3, section: 'Универсальность', num: '12.3', title: 'Шведский поворот', maxPoints: 3, controlPoints: 1, speedPoints: 1, techniquePoints: 1 },
  { id: 'l3_19', levelTarget: 3, section: 'Универсальность', num: '12.4', title: 'Поворот «Дельфин»', maxPoints: 3, controlPoints: 1, speedPoints: 1, techniquePoints: 1 },
  { id: 'l3_20', levelTarget: 3, section: 'Универсальность', num: '12.5', title: 'Поворот «Противовес»', maxPoints: 3, controlPoints: 1, speedPoints: 1, techniquePoints: 1 },
  { id: 'l3_21', levelTarget: 3, section: 'Универсальность', num: '12.6', title: 'Поворот «Кламмер»', maxPoints: 3, controlPoints: 1, speedPoints: 1, techniquePoints: 1 },
  { id: 'l3_22', levelTarget: 3, section: 'Универсальность', num: '13', title: 'Контроль после прыжка', maxPoints: 10, controlPoints: 10, speedPoints: 0, techniquePoints: 0 },
];

export const DEFAULT_SKILL_CONFIG: SkillConfig = {
  passPercentage: 80,
  items: DEFAULT_SKILL_ITEMS,
};

/**
 * Calculates student level based on scores and threshold pass percentage.
 */
export function calculateStudentLevel(
  skillScores: Record<string, number> = {},
  items: SkillItem[] = DEFAULT_SKILL_ITEMS,
  passPercentage: number = 80
): number {
  const pct = passPercentage / 100;

  // Level 1 -> Level 2 check (target level 1 items)
  const l1Items = items.filter(i => i.levelTarget === 1);
  const l1Max = l1Items.reduce((acc, i) => acc + i.maxPoints, 0);
  const l1Earned = l1Items.reduce((acc, i) => acc + (skillScores[i.id] || 0), 0);
  const l1Passed = l1Max > 0 ? (l1Earned >= l1Max * pct) : true;

  if (!l1Passed) return 1;

  // Level 2 -> Level 3 check (target level 2 items)
  const l2Items = items.filter(i => i.levelTarget === 2);
  const l2Max = l2Items.reduce((acc, i) => acc + i.maxPoints, 0);
  const l2Earned = l2Items.reduce((acc, i) => acc + (skillScores[i.id] || 0), 0);
  const l2Passed = l2Max > 0 ? (l2Earned >= l2Max * pct) : true;

  if (!l2Passed) return 2;

  // Level 3 -> Level 4 check (target level 3 items)
  const l3Items = items.filter(i => i.levelTarget === 3);
  const l3Max = l3Items.reduce((acc, i) => acc + i.maxPoints, 0);
  const l3Earned = l3Items.reduce((acc, i) => acc + (skillScores[i.id] || 0), 0);
  const l3Passed = l3Max > 0 ? (l3Earned >= l3Max * pct) : true;

  if (!l3Passed) return 3;

  return 4; // Expert
}

/**
 * Calculates progress for the client cabinet breakdown (overall, control, speed, technique).
 */
export function calculateSkillProgress(
  skillScores: Record<string, number> = {},
  items: SkillItem[] = DEFAULT_SKILL_ITEMS,
  currentLevel: number = 1,
  passPercentage: number = 80
) {
  const targetLevelTarget = currentLevel >= 4 ? 3 : Math.min(3, Math.max(1, currentLevel));
  const targetItems = items.filter(i => i.levelTarget === targetLevelTarget);

  const targetMaxPoints = targetItems.reduce((acc, i) => acc + i.maxPoints, 0);
  const targetEarnedPoints = targetItems.reduce((acc, i) => acc + (skillScores[i.id] || 0), 0);
  const requiredPercentage = passPercentage / 100;
  const targetRequiredPoints = Math.round(targetMaxPoints * requiredPercentage);
  const remainingPointsNeeded = Math.max(0, targetRequiredPoints - targetEarnedPoints);

  // Overall calculations across all items in all tables
  let totalControlMax = 0;
  let totalSpeedMax = 0;
  let totalTechniqueMax = 0;
  let totalEarnedControl = 0;
  let totalEarnedSpeed = 0;
  let totalEarnedTechnique = 0;

  items.forEach(item => {
    totalControlMax += item.controlPoints;
    totalSpeedMax += item.speedPoints;
    totalTechniqueMax += item.techniquePoints;

    const earned = skillScores[item.id] || 0;
    const ratio = item.maxPoints > 0 ? Math.min(1, Math.max(0, earned / item.maxPoints)) : 0;

    totalEarnedControl += Math.round(ratio * item.controlPoints * 10) / 10;
    totalEarnedSpeed += Math.round(ratio * item.speedPoints * 10) / 10;
    totalEarnedTechnique += Math.round(ratio * item.techniquePoints * 10) / 10;
  });

  const grandMaxPoints = items.reduce((acc, i) => acc + i.maxPoints, 0);
  const grandEarnedPoints = items.reduce((acc, i) => acc + (skillScores[i.id] || 0), 0);

  return {
    targetLevelTarget,
    targetItems,
    targetMaxPoints,
    targetEarnedPoints,
    targetRequiredPoints,
    remainingPointsNeeded,
    passPercentage,
    control: {
      earned: Math.round(totalEarnedControl),
      max: totalControlMax || 183,
      percentage: totalControlMax > 0 ? Math.min(100, Math.round((totalEarnedControl / totalControlMax) * 100)) : 0,
    },
    speed: {
      earned: Math.round(totalEarnedSpeed),
      max: totalSpeedMax || 91,
      percentage: totalSpeedMax > 0 ? Math.min(100, Math.round((totalEarnedSpeed / totalSpeedMax) * 100)) : 0,
    },
    technique: {
      earned: Math.round(totalEarnedTechnique),
      max: totalTechniqueMax || 226,
      percentage: totalTechniqueMax > 0 ? Math.min(100, Math.round((totalEarnedTechnique / totalTechniqueMax) * 100)) : 0,
    },
    overall: {
      earned: grandEarnedPoints,
      max: grandMaxPoints || 500,
      percentage: grandMaxPoints > 0 ? Math.min(100, Math.round((grandEarnedPoints / grandMaxPoints) * 100)) : 0,
    }
  };
}
