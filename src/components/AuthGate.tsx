interface AuthGateProps {
  loading?: boolean;
  error?: boolean;
}

export default function AuthGate({ loading: _loading, error }: AuthGateProps) {
  function handleQuit() {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.logout();
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#111111]">
        <img src="/logo.png" alt="GreenSun Landscapes" className="mb-6 h-20 w-auto" />
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

  // Default: loading state
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#111111]">
      <img src="/logo.png" alt="GreenSun Landscapes" className="mb-6 h-20 w-auto" />
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
