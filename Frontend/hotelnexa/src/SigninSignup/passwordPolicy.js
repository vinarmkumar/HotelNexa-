export function isPasswordValid(password) {
  return password.length >= 8 && password.length <= 128
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && /[@#$%^&*]/.test(password);
}
