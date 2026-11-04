import { createFileRoute } from "@tanstack/react-router";
import { AdminPanel } from "@/components/admin-panel";
import { adminState } from "@/lib/shop.functions";

export const Route = createFileRoute("/admin")({
  loader: () => adminState(),
  component: AdminPage,
});

function AdminPage() {
  const data = Route.useLoaderData();
  return <AdminPanel initial={data} />;
}
