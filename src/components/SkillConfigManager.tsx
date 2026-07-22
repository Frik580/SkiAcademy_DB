import React, { useState, useEffect } from 'react';
import { SkillConfig, SkillItem, DEFAULT_SKILL_CONFIG } from '../lib/skillData';
import { useLanguage } from '../lib/LanguageContext';
import { Plus, Trash2, Edit2, Save, RotateCcw, Award, Check } from 'lucide-react';

interface SkillConfigManagerProps {
  config?: SkillConfig;
  onSaveConfig: (config: SkillConfig) => Promise<void>;
}

export const SkillConfigManager: React.FC<SkillConfigManagerProps> = ({
  config = DEFAULT_SKILL_CONFIG,
  onSaveConfig
}) => {
  const { language } = useLanguage();
  const [items, setItems] = useState<SkillItem[]>(config.items || DEFAULT_SKILL_CONFIG.items);
  const [passPercentage, setPassPercentage] = useState<number>(config.passPercentage ?? 80);
  const [selectedLevelTransition, setSelectedLevelTransition] = useState<number>(1); // 1 = Lvl1->2, 2 = Lvl2->3, 3 = Lvl3->4
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Sync state if props change
  useEffect(() => {
    if (config?.items) {
      setItems(config.items);
      setPassPercentage(config.passPercentage ?? 80);
    }
  }, [config]);

  // Filter items by level transition
  const filteredItems = items.filter(item => item.levelTarget === selectedLevelTransition);

  // Totals for current transition
  const transitionMaxPoints = filteredItems.reduce((sum, item) => sum + item.maxPoints, 0);

  const handleUpdateItemField = (id: string, field: keyof SkillItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleAddItem = () => {
    const newItem: SkillItem = {
      id: `item_${Date.now()}`,
      levelTarget: selectedLevelTransition,
      section: selectedLevelTransition === 1 ? 'Баланс' : selectedLevelTransition === 2 ? 'Техника' : 'Высокая скорость',
      num: String(filteredItems.length + 1),
      title: 'Новое упражнение',
      maxPoints: 5,
      controlPoints: 2,
      speedPoints: 1,
      techniquePoints: 2
    };
    setItems(prev => [...prev, newItem]);
    setEditingItemId(newItem.id);
  };

  const handleDeleteItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleResetToDefault = () => {
    if (window.confirm(language === 'ru' ? 'Сбросить все пункты таблицы навыков к заводским значениям?' : 'Reset skill table to default initial values?')) {
      setItems(DEFAULT_SKILL_CONFIG.items);
      setPassPercentage(80);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveConfig({
        passPercentage,
        items
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="border border-[var(--border)] p-5 bg-black/5 dark:bg-white/5 rounded-none space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h4 className="font-serif text-lg font-light text-[var(--ink)] flex items-center gap-2">
            <Award className="w-5 h-5 text-indigo-400" />
            {language === 'ru' ? 'Таблица начисления рейтинга клиентов (Level System)' : 'Client Rating & Skill Level Matrix'}
          </h4>
          <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1">
            {language === 'ru' 
              ? 'Настройка баллов по упражнениям и критериев перехода между уровнями' 
              : 'Configure skill exercises, maximum points, and level advancement thresholds'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleResetToDefault}
            className="px-3 py-1.5 border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-[10px] font-mono uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {language === 'ru' ? 'Сбросить' : 'Reset'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-mono uppercase tracking-wider font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? (language === 'ru' ? 'Сохранение...' : 'Saving...') : (language === 'ru' ? 'Сохранить изменения' : 'Save Changes')}
          </button>
        </div>
      </div>

      {/* Passing score setting */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-black/20 p-4 border border-[var(--border)]/60">
        <div>
          <label className="block text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mb-1">
            {language === 'ru' ? 'Порог прохождения (% от макс. баллов)' : 'Advancement Threshold (% of max points)'}
          </label>
          <div className="flex items-center gap-2">
            <input 
              type="number" 
              min={50} 
              max={100} 
              value={passPercentage}
              onChange={(e) => setPassPercentage(Number(e.target.value))}
              className="w-24 bg-[var(--bg)] border border-[var(--border)] px-3 py-1.5 text-xs font-mono text-[var(--ink)] focus:outline-none focus:border-indigo-500"
            />
            <span className="text-xs font-mono font-bold text-indigo-400">%</span>
          </div>
          <span className="text-[9px] text-[var(--ink-dim)] mt-1 block">
            {language === 'ru' ? `Для перехода нужно набрать минимум ${passPercentage}% от суммы баллов уровня` : `Min ${passPercentage}% required to level up`}
          </span>
        </div>

        <div>
          <span className="block text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mb-1">
            {language === 'ru' ? 'Всего упражнений в системе' : 'Total Skill Items'}
          </span>
          <span className="text-lg font-serif font-bold text-[var(--ink)]">{items.length}</span>
        </div>

        <div>
          <span className="block text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mb-1">
            {language === 'ru' ? 'Баллов на текущем переходе' : 'Current Transition Max Points'}
          </span>
          <span className="text-lg font-serif font-bold text-emerald-400">
            {transitionMaxPoints} {language === 'ru' ? 'баллов' : 'pts'}
            <span className="text-xs font-mono text-[var(--ink-dim)] ml-2">
              (нужно: {Math.ceil(transitionMaxPoints * (passPercentage / 100))})
            </span>
          </span>
        </div>
      </div>

      {/* Level Transition Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
        <button
          onClick={() => setSelectedLevelTransition(1)}
          className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border transition cursor-pointer ${
            selectedLevelTransition === 1 
              ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 font-bold' 
              : 'border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
          }`}
        >
          Beginner → Carve (Уровень 1 → 2)
        </button>
        <button
          onClick={() => setSelectedLevelTransition(2)}
          className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border transition cursor-pointer ${
            selectedLevelTransition === 2 
              ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 font-bold' 
              : 'border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
          }`}
        >
          Carve → Performance (Уровень 2 → 3)
        </button>
        <button
          onClick={() => setSelectedLevelTransition(3)}
          className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border transition cursor-pointer ${
            selectedLevelTransition === 3 
              ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 font-bold' 
              : 'border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
          }`}
        >
          Performance → Expert (Уровень 3 → 4)
        </button>
      </div>

      {/* Action header */}
      <div className="flex justify-between items-center">
        <span className="text-xs font-mono text-[var(--ink)] font-bold">
          {language === 'ru' ? `Упражнения этапа (${filteredItems.length} элементов)` : `Exercises for stage (${filteredItems.length} items)`}
        </span>
        <button
          onClick={handleAddItem}
          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-mono uppercase tracking-wider transition flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {language === 'ru' ? 'Добавить пункт' : 'Add Item'}
        </button>
      </div>

      {/* Table of Skill Items */}
      <div className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-black/30 text-[9px] font-mono uppercase text-[var(--ink-dim)] tracking-wider border-b border-[var(--border)]">
              <th className="p-2 border-r border-[var(--border)]/40 w-12">№</th>
              <th className="p-2 border-r border-[var(--border)]/40">Категория / Раздел</th>
              <th className="p-2 border-r border-[var(--border)]/40">Наименование упражнения</th>
              <th className="p-2 border-r border-[var(--border)]/40 w-20 text-center">Макс. балл</th>
              <th className="p-2 border-r border-[var(--border)]/40 w-36 text-center">Распределение (К / СК / ТЕХ)</th>
              <th className="p-2 w-20 text-center">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/40 text-xs font-mono text-[var(--ink)]">
            {filteredItems.map((item, idx) => {
              const isEditing = editingItemId === item.id;
              return (
                <tr key={item.id} className="hover:bg-black/10 transition-colors">
                  <td className="p-2 border-r border-[var(--border)]/40 text-center text-[var(--ink-dim)]">{idx + 1}</td>
                  
                  {/* Category */}
                  <td className="p-2 border-r border-[var(--border)]/40">
                    {isEditing ? (
                      <input 
                        type="text" 
                        value={item.section}
                        onChange={(e) => handleUpdateItemField(item.id, 'section', e.target.value)}
                        className="w-full bg-[var(--bg)] border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--ink)]"
                      />
                    ) : (
                      <span className="font-semibold text-indigo-300">{item.section}</span>
                    )}
                  </td>

                  {/* Title */}
                  <td className="p-2 border-r border-[var(--border)]/40">
                    {isEditing ? (
                      <input 
                        type="text" 
                        value={item.title}
                        onChange={(e) => handleUpdateItemField(item.id, 'title', e.target.value)}
                        className="w-full bg-[var(--bg)] border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--ink)]"
                      />
                    ) : (
                      <span>{item.title}</span>
                    )}
                  </td>

                  {/* Max Points */}
                  <td className="p-2 border-r border-[var(--border)]/40 text-center">
                    {isEditing ? (
                      <input 
                        type="number" 
                        min={1} 
                        value={item.maxPoints}
                        onChange={(e) => handleUpdateItemField(item.id, 'maxPoints', Number(e.target.value))}
                        className="w-14 bg-[var(--bg)] border border-[var(--border)] text-center px-1 py-0.5 text-xs text-[var(--ink)]"
                      />
                    ) : (
                      <span className="font-bold text-amber-400">{item.maxPoints}</span>
                    )}
                  </td>

                  {/* Points breakdown: Control, Speed, Technique */}
                  <td className="p-2 border-r border-[var(--border)]/40 text-center">
                    {isEditing ? (
                      <div className="flex gap-1 justify-center">
                        <input 
                          type="number" 
                          title="Контроль" 
                          placeholder="К" 
                          value={item.controlPoints || 0}
                          onChange={(e) => handleUpdateItemField(item.id, 'controlPoints', Number(e.target.value))}
                          className="w-10 bg-[var(--bg)] border border-[var(--border)] text-center text-[10px] text-cyan-300"
                        />
                        <input 
                          type="number" 
                          title="Скорость" 
                          placeholder="Ск" 
                          value={item.speedPoints || 0}
                          onChange={(e) => handleUpdateItemField(item.id, 'speedPoints', Number(e.target.value))}
                          className="w-10 bg-[var(--bg)] border border-[var(--border)] text-center text-[10px] text-amber-300"
                        />
                        <input 
                          type="number" 
                          title="Техника" 
                          placeholder="Тех" 
                          value={item.techniquePoints || 0}
                          onChange={(e) => handleUpdateItemField(item.id, 'techniquePoints', Number(e.target.value))}
                          className="w-10 bg-[var(--bg)] border border-[var(--border)] text-center text-[10px] text-purple-300"
                        />
                      </div>
                    ) : (
                      <div className="flex justify-center gap-2 text-[10px]">
                        <span className="text-cyan-300" title="Контроль">К: {item.controlPoints || 0}</span>
                        <span className="text-amber-300" title="Скорость">Ск: {item.speedPoints || 0}</span>
                        <span className="text-purple-300" title="Техника">Тех: {item.techniquePoints || 0}</span>
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => setEditingItemId(isEditing ? null : item.id)}
                        className={`p-1 border transition cursor-pointer ${
                          isEditing 
                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' 
                            : 'border-[var(--border)] text-[var(--ink-dim)] hover:text-[var(--ink)]'
                        }`}
                        title={isEditing ? 'Готово' : 'Редактировать'}
                      >
                        {isEditing ? <Check className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1 border border-[var(--border)] text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
