import { RouterProvider } from 'react-router-dom';

import { AuthProvider } from '../features/auth/auth-context';
import { LocaleProvider } from '../i18n';
import { router } from './routes';

export function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </LocaleProvider>
  );
}
