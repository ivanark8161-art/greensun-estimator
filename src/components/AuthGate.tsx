interface AuthGateProps {
  loading?: boolean;
  error?: boolean;
  login?: boolean;
  onLogin?: () => void;
}

export default function AuthGate({ loading: _loading, error, login, onLogin }: AuthGateProps) {
  function handleQuit() {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.logout();
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#111111]">
        <img src="./logo.png" alt="GreenSun Landscapes" className="mb-6 h-20 w-auto" />
        <h1 className="mb-2 text-2xl font-bold text-white">GreenSun Estimator</h1>
        <p className="mb-8 text-center text-red-400">
          Access denied. Contact your administrator.
        </p>
        <button
          onClick={handleQuit}
          className="rounded-lg bg-red-600 px-6 py-2 font-semibold text-white hover:bg-red-700 transition-colors"
        >
          Quit
        </button>
      </div>
    );
  }

  if (login) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#111111]">
        <img src="/logo.png" alt="GreenSun Landscapes" className="mb-6 h-20 w-auto" />
        <h1 className="mb-2 text-2xl font-bold text-white">GreenSun Estimator</h1>
        <p className="mb-8 text-gray-400 text-sm">Sign in with your GreenSun Microsoft account</p>
        <button
          onClick={onLogin}
          className="flex items-center gap-3 rounded-lg bg-white px-6 py-3 font-semibold text-gray-800 shadow-lg hover:bg-gray-100 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" className="h-5 w-5">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          Sign in with Microsoft
        </button>
      </div>
    );
  }

  // Default: loading / signing in
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#111111]">
      <img src="./logo.png" alt="GreenSun Landscapes" className="mb-6 h-20 w-auto" />
      <h1 className="mb-2 text-2xl font-bold text-white">GreenSun Estimator</h1>
      <div className="flex items-center gap-3 text-gray-300">
        <svg
          className="h-5 w-5 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="#27AE60"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span>Signing in...</span>
      </div>
    </div>
  );
}
