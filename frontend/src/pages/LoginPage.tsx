import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Lock, LogIn, Mail, Shield, Zap } from 'lucide-react';
import { DEMO_ACCOUNTS, useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@newtonite.io');
  const [password, setPassword] = useState('newtonite123');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid email or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('newtonite123');
    setError(null);
    setIsSubmitting(true);
    try {
      await login(demoEmail, 'newtonite123');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Quick login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 items-center justify-center shadow-xl shadow-amber-500/20 text-black font-black text-2xl font-mono mb-2">
            N
          </div>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-gray-100">
            NEWTONITE<span className="text-accent">OPS</span>
          </h1>
          <p className="text-xs text-gray-400">
            Operations Under Pressure • High-Concurrency Mission Control
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-surface-panel border border-surface-border rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-500/50 text-red-200 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-9 text-xs"
                  placeholder="admin@newtonite.io"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-9 text-xs"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full py-2.5 text-xs flex items-center justify-center space-x-2 font-bold"
            >
              {isSubmitting ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Authenticate to Mission Control</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Access Bar */}
          <div className="mt-6 pt-6 border-t border-surface-border/70">
            <p className="text-[11px] uppercase font-mono font-semibold text-gray-400 mb-3 flex items-center justify-between">
              <span>Quick Login Demo Personas</span>
              <span className="text-[10px] text-accent font-normal">Pass: newtonite123</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.slice(0, 4).map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleQuickLogin(acc.email)}
                  disabled={isSubmitting}
                  className="p-2 rounded-lg bg-surface-bg hover:bg-surface-hover border border-surface-border text-left transition-colors flex flex-col justify-between"
                >
                  <span className="text-xs font-semibold text-gray-200 truncate">{acc.name}</span>
                  <span className="text-[10px] text-accent font-mono truncate">{acc.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-gray-500 font-mono">
          Newtonite Software Engineering Challenge • Full Operational Stack
        </p>
      </div>
    </div>
  );
};
