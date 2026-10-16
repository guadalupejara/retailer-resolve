import { createFileRoute, Outlet } from "@tanstack/react-router";

// No login: every page is open. The current user comes from the profile menu in AppShell.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => <Outlet />,
});
