import React, { useMemo, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

const AuthScreen = ({ onLogin, onSignUp, isLoading }) => {
    const { theme } = useTheme();
    const [mode, setMode] = useState('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const title = useMemo(() => (mode === 'login' ? 'Sign in to ChillView' : 'Create your ChillView account'), [mode]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || !normalizedEmail.includes('@')) {
            setError('Please enter a valid email.');
            return;
        }
        if (!password || password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }

        if (mode === 'signup') {
            if (!name.trim() || name.trim().length < 2) {
                setError('Name must be at least 2 characters.');
                return;
            }
        }

        try {
            if (mode === 'login') {
                await onLogin({ email: normalizedEmail, password });
            } else {
                await onSignUp({ name: name.trim(), email: normalizedEmail, password });
            }
        } catch (err) {
            setError(err?.message || 'Authentication failed. Please try again.');
        }
    };

    return (
        <div className={`min-h-screen flex items-center justify-center p-6 ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-800'}`}>
            <div className={`w-full max-w-md rounded-2xl border p-8 shadow-sm ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h1 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h1>
                <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    Use your account to access data sources, reports, and dashboard sharing.
                </p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    {mode === 'signup' && (
                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Name</label>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your full name"
                                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                            />
                        </div>
                    )}

                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@company.com"
                            className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="At least 8 characters"
                            className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                        />
                    </div>

                    {error && (
                        <div className={`text-sm rounded-lg px-3 py-2 ${theme === 'dark' ? 'bg-rose-900/30 text-rose-300 border border-rose-800' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-800 text-white hover:bg-gray-900'}`}
                    >
                        {isLoading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <div className="mt-5 text-sm text-center">
                    {mode === 'login' ? (
                        <button type="button" onClick={() => setMode('signup')} className={theme === 'dark' ? 'text-gray-300 hover:text-gray-100' : 'text-gray-600 hover:text-gray-900'}>
                            New here? Create an account
                        </button>
                    ) : (
                        <button type="button" onClick={() => setMode('login')} className={theme === 'dark' ? 'text-gray-300 hover:text-gray-100' : 'text-gray-600 hover:text-gray-900'}>
                            Already have an account? Sign in
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuthScreen;
