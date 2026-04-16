import { BottomTabs } from "@/components/nav/bottom-tabs";
import { SideRail } from "@/components/nav/side-rail";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <SideRail />
      <main className="md:pl-60 pb-28 md:pb-10">
        <div className="mx-auto w-full max-w-3xl px-4 pt-safe pt-6 md:pt-10">
          {children}
        </div>
      </main>
      <BottomTabs />
    </div>
  );
}
