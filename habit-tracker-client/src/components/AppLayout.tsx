import React, { useState } from 'react';

export type NavTab = 'dashboard' | 'habits' | 'categories' | 'goals' | 'analytics' | 'settings';

interface AppLayoutProps {
    children: React.ReactNode;
    activeTab: NavTab;
    onTabChange: (tab: NavTab) => void;
    username: string | null;
    avatarUrl?: string | null;
    onLogout: () => void;
}

type BottomTabKey = 'dashboard' | 'habits' | 'add' | 'analytics' | 'goals';

export default function AppLayout({
    children,
    activeTab,
    onTabChange,
    username,
    avatarUrl,
    onLogout,
}: AppLayoutProps) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleSelectTab = (tab: NavTab) => {
        onTabChange(tab);
        setIsMobileMenuOpen(false);
    };

    const greeting = (() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    })();

    const navItems: { tab: NavTab; label: string; icon: React.ReactNode }[] = [
        {
            tab: 'dashboard',
            label: 'Dashboard',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
            ),
        },
        {
            tab: 'habits',
            label: 'My Habits',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
            ),
        },
        {
            tab: 'categories',
            label: 'Categories',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
            ),
        },
        {
            tab: 'goals',
            label: 'Goals',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            ),
        },
        {
            tab: 'analytics',
            label: 'Analytics',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
        },
    ];

    const settingsIcon = (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    );

    const mobileSidebarItems: { tab: NavTab; label: string; icon: React.ReactNode }[] = [
        ...navItems,
        { tab: 'settings', label: 'Settings', icon: settingsIcon },
    ];

    const bottomTabs: { key: BottomTabKey; targetTab: NavTab; label: string; icon: React.ReactNode }[] = [
        {
            key: 'dashboard',
            targetTab: 'dashboard',
            label: 'Dashboard',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />
                </svg>
            ),
        },
        {
            key: 'habits',
            targetTab: 'habits',
            label: 'My Habits',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
            ),
        },
        {
            key: 'add',
            targetTab: 'habits',
            label: 'Add',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 5v14m7-7H5" />
                </svg>
            ),
        },
        {
            key: 'analytics',
            targetTab: 'analytics',
            label: 'Analytics',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M4 17l5-5 4 4 7-8" />
                </svg>
            ),
        },
        {
            key: 'goals',
            targetTab: 'goals',
            label: 'Goals',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            ),
        },
    ];

    const activeBottomIndex = (() => {
        if (activeTab === 'dashboard') return 0;
        if (activeTab === 'habits') return 1;
        if (activeTab === 'analytics') return 3;
        if (activeTab === 'goals') return 4;
        return -1;
    })();

    const notchCenterPercent = activeBottomIndex >= 0 ? activeBottomIndex * 20 + 10 : 50;

    return (
        <div className="min-h-dvh w-full max-w-full overflow-x-hidden md:h-screen md:overflow-hidden bg-gray-50 dark:bg-[#0c0d10] flex flex-col md:flex-row transition-colors">
            {/* DESKTOP SIDEBAR */}
            <aside
                className={`hidden md:flex ${isCollapsed ? 'md:w-20' : 'md:w-64'
                    } relative md:h-screen md:sticky md:top-0 overflow-y-auto overscroll-contain flex-col bg-white dark:bg-[#1e1f26] text-gray-700 dark:text-slate-200 border-r border-gray-200 dark:border-white/10 p-4 shrink-0 transition-all duration-300`}
            >
                <button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className="absolute -right-3 top-7 z-10 w-6 h-6 rounded-full bg-white dark:bg-[#282a34] border border-gray-200 dark:border-white/15 text-gray-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white flex items-center justify-center shadow-sm transition-colors"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d={isCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}
                        />
                    </svg>
                </button>

                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-1'} mb-7`}>
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt={username || 'User avatar'}
                            className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-indigo-500/25 dark:ring-emerald-400/35 shadow-xs"
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm flex items-center justify-center shrink-0 ring-2 ring-indigo-500/20 dark:ring-white/15 shadow-xs">
                            {(username?.[0] || 'H').toUpperCase()}
                        </div>
                    )}
                    {!isCollapsed && (
                        <div className="min-w-0">
                            <p className="text-[11px] font-medium text-gray-400 dark:text-slate-400">
                                {greeting} 👋
                            </p>
                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                {username || 'Habit Tracker'}
                            </p>
                        </div>
                    )}
                </div>

                <div className={`mb-2 ${isCollapsed ? 'text-center' : 'px-3'}`}>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                        {isCollapsed ? 'Menu' : `Menu • ${navItems.length}`}
                    </span>
                </div>

                <nav className="space-y-1 flex-1">
                    {navItems.map((item) => (
                        <SidebarButton
                            key={item.tab}
                            label={item.label}
                            icon={item.icon}
                            active={activeTab === item.tab}
                            collapsed={isCollapsed}
                            onClick={() => handleSelectTab(item.tab)}
                        />
                    ))}
                </nav>

                <div className="mt-4 mb-3 p-3 rounded-2xl bg-gray-50/90 dark:bg-white/4 border border-gray-200/80 dark:border-white/10 text-center">
                    <button
                        type="button"
                        onClick={() => handleSelectTab('habits')}
                        title="Create new habit"
                        className="mx-auto w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-[0_0_14px_rgba(79,70,229,0.45)] transition-transform hover:scale-105"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                    {!isCollapsed && (
                        <div className="mt-2">
                            <p className="text-xs font-semibold text-gray-800 dark:text-white">
                                Create new habit
                            </p>
                            <p className="text-[11px] text-gray-400 dark:text-slate-400">
                                Build your daily routine
                            </p>
                        </div>
                    )}
                </div>

                <div
                    className={`flex ${isCollapsed ? 'flex-col gap-1.5' : 'items-center justify-between gap-1.5'
                        } p-1.5 rounded-xl bg-gray-100/80 dark:bg-white/4 border border-gray-200/70 dark:border-white/10`}
                >
                    <button
                        type="button"
                        onClick={() => handleSelectTab('settings')}
                        title="Settings"
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors ${activeTab === 'settings'
                            ? 'bg-white dark:bg-white/10 text-indigo-600 dark:text-white shadow-xs'
                            : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                    >
                        {settingsIcon}
                        {!isCollapsed && <span>Settings</span>}
                    </button>

                    <button
                        type="button"
                        onClick={onLogout}
                        title="Log Out"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    >
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        {!isCollapsed && <span>Log Out</span>}
                    </button>
                </div>
            </aside>

            {/* MOBILE TOP NAVBAR */}
            <header className="md:hidden flex items-center justify-between bg-white/95 dark:bg-[#13151c]/95 backdrop-blur-md border-b border-gray-200 dark:border-white/10 px-4 py-3 sticky top-0 z-30 transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt={username || 'User avatar'}
                            className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-indigo-500/30 dark:ring-emerald-400/35"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                            {(username?.[0] || 'H').toUpperCase()}
                        </div>
                    )}
                    <div className="truncate">
                        <span className="text-base font-bold text-gray-900 dark:text-white">
                            Habit Tracker
                        </span>
                        {username && (
                            <span className="ml-1.5 text-xs text-gray-500 dark:text-slate-400">
                                ({username})
                            </span>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="p-2 rounded-xl bg-gray-100/80 dark:bg-white/6 border border-gray-200/80 dark:border-white/10 text-gray-700 dark:text-slate-200 hover:bg-gray-200/70 dark:hover:bg-white/10 focus:outline-none transition-colors"
                    aria-label="Open Navigation Drawer"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            </header>

            {/* MOBILE SLEEK SLIDE-OVER SIDEBAR DRAWER */}
            <div
                className={`md:hidden fixed inset-0 z-50 transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    }`}
            >
                {/* Frosted Backdrop */}
                <div
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="absolute inset-0 bg-black/65 backdrop-blur-xs"
                />

                {/* Floating Rounded Sidebar Card */}
                <aside
                    className={`absolute top-3 right-3 bottom-3 w-64 max-w-[82vw] rounded-[26px] bg-white dark:bg-[#17181d] border border-gray-200/90 dark:border-white/10 shadow-2xl p-3.5 flex flex-col justify-between transition-transform duration-300 ease-out ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-[112%]'
                        }`}
                >
                    <div>
                        {/* User Profile Row + Close Button */}
                        <div className="flex items-center justify-between gap-2.5 px-1.5 pt-1 pb-3.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt={username || 'User avatar'}
                                        className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-gray-300 dark:ring-white/20"
                                    />
                                ) : (
                                    <div className="w-9 h-9 rounded-full border border-gray-300 dark:border-white/20 bg-gray-100 dark:bg-white/5 text-gray-800 dark:text-white font-bold text-xs flex items-center justify-center shrink-0">
                                        {(username?.[0] || 'H').toUpperCase()}
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                        {username || 'Habit Tracker'}
                                    </p>
                                    <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                                        {username ? `@${username}` : greeting}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsMobileMenuOpen(false)}
                                aria-label="Close Navigation Drawer"
                                className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/6 text-gray-500 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white flex items-center justify-center shrink-0 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Navigation Items with Sleek Inverted Active Pill */}
                        <nav className="space-y-1 mt-1">
                            {mobileSidebarItems.map((item) => {
                                const isActive = activeTab === item.tab;
                                return (
                                    <button
                                        key={item.tab}
                                        type="button"
                                        onClick={() => handleSelectTab(item.tab)}
                                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-[14px] text-sm font-semibold transition-all ${isActive
                                            ? 'bg-gray-900 text-white dark:bg-white dark:text-[#141519] shadow-sm'
                                            : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/6'
                                            }`}
                                    >
                                        <span className="shrink-0">{item.icon}</span>
                                        <span className="truncate">{item.label}</span>
                                    </button>
                                );
                            })}
                        </nav>
                    </div>

                    {/* Bottom Divider + Log Out */}
                    <div className="pt-3 border-t border-gray-200/80 dark:border-white/10">
                        <button
                            type="button"
                            onClick={() => {
                                setIsMobileMenuOpen(false);
                                onLogout();
                            }}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-[14px] text-sm font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        >
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            <span>Log Out</span>
                        </button>
                    </div>
                </aside>
            </div>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 w-full max-w-full overflow-x-hidden md:h-screen p-4 sm:p-6 lg:p-8 pb-safe-bottom md:pb-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto w-full">
                    {children}
                </div>
            </main>

            {/* MOBILE 5-TAB CONCAVE-NOTCH BOTTOM NAVIGATION BAR */}
            <nav
                aria-label="Mobile Bottom Navigation"
                className={`md:hidden fixed left-3 right-3 z-40 mobile-nav-wrap transition-all duration-300 ${isMobileMenuOpen ? 'opacity-35 scale-[0.97] pointer-events-none' : 'opacity-100 scale-100'
                    }`}
            >
                <div className="relative h-17 mx-auto max-w-md">
                    {/* Floating Lifted Emerald Orb */}
                    {activeBottomIndex >= 0 && (
                        <div
                            style={{ left: `${notchCenterPercent}%` }}
                            className="absolute -top-5 -translate-x-1/2 w-12.5 h-12.5 rounded-full bg-emerald-500 text-[#07130e] flex items-center justify-center shadow-[0_10px_24px_rgba(16,185,129,0.42)] ring-4 ring-gray-50 dark:ring-[#0c0d10] transition-all duration-300 ease-out z-20 pointer-events-none"
                        >
                            {bottomTabs[activeBottomIndex].icon}
                        </div>
                    )}

                    {/* Pill Track with Dynamic Concave Cutout */}
                    <div
                        style={
                            activeBottomIndex >= 0
                                ? {
                                    WebkitMaskImage: `radial-gradient(circle 33px at ${notchCenterPercent}% 0px, transparent 32px, black 33px)`,
                                    maskImage: `radial-gradient(circle 33px at ${notchCenterPercent}% 0px, transparent 32px, black 33px)`,
                                }
                                : undefined
                        }
                        className="relative h-full w-full rounded-3xl bg-white/95 dark:bg-[#181b24]/95 backdrop-blur-xl border border-gray-200/90 dark:border-white/10 shadow-[0_14px_34px_rgba(0,0,0,0.35)] grid grid-cols-5 items-center px-1"
                    >
                        {bottomTabs.map((tab, idx) => {
                            const isActive = idx === activeBottomIndex;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => handleSelectTab(tab.targetTab)}
                                    className="h-full flex flex-col items-center justify-center pt-1.5 pb-1 focus:outline-none select-none"
                                >
                                    <span
                                        className={`transition-all duration-200 ${isActive
                                            ? 'opacity-0 -translate-y-2 scale-75'
                                            : 'opacity-100 translate-y-0 text-gray-500 dark:text-slate-400'
                                            }`}
                                    >
                                        {tab.icon}
                                    </span>
                                    <span
                                        className={`mt-1 text-[10px] tracking-tight transition-colors ${isActive
                                            ? 'font-bold text-emerald-600 dark:text-emerald-400'
                                            : 'font-medium text-gray-500 dark:text-slate-400'
                                            }`}
                                    >
                                        {tab.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </nav>
        </div>
    );
}

function SidebarButton({
    label,
    active,
    collapsed,
    icon,
    onClick,
}: {
    label: string;
    active: boolean;
    collapsed: boolean;
    icon: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={collapsed ? label : undefined}
            className={`relative w-full flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'
                } py-2.5 rounded-xl text-sm font-medium transition-all ${active
                    ? 'bg-indigo-50/90 text-indigo-700 dark:bg-white/[0.07] dark:text-white shadow-xs'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100/80 dark:hover:bg-white/4 hover:text-gray-900 dark:hover:text-slate-200'
                }`}
        >
            {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-indigo-600 dark:bg-emerald-400 shadow-[0_0_8px_rgba(79,70,229,0.5)] dark:shadow-[0_0_10px_#34d399]" />
            )}
            <span className="shrink-0">{icon}</span>
            {!collapsed && <span className="truncate">{label}</span>}
        </button>
    );
}