import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useLanguage, type TranslationKey } from '../../lib/LanguageContext';
import {
  AchievementDefinition,
  AchievementRuleType,
  AchievementsConfig,
  DEFAULT_ACHIEVEMENTS_CONFIG,
  describeAchievementRule,
  normalizeAchievementsConfig,
} from '../../lib/achievementConfig';
import { DEFAULT_SKILL_CONFIG, SkillConfig } from '../../lib/skillData';

interface AchievementsManagerProps {
  config?: AchievementsConfig;
  skillConfig?: SkillConfig;
  onSaveConfig: (config: AchievementsConfig) => Promise<void>;
}

const RULE_TYPE_OPTIONS: AchievementRuleType[] = [
  'lessons_completed',
  'hours_completed',
  'streak_weeks',
  'exercises_mastered',
  'level_up',
  'feedback_given',
  'homework_done',
  'course_graduate',
  'skill_items_max',
];

const createEmptyAchievement = (order: number): AchievementDefinition => ({
  id: `ach_${Date.now()}`,
  labelRu: 'Новое достижение',
  labelEn: 'New achievement',
  icon: '🏆',
  order,
  rule: { type: 'skill_items_max', skillItemIds: [] },
});

export const AchievementsManager: React.FC<AchievementsManagerProps> = ({
  config = DEFAULT_ACHIEVEMENTS_CONFIG,
  skillConfig = DEFAULT_SKILL_CONFIG,
  onSaveConfig,
}) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const [items, setItems] = useState<AchievementDefinition[]>(
    normalizeAchievementsConfig(config).items
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setItems(normalizeAchievementsConfig(config).items);
  }, [config]);

  const skillItems = skillConfig.items ?? DEFAULT_SKILL_CONFIG.items;

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);

  const updateItem = (id: string, patch: Partial<AchievementDefinition>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const updateRule = (id: string, patch: Partial<AchievementDefinition['rule']>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, rule: { ...item.rule, ...patch } } : item))
    );
  };

  const toggleSkillItem = (achievementId: string, skillItemId: string, checked: boolean) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== achievementId) return item;
        const current = new Set(item.rule.skillItemIds ?? []);
        if (checked) current.add(skillItemId);
        else current.delete(skillItemId);
        return {
          ...item,
          rule: {
            ...item.rule,
            type: 'skill_items_max',
            skillItemIds: Array.from(current),
          },
        };
      })
    );
  };

  const handleAdd = () => {
    const nextOrder = items.reduce((max, item) => Math.max(max, item.order), 0) + 1;
    setItems((prev) => [...prev, createEmptyAchievement(nextOrder)]);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm(t('achievementsDeleteConfirm'))) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveConfig(normalizeAchievementsConfig({ items }));
    } finally {
      setIsSaving(false);
    }
  };

  const ruleTypeLabel = (type: AchievementRuleType) => t(`achRule_${type}` as TranslationKey);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--ink-dim)] max-w-2xl">{t('achievementsManagerSub')}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] text-xs font-mono uppercase tracking-wider hover:border-[var(--accent)]"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('achievementsAdd')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? t('saving') : t('saveChanges')}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {sortedItems.map((item) => (
          <div
            key={item.id}
            className="border border-[var(--border)] bg-black/5 dark:bg-white/5 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <input
                  value={item.icon}
                  onChange={(e) => updateItem(item.id, { icon: e.target.value })}
                  className="w-12 text-center bg-transparent border border-[var(--border)] px-1 py-1 text-lg"
                  aria-label={t('achievementsIconLabel')}
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-[var(--ink)] truncate">
                    {lang === 'ru' ? item.labelRu : item.labelEn}
                  </p>
                  <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                    {describeAchievementRule(item, skillItems, lang)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                className="p-2 text-[var(--ink-dim)] hover:text-red-500 transition"
                aria-label={t('deleteSlide')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                  {t('achievementsLabelRu')}
                </span>
                <input
                  value={item.labelRu}
                  onChange={(e) => updateItem(item.id, { labelRu: e.target.value })}
                  className="w-full border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                  {t('achievementsLabelEn')}
                </span>
                <input
                  value={item.labelEn}
                  onChange={(e) => updateItem(item.id, { labelEn: e.target.value })}
                  className="w-full border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                  {t('achievementsRuleType')}
                </span>
                <select
                  value={item.rule.type}
                  onChange={(e) =>
                    updateRule(item.id, {
                      type: e.target.value as AchievementRuleType,
                      count: undefined,
                      skillItemIds: [],
                    })
                  }
                  className="w-full border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
                >
                  {RULE_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {ruleTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                  {t('achievementsOrder')}
                </span>
                <input
                  type="number"
                  value={item.order}
                  onChange={(e) => updateItem(item.id, { order: Number(e.target.value) || 0 })}
                  className="w-full border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            {[
              'lessons_completed',
              'hours_completed',
              'streak_weeks',
              'exercises_mastered',
            ].includes(item.rule.type) && (
              <label className="block space-y-1 max-w-xs">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                  {t('achievementsThreshold')}
                </span>
                <input
                  type="number"
                  min={1}
                  value={item.rule.count ?? 1}
                  onChange={(e) => updateRule(item.id, { count: Number(e.target.value) || 1 })}
                  className="w-full border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
                />
              </label>
            )}

            {item.rule.type === 'skill_items_max' && (
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                  {t('achievementsSkillItems')}
                </p>
                <div className="max-h-48 overflow-y-auto border border-[var(--border)] divide-y divide-[var(--border-subtle)]">
                  {skillItems.map((skillItem) => {
                    const checked = (item.rule.skillItemIds ?? []).includes(skillItem.id);
                    return (
                      <label
                        key={`${item.id}_${skillItem.id}`}
                        className="flex items-start gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-black/5"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleSkillItem(item.id, skillItem.id, e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-mono text-[var(--ink-dim)]">{skillItem.id}</span>
                          <span className="text-[var(--ink)]"> · {skillItem.title}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {sortedItems.length === 0 && (
        <p className="text-sm text-[var(--ink-dim)] py-8 text-center border border-dashed border-[var(--border)]">
          {t('achievementsEmpty')}
        </p>
      )}
    </div>
  );
};
