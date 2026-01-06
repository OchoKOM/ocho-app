import { validateRequest } from "@/auth";
import { redirect } from "next/navigation";
import SessionProvider from "./SessionProvider";
import { MenuBarProvider } from "@/context/MenuBarContext";
import Navbar from "./Navbar";
import MenuBar from "./MenuBar";
import BottomMenuBar from "@/components/BottomMenuBar";
import { ChatProvider } from "@/context/ChatContext";
import { SearchProvider } from "@/context/SearchContext";
import { NavigationProvider } from "@/context/NavigationContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ProgressProvider } from "@/context/ProgressContext";
import SocketProvider from "@/components/providers/SocketProvider";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await validateRequest();

  if (!session.user) redirect("/login");
  const authToken = session.session.id;

  // On prépare l'objet de session enrichi avec le token
  const sessionValue = {
    ...session,
    token: authToken, // Transmis au client via les props
  };

  return (
          <ProgressProvider>
    <SessionProvider value={sessionValue}>
      {/* Le SocketProvider enveloppe les enfants pour activer le temps réel partout */}
      <LanguageProvider>
        <SocketProvider>
            <NavigationProvider>
              <MenuBarProvider>
                <SearchProvider>
                  <ChatProvider>
                    <div className="max-h-dvh relative flex h-screen w-full flex-col">
                      <Navbar />
                      <div className="relative h-full max-h-full w-full overflow-hidden">
                        <main className="mx-auto flex h-full max-h-full w-full max-w-7xl justify-center gap-5 overflow-auto sm:p-5">
                          <MenuBar className="sticky top-0 hidden h-fit flex-none space-y-3 rounded-2xl bg-card px-3 py-5 sm:block lg:px-5 xl:w-60" />
                          {children}
                        </main>
                      </div>
                      <BottomMenuBar />
                    </div>
                  </ChatProvider>
                </SearchProvider>
              </MenuBarProvider>
            </NavigationProvider>
        </SocketProvider>
      </LanguageProvider>
    </SessionProvider>
          </ProgressProvider>
  );
}
