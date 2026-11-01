import { createFileRoute } from "@tanstack/react-router";
import { Storefront } from "@/components/storefront";
import { getStorefront } from "@/lib/shop.functions";

export const Route = createFileRoute("/")({
  loader: () => getStorefront(),
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();
  return <Storefront products={data.products} whatsappPhone={data.whatsappPhone} />;
}
