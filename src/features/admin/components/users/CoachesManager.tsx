import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Edit2,
  Upload,
  Camera,
} from 'lucide-react';
import { Booking, Instructor } from '../../../../types';
import { useLanguage } from '../../../../lib/LanguageContext';
import { useNotifications } from '../../../../features/notifications';
import { getSpecialtyLabel } from '../schedule/scheduleUtils';
import { uploadImage } from '../../../../lib/storage';
import { logger } from '../../../../lib/logger';

interface CoachesManagerProps {
  instructors: Instructor[];
  bookings: Booking[];
  onAddInstructor: (ins: Instructor) => Promise<void>;
  onUpdateInstructor: (ins: Instructor) => Promise<void>;
  onDeleteInstructor: (id: string) => Promise<void>;
  onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

export const CoachesManager: React.FC<CoachesManagerProps> = ({
  instructors,
  bookings,
  onAddInstructor,
  onUpdateInstructor,
  onDeleteInstructor,
  onRequestConfirm,
}) => {
  const { t, language } = useLanguage();
  const { addNotification } = useNotifications();

  function optimizeInstructorImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('File is not an image'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 400; // 400x400px is perfect for instructor cards
          const width = img.width;
          const height = img.height;

          // Crop to a perfect square centered
          let sourceX = 0;
          let sourceY = 0;
          let sourceWidth = width;
          let sourceHeight = height;

          if (width > height) {
            sourceX = (width - height) / 2;
            sourceWidth = height;
          } else {
            sourceY = (height - width) / 2;
            sourceHeight = width;
          }

          canvas.width = MAX_SIZE;
          canvas.height = MAX_SIZE;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get 2D context'));
            return;
          }

          ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, MAX_SIZE, MAX_SIZE);

