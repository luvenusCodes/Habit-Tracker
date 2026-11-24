import { useState, useEffect } from 'react';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { VerifyEmail } from './components/VerifyEmail';
import { ForgotPassword } from './components/ForgotPassword';
import { OccurrenceTracker } from './components/OccurrenceTracker';
import { HabitList } from './components/HabitList';
import { GoalsManager } from './components/GoalsManager';
import AppLayout, { type NavTab } from './components/AppLayout';
import { SettingsManager } from './components/SettingsManager';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { initThemeListener, applyTheme, type ThemePreference } from './utils/theme';
import { fetchUserSettings } from './services/settingsService';
import { CategoryManager } from './components/CategoryManager';
import './App.css';

type AuthView = 'login' | 'register' | 'verify-email' | 'forgot-password';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<AuthView>('login');
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string>('');
  const [username, setUsername] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');

  useEffect(() => {
    const cleanup = initThemeListener();
    const token = localStorage.getItem('access_token');
    const storedUsername = localStorage.getItem('username');
    if (token) {
      setIsAuthenticated(true);
      if (storedUsername) setUsername(storedUsername);

      fetchUserSettings()
        .then((settings) => {
          if (settings?.theme) {
            applyTheme(settings.theme as ThemePreference);
          }
        })
        .catch(() => {
          // keep cached localstorage theme if request fails
        });
    }

    return cleanup;
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('username');
    setIsAuthenticated(false);
    setUsername(null);
    setActiveTab('dashboard');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4 transition-colors">
        <header className="max-w-md mx-auto text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            Habit Tracker
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Build consistency, one day at a time.
          </p>
        </header>
        <main className="max-w-md mx-auto">
          {currentView === 'login' && (
            <Login
              onLoginSuccess={() => {
                setIsAuthenticated(true);
                setUsername(localStorage.getItem('username'));
              }}
              onSwitchToRegister={() => setCurrentView('register')}
              onSwitchToForgotPassword={() => setCurrentView('forgot-password')}
              onSwitchToVerifyEmail={() => {
                setPendingVerificationEmail('');
                setCurrentView('verify-email');
              }}
            />
          )}
          {currentView === 'register' && (
            <Register
              onRegisterSuccess={(registeredEmail) => {
                setPendingVerificationEmail(registeredEmail);
                setCurrentView('verify-email');
              }}
              onSwitchToLogin={() => setCurrentView('login')}
            />
          )}
          {currentView === 'verify-email' && (
            <VerifyEmail
              initialEmail={pendingVerificationEmail}
              onVerified={() => setCurrentView('login')}
              onBackToLogin={() => setCurrentView('login')}
            />
          )}
          {currentView === 'forgot-password' && (
            <ForgotPassword
              onResetSuccess={() => setCurrentView('login')}
              onBackToLogin={() => setCurrentView('login')}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <AppLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      username={username}
      onLogout={handleLogout}
    >
      {activeTab === 'dashboard' && (
        <div className="space-y-8">
          <OccurrenceTracker />
        </div>
      )}
      {activeTab === 'habits' && (
        <div>
          <HabitList />
        </div>
      )}
      {activeTab === 'categories' && (
        <CategoryManager />
      )}
      {activeTab === 'goals' && (
        <GoalsManager />
      )}
      {activeTab === 'analytics' && (
        <AnalyticsDashboard />
      )}
      {activeTab === 'settings' && (
        <SettingsManager />
      )}
    </AppLayout>
  );
}

export default App;