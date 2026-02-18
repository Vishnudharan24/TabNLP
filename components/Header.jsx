
import React from 'react';
import { Bell, HelpCircle, Layout, Search, Settings, Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const Header = () => {
    const { theme, toggleTheme } = useTheme();

    return (
        <header className="h-16 glass-panel border-b px-8 flex items-center justify-between sticky top-0 z-50 animate-fade-in dark:border-gray-700">
            <div className="flex items-center gap-8 flex-1">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl flex items-center justify-center shadow-md transition-all hover:scale-110 active:scale-95 relative overflow-hidden bg-gray-800 dark:bg-gray-200">
                        <Layout className="text-white dark:text-gray-800 relative z-10" size={20} />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-extrabold text-lg tracking-tight leading-none text-gray-800 dark:text-gray-100">TabNLP</span>
                        {/* <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1"></span> */}
                    </div>
                </div>

                <div className="max-w-md w-full relative">
                    <div className="relative group">
                        <input
                            type="text"
                            placeholder="Find visuals, reports or help..."
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-2xl px-11 py-2.5 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 transition-all focus:outline-none focus:ring-2 focus:ring-gray-400/30 dark:focus:ring-gray-500/30 focus:bg-white dark:focus:bg-gray-700 focus:shadow-lg"
                        />
                        <Search size={18} className="absolute left-4 top-2.5 text-gray-400 dark:text-gray-500 group-focus-within:text-gray-600 dark:group-focus-within:text-gray-300 transition-all group-focus-within:scale-110" />
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 pr-4 border-r border-gray-200 dark:border-gray-700">
                    <button
                        onClick={toggleTheme}
                        className="p-2.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl transition-all"
                        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                    >
                        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                    <button className="p-2.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl transition-all relative group">
                        <Bell size={20} className="relative z-10" />
                        <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full border-2 border-white dark:border-gray-800 bg-blue-500 animate-pulse"></div>
                    </button>
                    <button className="p-2.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl transition-all">
                        <HelpCircle size={20} className="relative z-10" />
                    </button>
                </div>
                <div className="flex items-center gap-3 pl-2">
                    <div className="flex flex-col items-end">
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">Local User</span>
                        <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tighter">Editor Access</span>
                    </div>
                    <div className="h-10 w-10 rounded-2xl border-2 border-white dark:border-gray-700 shadow-lg flex items-center justify-center text-white font-bold text-sm transition-all hover:scale-105 cursor-pointer bg-gray-700 dark:bg-gray-500">
                        LU
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
