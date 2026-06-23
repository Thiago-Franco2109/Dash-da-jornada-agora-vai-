import { useState } from 'react';
import { useAuth } from '../context/AuthContext';


export default function LoginPage() {
    const { login } = useAuth();
    const [keepLoggedIn, setKeepLoggedIn] = useState(true);

    const handleLogin = () => {
        if (keepLoggedIn) {
            localStorage.setItem("want_keep_logged_in", "true");
        } else {
            localStorage.removeItem("want_keep_logged_in");
        }
        login();
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-[#0d1f35] to-[#0a1628] p-4">
            {/* Background glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Card */}
                <div
                    className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl"
                    style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)' }}
                >
                    {/* Logo / Title */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 mb-4">
                            <span className="material-symbols-outlined text-primary text-3xl">route</span>
                        </div>
                        <h1 className="text-2xl font-bold text-white">Jornada do Parceiro</h1>
                        <p className="text-slate-400 text-sm mt-1">Acesso seguro ao painel de monitoramento</p>
                    </div>

                    <div className="space-y-4">
                        <button
                            onClick={handleLogin}
                            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white hover:bg-slate-100 text-slate-800 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 focus:ring-offset-transparent shadow-lg"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Entrar com Google
                        </button>
                        
                        <label className="flex items-center gap-2 cursor-pointer mt-4">
                            <input 
                                type="checkbox" 
                                checked={keepLoggedIn}
                                onChange={(e) => setKeepLoggedIn(e.target.checked)}
                                className="w-4 h-4 rounded border-white/20 bg-white/10 text-primary focus:ring-primary/50 focus:ring-offset-0"
                            />
                            <span className="text-sm text-slate-300">Permanecer logado</span>
                        </label>
                    </div>

                    {/* Security hint */}
                    <div className="mt-8 pt-6 border-t border-white/10 text-center">
                        <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px]">lock</span>
                            Autenticação via Bigou Sheets Gateway
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
