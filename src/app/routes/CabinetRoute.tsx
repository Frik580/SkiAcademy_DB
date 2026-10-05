import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../features/auth/session';
import { useProfileStore } from '../../features/profile/runtime';
import { AuthRoute } from '../../features/shell';
import { RouteContentLoading } from '../../ui/RouteContentLoading';
import type { AppRoutesProps } from './routeTypes';

type CabinetModule = typeof import('./CabinetRouteContainer');
let cabinetModule: CabinetModule | undefined;
let cabinetRequest: Promise<CabinetModule> | undefined;

const loadCabinet = () => {
  cabinetRequest ??= import('./CabinetRouteContainer').then(
    (module) => {
      cabinetModule = module;
      return module;
    },
    (error: unknown) => {
      cabinetRequest = undefined;
      throw error;
    }
  );
  return cabinetRequest;
};

/** One loading owner for concurrent route-code and session/profile resolution. */
export const CabinetRoute: React.FC<AppRoutesProps> = (props) => {
  const authLoading = useAuthStore((state) => state.authLoading);
  const profileLoading = useProfileStore((state) => state.profileLoading);
  const userProfile = useProfileStore((state) => state.userProfile);
  const [module, setModule] = useState(cabinetModule);
  const [failure, setFailure] = useState<{ error: unknown }>();

  useEffect(() => {
    let active = true;
    void loadCabinet().then(
      (loaded) => {
        if (active) setModule(loaded);
      },
      (error: unknown) => {
        if (active) setFailure({ error });
      }
    );
    return () => {
      active = false;
    };
  }, []);

  if (authLoading || profileLoading || (userProfile && !module && !failure)) {
    return <RouteContentLoading />;
  }
  // A resolved guest redirects without waiting for (or failing on) protected code.
  if (userProfile && failure) throw failure.error;
  const Component = module?.CabinetRouteContainer;
  return <AuthRoute userProfile={userProfile}>{Component && <Component {...props} />}</AuthRoute>;
};
