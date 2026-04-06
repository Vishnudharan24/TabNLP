import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseRecipientEmails = (rawValue = '') => Array.from(new Set(
    String(rawValue || '')
        .split(',')
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean)
));

const RecipientEmailsModal = ({
    isOpen,
    isSubmitting = false,
    title = 'Add Recipients',
    description = 'Enter recipient emails (comma separated).',
    confirmLabel = 'Continue',
    onClose,
    onSubmit,
}) => {
    const { theme } = useTheme();
    const [inputValue, setInputValue] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (!isOpen) {
            setInputValue('');
            setErrorMessage('');
            return;
        }

        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 40);

        return () => clearTimeout(timer);
    }, [isOpen]);

    const recipientEmails = useMemo(() => parseRecipientEmails(inputValue), [inputValue]);

    const handleClose = () => {
        if (isSubmitting) return;
        onClose?.();
    };

    const handleSubmit = async () => {
        if (isSubmitting) return;

        if (recipientEmails.length === 0) {
            setErrorMessage('Please add at least one recipient email.');
            return;
        }

        const invalidEmails = recipientEmails.filter((email) => !EMAIL_REGEX.test(email));
        if (invalidEmails.length > 0) {
            setErrorMessage(`Invalid email: ${invalidEmails[0]}`);
            return;
        }

        setErrorMessage('');

        try {
            await onSubmit?.(recipientEmails);
        } catch (error) {
            setErrorMessage(error?.message || 'Unable to process recipient emails.');
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={handleClose}
        >
            <div
                className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className={`text-base font-bold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
                        <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>{description}</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
                        aria-label="Close"
                    >
                        <X size={16} />
                    </button>
                </div>

                <label className="block mt-4">
                    <span className={`block text-xs font-semibold mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Recipient Emails</span>
                    <textarea
                        ref={inputRef}
                        rows={4}
                        value={inputValue}
                        onChange={(event) => {
                            setInputValue(event.target.value);
                            if (errorMessage) setErrorMessage('');
                        }}
                        placeholder="name@example.com, team@example.com"
                        disabled={isSubmitting}
                        className={`w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${theme === 'dark' ? 'bg-gray-700 text-gray-100 border-gray-600 focus:ring-gray-500' : 'bg-white text-gray-900 border-gray-300 focus:ring-gray-300'}`}
                    />
                </label>

                {errorMessage && (
                    <p className="mt-2 text-sm text-rose-500">{errorMessage}</p>
                )}

                {recipientEmails.length > 0 && !errorMessage && (
                    <p className={`mt-2 text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        {recipientEmails.length} recipient{recipientEmails.length > 1 ? 's' : ''} detected
                    </p>
                )}

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${theme === 'dark' ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-800 text-white hover:bg-gray-900'}`}
                    >
                        {isSubmitting ? 'Processing...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecipientEmailsModal;
