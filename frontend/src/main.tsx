import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './i18n';
import './styles/index.css';
import { getCurrentLanguage } from './i18n';

// Keep the <html lang> attribute in sync with the active i18n language.
document.documentElement.lang = getCurrentLanguage();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
