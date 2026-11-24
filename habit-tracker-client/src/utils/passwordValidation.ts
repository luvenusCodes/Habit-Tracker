export interface PasswordRuleResult {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasSpecial: boolean;
    isValid: boolean;
}

export const evaluatePassword = (password: string): PasswordRuleResult => {
    const minLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    return {
        minLength,
        hasUppercase,
        hasLowercase,
        hasSpecial,
        isValid: minLength && hasUppercase && hasLowercase && hasSpecial,
    };
};

export const getPasswordErrorMessage = (password: string): string | null => {
    const res = evaluatePassword(password);
    if (!res.minLength) return 'Password must be at least 8 characters long.';
    if (!res.hasUppercase) return 'Password must contain at least one uppercase letter.';
    if (!res.hasLowercase) return 'Password must contain at least one lowercase letter.';
    if (!res.hasSpecial) return 'Password must contain at least one special character (e.g. !@#$%^&*).';
    return null;
};