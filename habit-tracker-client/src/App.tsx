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
import { AuthLayout } from './components/AuthLayout';
import './App.css';

type AuthView = 'login' | 'register' | 'verify-email' | 'forgot-password';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<AuthView>('login');
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string>('');
  const [username, setUsername] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    const userKey = localStorage.getItem('username') || 'default';
    return localStorage.getItem(`habit_avatar_${userKey}`);
  });

  useEffect(() => {
    const cleanup = initThemeListener();
    const token = localStorage.getItem('access_token');
    const storedUsername = localStorage.getItem('username');
    if (token) {
      setIsAuthenticated(true);
      if (storedUsername) setUsername(storedUsername);
      const userKey = storedUsername || 'default';
      setAvatarUrl(localStorage.getItem(`habit_avatar_${userKey}`));

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
    setAvatarUrl(null);
    setActiveTab('dashboard');
  };

  if (!isAuthenticated) {
    return (
      <AuthLayout>
        {currentView === 'login' && (
          <Login
            onLoginSuccess={() => {
              const loggedInUser = localStorage.getItem('username');
              setIsAuthenticated(true);
              setUsername(loggedInUser);
              setAvatarUrl(localStorage.getItem(`habit_avatar_${loggedInUser || 'default'}`));
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
      </AuthLayout>
    );
  }

  return (
    <AppLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      username={username}
      avatarUrl={avatarUrl}
      onLogout={handleLogout}
    >
      {activeTab === 'dashboard' && (
        <div className="space-y-8">
          <OccurrenceTracker onNavigateToHabits={() => setActiveTab('habits')} />
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
        <SettingsManager
          avatarUrl={avatarUrl}
          onAvatarChange={setAvatarUrl}
          onUsernameChange={(newUsername) => setUsername(newUsername)}
          onLogout={handleLogout}
        />
      )}
    </AppLayout>
  );
}

export default App;