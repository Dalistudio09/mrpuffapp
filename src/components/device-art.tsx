import { cn } from "@/lib/cn";

export function DeviceArt({ brand, className }: { brand: string; className?: string }) {
  return (
    <div className={cn("relative grid h-full place-items-center overflow-hidden bg-canvas", className)} data-brand={brand}>
      <div className="relative h-[78%] w-[46%] rounded-[1.4rem] border border-line bg-panel">
        <div className="absolute inset-x-[28%] -top-[8%] h-[14%] rounded-b-md bg-ink/75" />
        <div className="absolute inset-x-[16%] top-[24%] bottom-[22%] rounded-lg border border-line" />
        <div className="absolute inset-x-[30%] bottom-[9%] h-[7%] rounded-full bg-tide/80" />
      </div>
    </div>
  );
}
