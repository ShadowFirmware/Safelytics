"use client";

import { AcceslyProvider } from "accesly";

const appId = process.env.NEXT_PUBLIC_ACCESLY_APP_ID;

export default function Providers({ children }: { children: React.ReactNode }) {
  if (!appId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-zinc-50 dark:bg-black text-zinc-800 dark:text-zinc-200">
        <p className="text-center max-w-md text-sm">
          Falta <code className="font-mono">NEXT_PUBLIC_ACCESLY_APP_ID</code> en{" "}
          <code className="font-mono">.env.local</code>. Copia{" "}
          <code className="font-mono">web/.env.example</code> y completa el ID desde el dashboard de
          Accesly.
        </p>
      </div>
    );
  }

  return <AcceslyProvider appId={appId}>{children}</AcceslyProvider>;
}
