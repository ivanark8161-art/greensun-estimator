export {};

declare global {
  interface Window {
    electronAPI?: {
      getToken: () => Promise<string | null>;
      getUser: () => Promise<{ email: string; name: string } | null>;
      logout: () => Promise<void>;
      isElectron: true;
    };
  }
}
