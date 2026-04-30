import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { AppShell } from './components/AppShell';
import type { AppInfo } from '../../shared/types/app';

type LoadState =
  | { status: 'loading'; appInfo: null }
  | { status: 'ready'; appInfo: AppInfo }
  | { status: 'error'; appInfo: null };

export function App(): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading', appInfo: null });

  useEffect(() => {
    let isMounted = true;

    window.markProof.app
      .getInfo()
      .then((appInfo) => {
        if (isMounted) {
          setState({ status: 'ready', appInfo });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState({ status: 'error', appInfo: null });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return <AppShell appInfo={state.appInfo} isLoading={state.status === 'loading'} />;
}