          // Compress to JPEG with 80% quality
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create blob from canvas'));
              }
            },
            'image/jpeg',
            0.8
          );
        };
        img.onerror = () => reject(new Error('Failed to load image source'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIns, setEditingIns] = useState<Instructor | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState<'ski' | 'snowboard' | 'both'>('ski');
  const [languages, setLanguages] = useState('English, German');
  const [experienceYears, setExperienceYears] = useState(5);
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [pricePerHour, setPricePerHour] = useState(50);
  const [pricePerHourKZT, setPricePerHourKZT] = useState<number | ''>(25000);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await processAndOptimizeImage(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processAndOptimizeImage(file);
    }
  };

  const processAndOptimizeImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      addNotification('error', t('invalidFile'), t('invalidFileDesc'));
      return;
    }

    setIsUploadingImage(true);
    try {
      const optimizedBlob = await optimizeInstructorImage(file);
      const instructorId = editingIns?.id || `instructor_${Date.now()}`;
      const imageUrl = await uploadImage(optimizedBlob, `instructors/${instructorId}.jpg`);
      setAvatarUrl(imageUrl);
      addNotification('success', t('photoAttached'), t('photoAttachedDesc'));
    } catch (err) {
      logger.error(err);
      addNotification('error', t('uploadFailed'), t('couldNotOptimizeImage'));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !bio || !pricePerHour) {
      addNotification('warning', t('missingDetails'), t('completeInstructorForm'));
      return;
    }

    setIsSubmitting(true);
    const languagesArr = languages
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);
    const defaultAvatar = `https://images.unsplash.com/photo-${Math.random() > 0.5 ? '1534528741775-53994a69daeb' : '1506794778202-cad84cf45f1d'}?auto=format&fit=crop&q=80&w=400`;

    const insData: Instructor = {
      id: editingIns ? editingIns.id : `ins_${Math.random().toString(36).substring(2, 9)}`,
      name,
      specialty,
      rating: editingIns ? editingIns.rating : 5.0,
      reviewsCount: editingIns ? editingIns.reviewsCount : 0,
      languages: languagesArr,
      experienceYears: Number(experienceYears),
      bio,
      avatarUrl: avatarUrl.trim() || defaultAvatar,
      pricePerHour: Number(pricePerHour),
      isAvailable: editingIns ? editingIns.isAvailable : true,
    };

    if (pricePerHourKZT !== '' && pricePerHourKZT !== null && !isNaN(Number(pricePerHourKZT))) {
      insData.pricePerHourKZT = Number(pricePerHourKZT);
    }
    if (phoneNumber.trim()) {
      insData.phoneNumber = phoneNumber.trim();
    }

    try {
      if (editingIns) {
        await onUpdateInstructor(insData);
        addNotification(
          'success',
          t('coachProfileUpdated'),
          `${name} ${t('coachInfoSyncedSuffix')}`
        );
        setEditingIns(null);
      } else {
        await onAddInstructor(insData);
        addNotification('success', t('newCoachAdded'), `${name} ${t('coachJoinedSuffix')}`);
      }

      // Reset fields
      setName('');
      setBio('');
      setAvatarUrl('');
      setLanguages('English, German');
      setPricePerHour(50);
      setPricePerHourKZT(25000);
      setPhoneNumber('');
      setExperienceYears(5);
      setShowAddForm(false);
    } catch (err) {
      addNotification('error', t('syncFailed'), t('syncFailedDesc'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (ins: Instructor) => {
    setEditingIns(ins);
    setName(ins.name);
    setSpecialty(ins.specialty);
    setLanguages(ins.languages.join(', '));
    setExperienceYears(ins.experienceYears);
    setBio(ins.bio);
    setAvatarUrl(ins.avatarUrl);
    setPricePerHour(ins.pricePerHour);
    setPricePerHourKZT(ins.pricePerHourKZT ?? '');
    setPhoneNumber(ins.phoneNumber || '');
    setShowAddForm(true);
  };

  const handleToggleAvailability = async (ins: Instructor) => {
    if (ins.isAvailable) {
      const activeBookings = bookings.filter(
        (b) => b.instructorId === ins.id && (b.status === 'pending' || b.status === 'confirmed')
      );
      if (activeBookings.length > 0) {
        const bookingsListStr = activeBookings
          .map((b) => `• ${b.date} @ ${b.time} (${b.durationHours}h)`)
          .join('\n');
        const bookingsListStrRu = activeBookings
          .map((b) => `• ${b.date} в ${b.time} (${b.durationHours} ч.)`)
          .join('\n');

        addNotification(
          'error',
          t('cannotMakeUnavailable'),
          language === 'en'
            ? `${t('instructorActiveEnPrefix')} ${ins.name} ${t('instructorActiveEnMid')} ${activeBookings.length} ${t('instructorActiveEnSuffix')}\n\n${bookingsListStr}`
            : `${t('instructorActiveRuPrefix')} ${ins.name} ${t('instructorActiveRuMid')} (${activeBookings.length} шт.). ${t('instructorActiveRuRest')}\n\n${bookingsListStrRu}`
        );
        return;
      }
    }

    const updated = { ...ins, isAvailable: !ins.isAvailable };
    try {
      await onUpdateInstructor(updated);
      const isAvailStr = updated.isAvailable ? t('availableWord') : t('unavailableWord');
      addNotification('info', t('statusUpdated'), `${ins.name} ${t('isNowWord')} ${isAvailStr}.`);
    } catch (e) {
      addNotification('error', t('statusToggleFailed'), t('couldNotSyncAvailability'));
    }
  };

  const handleDeleteCoach = (ins: Instructor) => {
    const confirmMsg = `${t('deleteInstructorConfirmPrefix')} ${ins.name} ${t('deleteInstructorConfirmSuffix')}`;

    onRequestConfirm(confirmMsg, async () => {
      try {
        await onDeleteInstructor(ins.id);
        addNotification(
          'success',
          t('instructorDeleted'),
          `${ins.name} ${t('instructorRemovedSuffix')}`
        );
      } catch (err) {
        addNotification('error', t('deletionFailed'), t('deleteInstructorFailed'));
      }
    });
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6 w-full min-w-0 overflow-hidden">
      {/* Instructors Management Table */}
      <div
        className={`${showAddForm || editingIns ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-4 transition-colors duration-300 w-full min-w-0 overflow-hidden`}
      >
        <div className="flex items-center justify-end border-b border-[var(--border)] pb-3">
          <button
            onClick={() => {
              setEditingIns(null);
              setShowAddForm(!showAddForm);
            }}
            className="py-1.5 px-3 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 rounded-none text-xs flex items-center gap-1 transition cursor-pointer font-mono"
          >
            <Plus className="w-4 h-4" /> {t('addCoachShort')}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                <th className="py-3 px-2">{t('instructorColumn')}</th>
                <th className="py-3 px-2">{t('discipline')}</th>
                <th className="py-3 px-2">{t('ratePerHourShort')}</th>
                <th className="py-3 px-2 text-center">{t('availabilityLabel')}</th>
                <th className="py-3 px-2 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {instructors.map((ins) => (
                <tr
                  key={ins.id}
                  className="border-b border-[var(--border)]/40 hover:bg-black/5 dark:hover:bg-white/5 transition"
                >
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={ins.avatarUrl}
                        alt={ins.name}
                        className="w-8 h-8 rounded-none border border-[var(--border)] object-cover"
                      />
                      <div>
                        <span className="text-xs font-bold text-[var(--ink)] block leading-none">
                          {ins.name}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--ink-dim)] mt-1.5 block">
                          {`${t('expYearsPrefix')} ${ins.experienceYears} ${t('expYearsSuffix')}`}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <span className="text-[10px] font-mono text-[var(--ink)] uppercase border border-[var(--border)] px-2 py-0.5 bg-black/5 dark:bg-white/5">
                      {getSpecialtyLabel(ins.specialty, language)}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-xs font-mono text-[var(--ink)]">
                    <div>${ins.pricePerHour}</div>
                    {ins.pricePerHourKZT ? (
                      <div className="text-[10px] text-[var(--ink-dim)]">
                        {ins.pricePerHourKZT.toLocaleString()} ₸
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => handleToggleAvailability(ins)}
                        className="p-1 transition cursor-pointer"
                      >
                        {ins.isAvailable ? (
                          <ToggleRight className="w-8 h-8 text-[var(--ink)]" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-[var(--ink-dim)]" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => startEdit(ins)}
                        className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--ink)] border border-transparent rounded-none transition cursor-pointer"
                        title={t('editDetails')}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCoach(ins)}
                        className="p-1.5 text-rose-500 hover:text-rose-600 hover:border-rose-500/30 border border-transparent rounded-none transition cursor-pointer"
                        title={t('deleteInstructor')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Panel Side (Dynamic add or edit) */}
      {(showAddForm || editingIns) && (
        <div className="lg:col-span-4 border border-[var(--border)] p-6 bg-transparent self-start transition-colors duration-300 animate-fade-in">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h4 className="font-serif text-lg font-light text-[var(--ink)]">
                {editingIns
                  ? `${t('editProfilePrefix')} ${editingIns.name}`
                  : t('registerNewCoach')}
              </h4>
              <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
                {t('coachFormSub')}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                {t('coachFullName')}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jean-Pierre"
                className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                  {t('discipline')}
                </label>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value as any)}
                  className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-slate-50 dark:bg-slate-900 text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] cursor-pointer rounded-none font-mono"
                >
                  <option value="ski" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
                    {t('specialtySki')}
                  </option>
                  <option
                    value="snowboard"
                    className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]"
                  >
                    {t('specialtySnowboard')}
                  </option>
                  <option value="both" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
                    {t('specialtyBoth')}
                  </option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                    {t('ratePerHourLabel')} ($ USD)
                  </label>
                  <input
                    type="number"
                    required
                    value={pricePerHour}
                    onChange={(e) => setPricePerHour(Number(e.target.value))}
                    placeholder="75"
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] text-center rounded-none font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                    {t('ratePerHourKztLabel') || 'Ставка (₸ KZT/ч)'}
                  </label>
                  <input
                    type="number"
                    value={pricePerHourKZT}
                    onChange={(e) =>
                      setPricePerHourKZT(e.target.value ? Number(e.target.value) : '')
                    }
                    placeholder="37500"
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] text-center rounded-none font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                  {t('phoneOptional')}
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+7 ..."
                  className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] text-center rounded-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                  {t('experienceYrsShort')}
                </label>
                <input
                  type="number"
                  required
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] text-center rounded-none font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                  {t('languagesCsv')}
                </label>
                <input
                  type="text"
                  required
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                {t('bioStatement')}
              </label>
              <textarea
                required
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t('bioPlaceholder')}
                className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] resize-none rounded-none font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                {t('coachPhoto')}
              </label>

              {/* Combined preview and drag-drop upload zone */}
              <div className="flex gap-3 items-center">
                {/* Visual Preview */}
                <div className="w-16 h-16 rounded-none bg-black/5 dark:bg-white/5 border border-[var(--border)] flex-shrink-0 overflow-hidden relative flex items-center justify-center group">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Camera className="w-6 h-6 text-[var(--ink-dim)]" />
                  )}
                  {isUploadingImage && (
                    <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
                </div>

                {/* Drag and Drop Zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('instructor-photo-upload')?.click()}
                  className={`flex-1 h-16 rounded-none border border-dashed flex flex-col items-center justify-center px-3 cursor-pointer transition ${
                    isDragOver
                      ? 'border-[var(--ink)] bg-black/5 dark:bg-white/5'
                      : 'border-[var(--border)] hover:border-[var(--ink)] bg-black/5 dark:bg-white/5'
                  }`}
                >
                  <input
                    id="instructor-photo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Upload className="w-4 h-4 text-[var(--ink-dim)] mb-0.5" />
                  <p className="text-[10px] font-bold text-[var(--ink)] text-center font-mono">
                    {isUploadingImage ? t('optimizing') : t('clickOrDragPhoto')}
                  </p>
                  <p className="text-[8px] text-[var(--ink-dim)] text-center font-mono">
                    {t('autoOptimizeHint')}
                  </p>
                </div>
              </div>

              {/* Manual URL Input alternative */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-[var(--ink-dim)] font-semibold uppercase font-mono">
                    {t('orPasteImageUrl')}
                  </span>
                </div>
                <input
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 font-mono">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2 border border-[var(--border)] hover:bg-[var(--ink)] hover:text-[var(--bg)] bg-transparent text-[var(--ink)] font-bold text-xs rounded-none flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : editingIns ? (
                  t('saveUpdates')
                ) : (
                  t('addCoachShort')
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingIns(null);
                  setShowAddForm(false);
                }}
                className="px-3 py-2 border border-[var(--border)] bg-transparent hover:bg-black/5 dark:hover:bg-white/5 text-[var(--ink)] rounded-none text-xs font-semibold cursor-pointer transition"
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
