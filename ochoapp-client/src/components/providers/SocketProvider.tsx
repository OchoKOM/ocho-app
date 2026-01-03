"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { io, Socket } from "socket.io-client";
import { useSession } from "@/app/(main)/SessionProvider";
import { toast } from "../ui/use-toast";
import { Loader2, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/context/LanguageContext";
import kyInstance from "@/lib/ky";

// Définition des types pour le contexte
interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  onlineStatus: Record<string, { isOnline: boolean; lastSeen?: Date }>;
  checkUserStatus: (userId: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  isConnecting: false,
  onlineStatus: {},
  checkUserStatus: () => {},
});

// Hook personnalisé pour utiliser le socket
export const useSocket = (userId?: string) => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }

  useEffect(() => {
    // Si on surveille un userId spécifique et qu'on est connecté, on demande son statut
    if (userId && context.isConnected) {
      context.checkUserStatus(userId);
    }
  }, [userId, context.isConnected, context.checkUserStatus]);

  if (userId) {
    return {
      ...context,
      userStatus: context.onlineStatus[userId] || null,
    };
  }
  return context;
};

export default function SocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, token } = useSession();

  // Ref pour stocker l'instance du socket
  const socketRef = useRef<Socket | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState<
    Record<string, { isOnline: boolean; lastSeen?: Date }>
  >({});
  const [isServerTriggered, setIsServerTriggered] = useState(false);

  // Fonction stable pour émettre des événements
  const checkUserStatus = useCallback((targetUserId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("check_user_status", { userId: targetUserId });
    }
  }, []);

  useEffect(() => {
    // 1. Protection basique : pas d'utilisateur ou pas de token = pas de socket
    if (!user || !token) {
      if (socketRef.current) {
        console.log("🛑 Déconnexion (Logout ou pas de token)");
        socketRef.current.removeAllListeners(); // Important : supprime les écouteurs avant de couper
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Drapeau pour empêcher les actions "zombies" lors du démontage
    let isComponentUnmounted = false;

    setIsConnecting(true);
    setShowStatus(true);

    // 3. Initialisation du Socket
    console.log("🔄 Initialisation d'une nouvelle connexion Socket...");
    !isServerTriggered &&
      kyInstance
        .post(
          process.env.NEXT_PUBLIC_CHAT_SERVER_URL || "http://localhost:5000",
        )
        .json<{ message: string }>()
        .then((res) => console.log(res.message))
        .catch((err) => {
          // the server is triggered and wil start in a moment
          console.log(err);
          console.log("The server is triggered and wil start in a moment");
        })
        .finally(() => setIsServerTriggered(true));
    const socketInstance = io(
      process.env.NEXT_PUBLIC_CHAT_SERVER_URL || "http://localhost:5000",
      {
        auth: { token: token },
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ["websocket", "polling"],
        closeOnBeforeunload: true,
        timeout: 5000,
      },
    );

    socketRef.current = socketInstance;

    // 4. Gestionnaires d'événements

    const onConnect = () => {
      if (isComponentUnmounted) return; // Sécurité : ne pas mettre à jour l'état si démonté
      console.log("🟢 WS Connecté :", socketInstance.id);
      setIsConnected(true);
      setIsConnecting(false);

      // On masque le toast de statut après un délai
      setTimeout(() => {
        if (!isComponentUnmounted) setShowStatus(false);
      }, 3000);
    };

    const onDisconnect = (reason: string) => {
      if (isComponentUnmounted) return; // CRUCIAL : Ne rien faire si le composant est en train de se détruire

      console.log("🔴 WS Déconnecté. Raison:", reason);
      setIsConnected(false);

      const isServerDisconnect = reason === "io server disconnect";
      const isTransportError = reason === "transport close";

      if (isServerDisconnect || isTransportError) {
        setShowStatus(true);
        setIsConnecting(true);
      }
    };

    let errors = 0;

    const onConnectError = () => {
      errors++;
      if (errors >= 5) {
        socketInstance.disconnect();
        setIsConnecting(false);
        setShowStatus(true);
      }
    };

    // Événements Métiers
    const onUserStatusChange = (data: {
      userId: string;
      isOnline: boolean;
      lastSeen?: string;
    }) => {
      if (isComponentUnmounted) return;
      setOnlineStatus((prev) => ({
        ...prev,
        [data.userId]: {
          isOnline: data.isOnline,
          lastSeen: data.lastSeen ? new Date(data.lastSeen) : undefined,
        },
      }));
    };

    const onNewRoomCreated = (room: any) => {
      if (isComponentUnmounted) return;
      console.log("📩 Nouvelle discussion :", room);
      socketInstance.emit("join_room", room.id);
      toast({ description: t().youAreAddedToANewRoom });
    };

    // Événements Système (Reconnexion)
    const onReconnectAttempt = () => {
      if (isComponentUnmounted) return;
      console.log("🔄 Tentative de reconnexion auto...");
      setIsConnecting(true);
      setShowStatus(true);
    };

    const onReconnect = () => {
      if (isComponentUnmounted) return;
      console.log("✅ Reconnecté auto !");
      setIsConnected(true);
      setIsConnecting(false);
      setTimeout(() => {
        if (!isComponentUnmounted) setShowStatus(false);
      }, 3000);
    };

    // Attachement des écouteurs
    socketInstance.on("connect", onConnect);
    socketInstance.on("disconnect", onDisconnect);
    socketInstance.on("connect_error", onConnectError);
    socketInstance.on("user_status_change", onUserStatusChange);
    socketInstance.on("new_room_created", onNewRoomCreated);

    // Écouteurs sur le manager (io)
    socketInstance.io.on("reconnect_attempt", onReconnectAttempt);
    socketInstance.io.on("reconnect", onReconnect);

    // 5. Nettoyage (CLEANUP)
    return () => {
      console.log(
        "🧹 Nettoyage complet du socket (ID:",
        socketInstance.id,
        ")",
      );

      // 1. On lève le drapeau pour bloquer toute logique dans les écouteurs ci-dessus
      isComponentUnmounted = true;

      // 2. Suppression de TOUS les écouteurs pour éviter les fuites et les appels fantômes
      socketInstance.removeAllListeners();
      socketInstance.io.off("reconnect_attempt", onReconnectAttempt);
      socketInstance.io.off("reconnect", onReconnect);

      // 3. Déconnexion explicite
      socketInstance.disconnect();

      // 4. Mise à jour de la Ref
      if (socketRef.current === socketInstance) {
        socketRef.current = null;
      }
    };
  }, [user, token]);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        isConnecting,
        onlineStatus,
        checkUserStatus,
      }}
    >
      <div
        className={cn(
          "pointer-events-none fixed bottom-4 right-4 z-50 transform transition-all duration-500 ease-in-out max-sm:bottom-20",
          showStatus ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0",
        )}
      >
        {isConnected ? (
          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-600 shadow-md dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-400">
            <Wifi className="h-4 w-4" />
            <span className="text-xs font-semibold">{t().connected}</span>
          </div>
        ) : isConnecting ? (
          <div className="flex animate-pulse items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-amber-600 shadow-md dark:border-amber-800 dark:bg-amber-900 dark:text-amber-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs font-semibold">{t().reconnecting}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-red-600 shadow-md dark:border-red-800 dark:bg-red-900 dark:text-red-400">
            <WifiOff className="h-4 w-4" />
            <span className="text-xs font-semibold">
              {t().realtimeServerOffline}
            </span>
          </div>
        )}
      </div>
      {children}
    </SocketContext.Provider>
  );
}
