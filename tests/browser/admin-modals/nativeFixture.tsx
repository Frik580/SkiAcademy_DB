import { useEffect } from 'react';
import { useAdminDialog } from '../../../src/features/admin/components/useAdminDialog';

export function NativeFixture({
  kind,
  onResult,
}: {
  kind: string;
  onResult: (value: string) => void;
}) {
  const { confirm, alert, dialog } = useAdminDialog();
  useEffect(() => {
    if (kind === 'native-confirm')
      void confirm(
        'Подтвердите действие над выбранной записью. Команда будет вызвана только после подтверждения.'
      ).then((accepted) => onResult(String(accepted)));
    else
      void alert(
        'Не удалось обработать вложение. Проверьте выбранный файл и повторите попытку.'
      ).then(() => onResult('acknowledged'));
    // Represents the one user request that mounted this fixture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return dialog;
}
