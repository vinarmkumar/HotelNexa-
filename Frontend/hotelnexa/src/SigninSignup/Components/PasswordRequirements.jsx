import { Check, Circle } from "lucide-react";

const rules = [
  ["length", "At least 8 characters"],
  ["uppercase", "One uppercase letter (A–Z)"],
  ["lowercase", "One lowercase letter (a–z)"],
  ["digit", "One number (0–9)"],
  ["special", "One special character: @ # $ % ^ & *"],
];

export default function PasswordRequirements({ password }) {
  const checks = {
    length: password.length >= 8 && password.length <= 128,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[@#$%^&*]/.test(password),
  };

  return (
    <ul className="password-requirements" aria-label="Password requirements">
      {rules.map(([rule, label]) => (
        <li key={rule} className={checks[rule] ? "requirement-met" : ""}>
          {checks[rule] ? <Check size={13} aria-hidden="true" /> : <Circle size={11} aria-hidden="true" />}
          {label}
        </li>
      ))}
      <li className="password-example">Example: <strong>Campus@123</strong></li>
    </ul>
  );
}
