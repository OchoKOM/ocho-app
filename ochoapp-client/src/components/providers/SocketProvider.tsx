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

// Définition des types pour le contexte
interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  onlineStatus: Record<string, { isOnline: boolean; lastSeen?: Date }>;
  checkUserStatus: (userId: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
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

    // 2. Si un socket existe déjà avec le MÊME token, on ne fait rien.
    // Si le token a changé, le useEffect se relance, donc on passe à la suite pour recréer.
    if (socketRef.current) {
       // On vérifie si le socket est déjà connecté ou en cours de connexion
       // On pourrait potentiellement mettre à jour l'auth ici, mais il est plus sûr de recréer pour React.
       // Pour cet exemple, on suppose que si le token change, le nettoyage du tour précédent a déjà tué l'ancien socket.
    }

    // Drapeau pour empêcher les actions "zombies" lors du démontage
    let isComponentUnmounted = false;

    setIsConnecting(true);
    setShowStatus(true);

    // 3. Initialisation du Socket
    console.log("🔄 Initialisation d'une nouvelle connexion Socket...");
    const socketInstance = io(
      process.env.NEXT_PUBLIC_CHAT_SERVER_URL || "http://localhost:5000",
      {
        auth: { token: token },
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        transports: ["websocket", "polling"], 
        closeOnBeforeunload: true,
        // forceNew: true, // Parfois utile pour forcer une nouvelle instance, mais io() le fait généralement déjà
      }
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

      // CORRECTION MAJEURE ICI :
      // Si "io server disconnect", on ne reconnecte MANUELLEMENT que si le composant est toujours monté
      // et on évite de le faire si le token risque d'être invalide.
      if (isServerDisconnect) {
        // Au lieu de reconnecter aveuglément, on vérifie si le token est toujours là.
        // Souvent, une déconnexion serveur signifie que le token est expiré.
        // Si le token est valide, on tente la reconnexion.
        if (token) {
            console.log("⚠️ Tentative de reconnexion manuelle suite à déconnexion serveur...");
            socketInstance.connect();
        }
      }
    };

    const onConnectError = (err: Error) => {
      if (isComponentUnmounted) return;
      console.warn("⚠️ WS Erreur connexion:", err.message);
      setIsConnected(false);
      // On laisse le loader actif car socket.io va réessayer (reconnection: true)
    };

    // Événements Métiers
    const onUserStatusChange = (data: { userId: string; isOnline: boolean; lastSeen?: string }) => {
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
      toast({ description: "Vous avez été ajouté à une nouvelle discussion." });
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
      console.log("🧹 Nettoyage complet du socket (ID:", socketInstance.id, ")");
      
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
  // Dépendances : Si user ou token change, on détruit tout et on recommence proprement.

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        onlineStatus,
        checkUserStatus,
      }}
    >
      <div
        className={cn(
          "fixed bottom-4 right-4 z-50 transform transition-all duration-500 ease-in-out pointer-events-none",
          showStatus
            ? "translate-y-0 opacity-100"
            : "translate-y-10 opacity-0"
        )}
      >
        {isConnected ? (
          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-900 dark:border-emerald-800 shadow-md">
            <Wifi className="h-4 w-4" />
            <span className="text-xs font-semibold">Connexion établie</span>
          </div>
        ) : isConnecting ? (
          <div className="flex animate-pulse items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-amber-600 dark:text-amber-400 dark:bg-amber-900 dark:border-amber-800 shadow-md">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs font-semibold">
              Reconnexion...
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-red-600 dark:text-red-400 dark:bg-red-900 dark:border-red-800 shadow-md">
            <WifiOff className="h-4 w-4" />
            <span className="text-xs font-semibold">Hors ligne</span>
          </div>
        )}
      </div>
      {children}
    </SocketContext.Provider>
  );
}