import { createFileRoute } from "@tanstack/react-router";
import { MiniApp } from "@/components/mini-app";
import { getStorefront } from "@/lib/shop.functions";

export const Route = createFileRoute("/app")({
  loader: () => getStorefront(),
  head: () => ({
    meta: [
      { title: "Mr.Puff" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
    scripts: [{ src: "https://telegram.org/js/telegram-web-app.js" }],
  }),
  component: AppPage,
});

function AppPage() {
  const data = Route.useLoaderData();
  return <MiniApp products={data.products} />;
}
