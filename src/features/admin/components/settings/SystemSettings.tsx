import React from 'react';
import { AdminProductSettings } from './AdminProductSettings';
import { AdminSystemSettings, type AdminSystemSettingsProps } from './AdminSystemSettings';

/** @deprecated Prefer AdminSystemSettings + AdminProductSettings via admin tabs. */
export const SystemSettings: React.FC<AdminSystemSettingsProps> = (props) => (
  <div className="space-y-6">
    <AdminSystemSettings {...props} />
    <AdminProductSettings />
  </div>
);
