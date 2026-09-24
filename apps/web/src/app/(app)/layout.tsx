import { WorkspaceLayout } from "@/components/shared/app-shell";

export default function AuthenticatedLayout({ children }: LayoutProps<"/">) {
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
}
