import { getStaffSession } from "@/lib/actions/staff.actions";
import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { MainMenu } from "@/app/components/modules/MainMenu";
import { SSEProvider } from "@/app/context/SSEContext";
// [CLEANUP] Remove SupabaseAuthProvider import

export default async function SystemLayout({
  children,
}: {
  children: ReactNode;
}) {
  // 1. Auth Check (Server Side)
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const staffInfo = {
    name: session.full_name,
    role: session.role,
    avatar: session.avatar || undefined,
  };

  // 2. Render Layout with Sidebar
  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 overflow-hidden">
      {/* GLOBAL SIDEBAR (Fixed) */}
      <div className="flex-shrink-0 z-50 h-full">
        <MainMenu staffInfo={staffInfo} />
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 relative h-full w-full overflow-hidden">
        {/* [CLEANUP] Remove SupabaseAuthProvider wrapper */}
        <SSEProvider>{children}</SSEProvider>
      </main>
    </div>
  );
}
