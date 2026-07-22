import React, { useState } from 'react';
import { Search, Plus, X, Edit2, Trash2, DollarSign, Check, Loader2 } from 'lucide-react';
import { UserProfile, Instructor } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';
import { useNotifications } from '../PushNotificationHub';

interface ClientsManagerProps {
  usersList: UserProfile[];
  instructors: Instructor[];
  currentUserEmail: string;
  onAddUser?: (user: UserProfile) => Promise<void>;
  onUpdateUser?: (user: UserProfile) => Promise<void>;
  onDeleteUser?: (uid: string) => Promise<void>;
  onAddInstructor: (ins: Instructor) => Promise<void>;
  onUpdateInstructor: (ins: Instructor) => Promise<void>;
  onDeleteInstructor: (id: string) => Promise<void>;
  onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

export const ClientsManager: React.FC<ClientsManagerProps> = ({
  usersList,
  instructors,
  currentUserEmail,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onAddInstructor,
  onUpdateInstructor,
  onDeleteInstructor,
  onRequestConfirm,
}) => {
  const { t, language } = useLanguage();
  const { addNotification } = useNotifications();

  const [clientSearchText, setClientSearchText] = useState('');
  const [showClientAddForm, setShowClientAddForm] = useState(false);
  const [editingClient, setEditingClient] = useState<UserProfile | null>(null);

  // Client Form Fields
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientBalance, setClientBalance] = useState(250);
  const [clientRole, setClientRole] = useState<'user' | 'admin'>('user');
  const [clientIsInstructor, setClientIsInstructor] = useState(false);
  const [clientIsActive, setClientIsActive] = useState(true);
  const [isSubmittingClient, setIsSubmittingClient] = useState(false);
  const isSuperAdmin = currentUserEmail.toLowerCase() === 'gerasimchuk.arseniy@gmail.com';

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientEmail.trim()) {
      addNotification('warning', 'Missing Details', t('enterNameAndEmail'));
      return;
    }

    setIsSubmittingClient(true);

    const uId = editingClient ? editingClient.uid : `client_${Math.random().toString(36).substring(2, 9)}`;
    const defaultAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(clientName.trim().replace(/\s+/g, '_').toLowerCase())}`;

    const wasInstructor = editingClient ? !!editingClient.isInstructor : false;
    const isNowInstructor = clientIsInstructor;
    const oldInstructorId = editingClient?.instructorId || '';
 
    // Если статус инструктора активирован, убедимся, что у него есть ID.
    // Если ID нет, сгенерируем новый.
    const finalInstructorId = isNowInstructor
      ? (oldInstructorId || `ins_${uId}`)
      : ''; 
    
    const baseData = {
      displayName: (clientName || '').trim(),
      email: (clientEmail || '').trim().toLowerCase(),
      phoneNumber: (clientPhone || '').trim() || '',
      isClientActive: clientIsActive,
      balanceUSD: Number(clientBalance),
      role: clientRole,
      isInstructor: clientIsInstructor,
      instructorId: finalInstructorId,
    };

    const clientData: UserProfile = editingClient ? {
      ...editingClient,
      ...baseData
    } : {
      ...baseData,
      uid: uId,
      avatarUrl: defaultAvatar,
      level: 1
    };

    try {
      // Логика для создания/обновления инструктора при изменении статуса
      if (isNowInstructor && !wasInstructor) {
        // Статус инструктора был только что присвоен
        const exists = instructors.some(ins => ins.id === finalInstructorId);
        if (!exists) {
          const newIns: Instructor = {
            id: finalInstructorId,
            name: (clientName || '').trim(),
            specialty: 'both',
            rating: editingClient?.instructorId ? (instructors.find(i => i.id === editingClient.instructorId)?.rating || 0) : 0,
            reviewsCount: 0,
            languages: [language === 'en' ? 'English' : 'Russian'],
            experienceYears: 1,
            bio: t('defaultInstructorBio'),
            pricePerHour: 50,
            isAvailable: true,
            avatarUrl: clientData.avatarUrl
          };
          await onAddInstructor(newIns);
        } else {
          const existingIns = instructors.find(ins => ins.id === finalInstructorId);
          if (existingIns && !existingIns.isAvailable) { await onUpdateInstructor({ ...existingIns, isAvailable: true, name: (clientName || '').trim(), avatarUrl: clientData.avatarUrl }); }
        }
      } else if (wasInstructor && !isNowInstructor) {
        // Статус инструктора был снят, делаем его неактивным
        const existingIns = instructors.find(ins => ins.id === oldInstructorId);
        if (existingIns) {
          await onUpdateInstructor({ ...existingIns, isAvailable: false });
        }
      }

      if (editingClient) {
        if (onUpdateUser) {
          await onUpdateUser(clientData);
        }
        setEditingClient(null);
      } else {
        if (onAddUser) {
          await onAddUser(clientData);
        }
      }

      // Reset fields
      setClientName('');
      setClientEmail('');
      setClientPhone('');
      setClientBalance(250);
      setClientRole('user');
      setClientIsInstructor(false);
      setClientIsActive(true);
      setShowClientAddForm(false);
    } catch (err) {
      addNotification('error', 'Error', t('saveClientFailed'));
    } finally {
      setIsSubmittingClient(false);
    }
  };
  const startEditClient = (u: UserProfile) => {
    setEditingClient(u);
    setClientName(u.displayName);
    setClientEmail(u.email);
    setClientPhone(u.phoneNumber || '');
    setClientBalance(u.balanceUSD);
    setClientRole(u.role);
    setClientIsInstructor(u.isInstructor || false);
    setClientIsActive(u.isClientActive === undefined ? true : u.isClientActive);
    setShowClientAddForm(true);
  };

  const handleDeleteClient = (u: UserProfile) => {
    const confirmMsg = `${t('deleteClientConfirmPrefix')} ${u.displayName} (${u.email})?`;

    onRequestConfirm(
      confirmMsg,
      async () => {
        try {
          if (u.isInstructor && u.instructorId) {
            await onDeleteInstructor(u.instructorId);
          }
          if (onDeleteUser) {
            await onDeleteUser(u.uid);
          }
        } catch (err) {
          addNotification('error', t('deletionFailed'), t('deleteClientFailed'));
        }
      });
  };
  return (
    <div className="border border-[var(--border)] p-6 bg-transparent space-y-6 transition-colors duration-300 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2">
              {t('clientDatabaseTitle')}
            </h3>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
              {t('clientDatabaseSub')}
            </p>
          </div>
          <button
            onClick={() => {
              setEditingClient(null);
              setClientName('');
              setClientEmail('');
              setClientPhone('');
              setClientBalance(250);
              setClientRole('user');
              setClientIsActive(true);
              setClientIsInstructor(false);
              setShowClientAddForm(!showClientAddForm);
            }}
            className="self-start md:self-auto py-1.5 px-3 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 rounded-none text-xs flex items-center gap-1 transition cursor-pointer font-mono"
          >
            {showClientAddForm && !editingClient ? (
              <>
                <X className="w-4 h-4" />
                {t('closeForm')}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                {t('registerNewClient')}
              </>
            )}
          </button>
        </div>

        <div className="grid lg:grid-cols-12 gap-6 w-full min-w-0 overflow-hidden">
          {/* Left Column: Client Directory */}
          <div className={`${showClientAddForm ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-4 transition-all duration-300 w-full min-w-0 overflow-hidden`}>
            {/* Search Box */}
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--ink-dim)] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={clientSearchText}
                onChange={(e) => setClientSearchText(e.target.value)}
                placeholder={t('searchClientsPlaceholder')}
                className="w-full pl-10 pr-4 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-mono placeholder-[var(--ink-dim)]"
              />
            </div>

            {/* Clients Table */}
            <div className="border border-[var(--border)] overflow-hidden bg-transparent w-full min-w-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                      <th className="px-4 py-3">{t('skierLabel')}</th>
                      <th className="px-4 py-3">{t('contactDetails')}</th>
                      <th className="px-4 py-3">{t('walletBalance')}</th>
                      <th className="px-4 py-3">{t('roleLabel')}</th>
                      <th className="px-4 py-3 text-right">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/40">
                    {usersList
                      .filter(u => {
                        if (!clientSearchText) return true;
                        const search = clientSearchText.toLowerCase();
                        return (
                          (u.displayName || '').toLowerCase().includes(search) ||
                          (u.email || '').toLowerCase().includes(search) ||
                          (u.phoneNumber || '').toLowerCase().includes(search)
                        );
                      })
                      .map((u) => {
                        const isSelf = currentUserEmail.toLowerCase() === u.email?.toLowerCase();
                        return (
                          <tr key={u.uid} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <img 
                                  src={u.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.uid}`} 
                                  referrerPolicy="no-referrer"
                                  alt={u.displayName} 
                                  className="w-10 h-10 rounded-none bg-black/5 dark:bg-white/5 border border-[var(--border)]" 
                                />
                                <div>
                                  <span className="text-xs font-bold text-[var(--ink)] block flex items-center gap-1.5">
                                    {u.displayName || t('unnamedClient')}
                                    {isSelf && (
                                      <span className="bg-black/10 dark:bg-white/10 text-[var(--ink-dim)] text-[8px] font-mono px-1.5 py-0.5 rounded-none uppercase">
                                        {t('youBadge')}
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-[10px] text-[var(--ink-dim)] font-mono block mt-0.5">{u.uid}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-bold text-[var(--ink)] block">{u.email}</span>
                              {u.phoneNumber ? (
                                <span className="text-[10px] text-[var(--ink-dim)] font-mono block mt-1">{u.phoneNumber}</span>
                              ) : (
                                <span className="text-[10px] text-[var(--ink-dim)] font-mono italic block mt-1">{t('noPhoneSpecified')}</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1 font-mono">
                                <DollarSign className="w-3.5 h-3.5" />
                                {u.balanceUSD}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1 items-start">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono uppercase border ${u.role === 'admin' ? 'border-[var(--ink)] text-[var(--ink)] bg-black/5 dark:bg-white/5' : 'border-[var(--border)] text-[var(--ink-dim)] bg-transparent'}`}>
                                  {u.role === 'admin' ? (t('adminRole')) : (t('userRole'))}
                                </span>
                                {u.isInstructor && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-mono uppercase border border-indigo-500/40 text-indigo-400 bg-indigo-950/20">
                                    {t('coachLabel')}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1 font-mono">
                                <button
                                  onClick={() => startEditClient(u)}
                                  className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--ink)] border border-transparent rounded-none transition cursor-pointer"
                                  title={t('editClient')}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  disabled={isSelf}
                                  onClick={() => handleDeleteClient(u)}
                                  className={`p-1.5 border border-transparent rounded-none transition ${isSelf ? 'text-[var(--ink-dim)]/20 cursor-not-allowed' : 'text-rose-500 hover:text-rose-600 hover:border-rose-500/30 cursor-pointer'}`}
                                  title={isSelf ? (t('cannotDeleteSelf')) : (t('deleteClient'))}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {usersList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-xs text-[var(--ink-dim)] font-mono">
                          {t('noClientsFound')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Add / Edit Client Form */}
          {showClientAddForm && (
            <div className="lg:col-span-4 border border-[var(--border)] p-6 bg-transparent space-y-4 animate-fade-in shrink-0">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h4 className="font-serif text-lg font-light text-[var(--ink)]">
                  {editingClient ? (t('editProfile')) : (t('newClientRegistration'))}
                </h4>
                <button
                  onClick={() => {
                    setEditingClient(null);
                    setShowClientAddForm(false);
                  }}
                  className="p-1 text-[var(--ink-dim)] hover:text-[var(--ink)] transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleClientSubmit} className="space-y-4">
                {/* Display Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                    {t('fullName')}
                  </label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder={language === 'en' ? 'e.g. John Doe' : 'Например, Иван Иванов'}
                    className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                  />
                </div>

                {/* Email Address */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                    {t('emailAddress')}
                  </label>
                  <input
                    type="email"
                    required
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="e.g. johndoe@example.com"
                    className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                  />
                </div>

                {/* Phone Number */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                    {t('phoneOptional')}
                  </label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="e.g. +1 (555) 019-2834"
                    className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                  />
                </div>

                {/* Balance (USD) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                    {t('startingBalance')}
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-[var(--ink-dim)] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      min="0"
                      required
                      value={clientBalance}
                      onChange={(e) => setClientBalance(Number(e.target.value))}
                      className="w-full pl-9 pr-4 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                    />
                  </div>
                </div>

                {/* Role selection - only super admin can modify role */}
                {isSuperAdmin && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                      {t('accessRole')}
                    </label>
                    <select
                      value={clientRole}
                      onChange={(e) => setClientRole(e.target.value as 'user' | 'admin')}
                      className="w-full px-3 py-2 border border-[var(--border)] bg-slate-50 dark:bg-slate-900 text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono cursor-pointer"
                    >
                      <option value="user" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{t('userRegularClient')}</option>
                      <option value="admin" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{t('adminResortManager')}</option>
                    </select>
                  </div>
                )}

                {/* Instructor Status Toggle */}
                <div className="space-y-1.5 flex items-center gap-2 pt-1 pb-1">
                  <input
                    type="checkbox"
                    id="clientIsInstructorCheckbox"
                    checked={clientIsInstructor}
                    onChange={(e) => {
                      setClientIsInstructor(e.target.checked);
                    }}
                    className="w-4 h-4 border border-[var(--border)] bg-transparent focus:outline-none cursor-pointer accent-indigo-600 rounded-none shrink-0"
                  />
                  <label htmlFor="clientIsInstructorCheckbox" className="text-xs font-mono text-[var(--ink)] cursor-pointer select-none">
                    {t('instructorStatusGrant')}
                  </label>
                </div>

                {/* Client Access Toggle */}
                <div className="space-y-1.5 flex items-center gap-2 pt-1 pb-1">
                  <input
                    type="checkbox"
                    id="clientIsActiveCheckbox"
                    checked={clientIsActive}
                    onChange={(e) => setClientIsActive(e.target.checked)}
                    className="w-4 h-4 border border-[var(--border)] bg-transparent focus:outline-none cursor-pointer accent-emerald-600 rounded-none shrink-0"
                  />
                  <label htmlFor="clientIsActiveCheckbox" className="text-xs font-mono text-[var(--ink)] cursor-pointer select-none">
                    {t('cabinetAccessEnabled')}
                  </label>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmittingClient}
                  className="w-full py-2.5 px-4 border border-[var(--border)] hover:bg-[var(--ink)] hover:text-[var(--bg)] bg-transparent text-[var(--ink)] rounded-none text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 font-mono"
                >
                  {isSubmittingClient ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {editingClient ? (t('updateProfile')) : (t('createClient'))}
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
  );
};
