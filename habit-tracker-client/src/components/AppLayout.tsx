import React, { useState } from 'react';

export type NavTab = 'dashboard' | 'habits' | 'categories' | 'goals' | 'analytics' | 'settings';

interface AppLayoutProps {
    children: React.ReactNode;
    activeTab: NavTab;
    onTabChange: (tab: NavTab) => void;
    username: string | null;
    onLogout: () => void;
}

export default function AppLayout({
    children,
    activeTab,
    onTabChange,
    username,
    onLogout,
}: AppLayoutProps) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleSelectTab = (tab: NavTab) => {
        onTabChange(tab);
        setIsMobileMenuOpen(false);
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col md:flex-row transition-colors">

            {/* DESKTOP SIDEBAR */}
            <aside className="hidden md:flex md:w-64 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 shrink-0 transition-colors">
                <div className="px-2 mb-8">
                    <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 tracking-tight">
                        Habit Tracker
                    </div>
                    {username && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Logged in as <span className="font-medium text-indigo-600 dark:text-indigo-400">{username}</span>
                        </p>
                    )}
                </div>

                <nav className="space-y-1.5 flex-1">
                    <SidebarButton
                        label="Dashboard"
                        active={activeTab === 'dashboard'}
                        onClick={() => handleSelectTab('dashboard')}
                    />
                    <SidebarButton
                        label="My Habits"
                        active={activeTab === 'habits'}
                        onClick={() => handleSelectTab('habits')}
                    />
                    <SidebarButton
                        label="Categories"
                        active={activeTab === 'categories'}
                        onClick={() => handleSelectTab('categories')}
                    />
                    <SidebarButton
                        label="Goals"
                        active={activeTab === 'goals'}
                        onClick={() => handleSelectTab('goals')}
                    />
                    <SidebarButton
                        label="Analytics"
                        active={activeTab === 'analytics'}
                        onClick={() => handleSelectTab('analytics')}
                    />
                    <SidebarButton
                        label="Settings"
                        active={activeTab === 'settings'}
                        onClick={() => handleSelectTab('settings')}
                    />
                </nav>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <button
                        onClick={onLogout}
                        className="w-full px-3 py-2 text-left text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                    >
                        Log Out
                    </button>
                </div>
            </aside>

            {/* MOBILE TOP NAVBAR */}
            <header className="md:hidden flex items-center justify-between bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 sticky top-0 z-20 transition-colors">
                <div>
                    <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                        Habit Tracker
                    </span>
                    {username && (
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({username})</span>
                    )}
                </div>
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
                    aria-label="Toggle Menu"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {isMobileMenuOpen ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        )}
                    </svg>
                </button>
            </header>

            {/* MOBILE DROPDOWN MENU */}
            {isMobileMenuOpen && (
                <div className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 space-y-1.5 shadow-md">
                    <MobileNavButton
                        label="Dashboard"
                        active={activeTab === 'dashboard'}
                        onClick={() => handleSelectTab('dashboard')}
                    />
                    <MobileNavButton
                        label="My Habits"
                        active={activeTab === 'habits'}
                        onClick={() => handleSelectTab('habits')}
                    />
                    <MobileNavButton
                        label="Categories"
                        active={activeTab === 'categories'}
                        onClick={() => handleSelectTab('categories')}
                    />
                    <MobileNavButton
                        label="Goals"
                        active={activeTab === 'goals'}
                        onClick={() => handleSelectTab('goals')}
                    />
                    <MobileNavButton
                        label="Analytics"
                        active={activeTab === 'analytics'}
                        onClick={() => handleSelectTab('analytics')}
                    />
                    <MobileNavButton
                        label="Settings"
                        active={activeTab === 'settings'}
                        onClick={() => handleSelectTab('settings')}
                    />
                    <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                        <button
                            onClick={onLogout}
                            className="w-full text-left px-3 py-2 rounded-lg text-base font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                        >
                            Log Out
                        </button>
                    </div>
                </div>
            )}

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto">
                    {children}
                </div>
            </main>

        </div>
    );
}

function SidebarButton({
    label,
    active,
    onClick,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active
                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60'
                }`}
        >
            {label}
        </button>
    );
}

function MobileNavButton({
    label,
    active,
    onClick,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-base font-medium transition-colors ${active
                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60'
                }`}
        >
            {label}
        </button>
    );
}