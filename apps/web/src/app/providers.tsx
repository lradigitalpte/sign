"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <AuthKitProvider>
      <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange enableSystem>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ThemeProvider>
    </AuthKitProvider>
  );
}
