import type { ReactNode } from "react";

import { SettingsScopeBreadcrumb } from "@/components/settings/settings-scope-breadcrumb";
import { UnifiedSettingsSidebar } from "@/components/settings/unified-settings-sidebar";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div data-settings-layout className="flex h-full w-full overflow-hidden">
      {/* Full-height Standalone Settings Sidebar */}
      <aside className="settings-sidebar-scroll hidden w-72 shrink-0 overflow-y-auto border-r border-border/70 bg-card/70 p-5 backdrop-blur-sm md:block">
        <UnifiedSettingsSidebar />
      </aside>

      {/* Main Settings Content Area */}
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-4xl">
          <SettingsScopeBreadcrumb />
          {children}
        </div>
      </main>
    </div>
  );
}
