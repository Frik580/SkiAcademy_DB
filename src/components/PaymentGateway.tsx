import React, { useState } from 'react';
import { CreditCard, X, Check, ArrowRight, Loader2 } from 'lucide-react';
import { useNotifications } from './PushNotificationHub';
import { useLanguage } from '../lib/LanguageContext';

interface PaymentGatewayProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  onPaymentSuccess: (amount: number) => Promise<void>;
}

export const PaymentGateway: React.FC<PaymentGatewayProps> = ({
  isOpen,
  onClose,
  currentBalance,
  onPaymentSuccess,
}) => {
  const { addNotification } = useNotifications();
  const { t } = useLanguage();
  const [selectedAmount, setSelectedAmount] = useState<number>(100);
  const [cardNumber, setCardNumber] = useState<string>('');
  const [expiry, setExpiry] = useState<string>('');
  const [cvv, setCvv] = useState<string>('');
  const [cardholderName, setCardholderName] = useState<string>('');
  const [isPaying, setIsPaying] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  // Format Card Number (space every 4 digits)
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = value.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
      setCardNumber(parts.join(' '));
    } else {
      setCardNumber(value);
    }
  };

  // Format Expiry (MM/YY)
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length > 2) {
      setExpiry(`${value.substring(0, 2)}/${value.substring(2, 4)}`);
    } else {
      setExpiry(value);
    }
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber || !expiry || !cvv || !cardholderName) {
      addNotification('warning', t('incompletePaymentDetails'), t('completeSimulatedCardFields'));
      return;
    }

    setIsPaying(true);

    // Simulate network delay
    setTimeout(async () => {
      try {
        await onPaymentSuccess(selectedAmount);
        setIsPaying(false);
        setIsSuccess(true);
        addNotification(
          'success',
          t('simulatedPaymentCompleted'),
          `${t('refreshedWallet')} $${selectedAmount}.`
        );

        // Reset and close after a short display
        setTimeout(() => {
          setIsSuccess(false);
          setCardNumber('');
          setExpiry('');
          setCvv('');
          setCardholderName('');
          onClose();
        }, 1500);
      } catch (err) {
        setIsPaying(false);
        addNotification('error', t('paymentFailed'), t('balanceSyncFailed'));
      }
    }, 1800);
  };

  return (
    <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="ui-modal shadow-2xl w-full max-w-md overflow-hidden animate-scale-up transition-colors duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-black/10">
          <div>
            <h3 className="font-serif text-lg font-light text-[var(--ink)]">
              {t('topUpWalletTitle')}
            </h3>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-0.5">
              {t('topUpWalletSub')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer rounded-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isSuccess ? (
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-none bg-black/10 border border-[var(--border)] flex items-center justify-center animate-bounce">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <h4 className="font-serif text-lg font-light text-[var(--ink)]">{t('thankYou')}</h4>
              <p className="text-xs text-[var(--ink-dim)] mt-1 font-mono uppercase tracking-wide">
                {t('refreshedWallet')}{' '}
                <strong className="text-[var(--ink)] font-bold">${selectedAmount}</strong>.
              </p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-black/10 border border-[var(--border)] rounded-none text-[10px] font-mono uppercase tracking-wider text-[var(--ink)] mt-4">
                <CreditCard className="w-3.5 h-3.5 text-[var(--ink-dim)]" /> {t('newBalance')}: $
                {currentBalance + selectedAmount}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePay} className="p-6 space-y-5">
            {/* Quick Balance Information */}
            <div className="flex items-center justify-between bg-black/10 rounded-none p-4 border border-[var(--border)]">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                {t('currentBalance')}:
              </span>
              <span className="text-xl font-extrabold text-[var(--ink)] font-mono">
                ${currentBalance}
              </span>
            </div>

            {/* Select Top-up Amount */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                {t('selectTopUpAmount')}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[50, 100, 200, 500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSelectedAmount(amt)}
                    className={`py-2 border text-xs font-mono transition-all cursor-pointer rounded-none ${
                      selectedAmount === amt
                        ? 'border-[var(--ink)] bg-black/15 text-[var(--ink)] font-bold'
                        : 'border-[var(--border)] hover:border-[var(--ink)] hover:bg-black/5 text-[var(--ink-dim)]'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Card Information */}
            <div className="space-y-3 pt-4 border-t border-[var(--border)]">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                {t('cardNumber')} ({t('sandbox')})
              </span>

              {/* Cardholder Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                  {t('cardHolder')}
                </label>
                <input
                  type="text"
                  required
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  placeholder="e.g. Alex Carter"
                  className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none"
                />
              </div>

              {/* Card Number */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                  {t('paymentCardNumber')}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    maxLength={19}
                    value={cardNumber}
                    onChange={handleCardNumberChange}
                    placeholder="4000 1234 5678 9010"
                    className="w-full pl-10 pr-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-mono"
                  />
                  <CreditCard className="w-4 h-4 text-[var(--ink-dim)] absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* Expiry & CVV */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                    {t('expiry')}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    value={expiry}
                    onChange={handleExpiryChange}
                    placeholder="MM/YY"
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition text-center rounded-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                    {t('cvv')}
                  </label>
                  <input
                    type="password"
                    required
                    maxLength={3}
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="***"
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition text-center rounded-none font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Pay Button */}
            <button
              type="submit"
              disabled={isPaying}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              {isPaying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('processing')}
                </>
              ) : (
                <>
                  {t('authorizeTopUp')} ${selectedAmount}
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
