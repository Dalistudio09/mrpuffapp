import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MiniApp } from "@/components/mini-app";
import { Storefront } from "@/components/storefront";
import { getStorefront } from "@/lib/shop.functions";

export const Route = createFileRoute("/")({
  loader: () => getStorefront(),
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();
  const [mode, setMode] = useState<"check" | "site" | "tg">("check");

  useEffect(() => {
    let tries = 0;
    const timer = window.setInterval(() => {
      const app = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
      if (app?.initData) {
        setMode("tg");
        window.clearInterval(timer);
        return;
      }
      tries += 1;
      if (tries > 8) {
        setMode("site");
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  if (mode === "check") return null;
  if (mode === "tg") return <MiniApp products={data.products} />;
  return <Storefront products={data.products} whatsappPhone={data.whatsappPhone} />;
}
