import { useState } from 'react';
import { FirebaseError } from 'firebase/app';
import type { TotpSecret } from 'firebase/auth';
import { beginAdministratorTotpEnrollment, enrollAdministratorTotp } from '../../../auth';

interface AdminTotpEnrollmentProps {
  uid: string;
  labels: {
    setup: string;
    instructions: string;
    code: string;
    confirm: string;
    cancel: string;
    failed: string;
    enrolled: string;
  };
}

export function AdminTotpEnrollment({ uid, labels }: AdminTotpEnrollmentProps) {
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'failed' | 'enrolled' | null>(null);

  async function begin() {
    setStatus(null);
    setBusy(true);
    try {
      setSecret(await beginAdministratorTotpEnrollment(uid));
    } catch {
      setStatus('failed');
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (busy || !secret) return;
    setStatus(null);
    setBusy(true);
    try {
      await enrollAdministratorTotp(uid, secret, code);
      setSecret(null);
      setStatus('enrolled');
    } catch (error) {
      if (!(error instanceof FirebaseError) || error.code !== 'auth/invalid-verification-code') {
        setSecret(null);
      }
      setStatus('failed');
    } finally {
      setCode('');
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {secret ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void finish();
          }}
        >
          <p className="type-caption">{labels.instructions}</p>
          <code className="block break-all">{secret.secretKey}</code>
          <label className="block">
            {labels.code}
            <input
              className="ui-field-plain"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary px-4 py-2" disabled={busy}>
              {labels.confirm}
            </button>
            <button
              type="button"
              className="btn-secondary px-4 py-2"
              disabled={busy}
              onClick={() => {
                setSecret(null);
                setCode('');
                setStatus(null);
              }}
            >
              {labels.cancel}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-secondary px-4 py-2" disabled={busy} onClick={() => void begin()}>
          {labels.setup}
        </button>
      )}
      {status && <p role={status === 'failed' ? 'alert' : 'status'}>{labels[status]}</p>}
    </div>
  );
}
