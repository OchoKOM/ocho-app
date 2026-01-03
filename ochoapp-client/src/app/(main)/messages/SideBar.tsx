import { RoomData } from "@/lib/types";
import RoomPreview from "./RoomPreview";
import InfiniteScrollContainer from "@/components/InfiniteScrollContainer";
import { useSession } from "../SessionProvider";
import RoomsLoadingSkeleton from "./skeletons/RoomSkeleton";
import { useEffect, useState, useCallback, useRef } from "react";
import { useActiveRoom } from "@/context/ChatContext";
import { Frown, Loader2, MessageSquare, SquarePen } from "lucide-react";
import { usePathname } from "next/navigation";
import { t } from "@/context/LanguageContext";
import { useProgress } from "@/context/ProgressContext";
import { useSocket } from "@/components/providers/SocketProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import kyInstance from "@/lib/ky";

interface SidebarProps {
  activeRoom: (room: RoomData) => void;
  selectedRoomId: string | null;
  onRoomSelect: (roomId: string) => void;
  onNewChat: () => void;
  onCloseChat: () => void;
}

export default function SideBar({
  activeRoom,
  selectedRoomId,
  onRoomSelect,
  onNewChat,
  onCloseChat,
}: SidebarProps) {
  const { user: loggedinUser } = useSession();
  const { activeRoomId, setActiveRoomId } = useActiveRoom();
  const pathname = usePathname();
  const { startNavigation: navigate } = useProgress();
  const { chats, startNewChat, noChat, dataError } = t();

  // --- SOCKET & STATE ---
  const { socket, isConnected } = useSocket();
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null); // Pour la pagination
  const [hasMore, setHasMore] = useState(true);
  
  // Modifié : isLoading commence à true, mais sera contrôlé par HTTP d'abord
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");

  // On utilise une ref pour éviter les fermetures (closures) obsolètes dans les listeners socket
  const roomsRef = useRef<RoomData[]>([]);

  const userId = loggedinUser.id;

  // --- REQUÊTE HTTP (PRIORITAIRE) ---
  const { data: httpRooms, isLoading: isHttpLoading, isError: isHttpError } = useQuery({
    queryKey: ["rooms", "sidebar", userId],
    queryFn: () => kyInstance.get("/api/room-list").json<RoomData[]>(),
    staleTime: 1000 * 60 * 1, 
  });

  useEffect(() => {
    if (httpRooms) {
      setRooms((prev) => {
        // Optimisation : Si on a déjà des rooms (via socket), on ne remplace pas tout brutalement
        // sauf si c'est le premier chargement.
        if (prev.length > 0) return prev;
        return httpRooms;
      });
      
      setStatus("success");
      setIsLoading(false);
    } else if (isHttpError) {
      console.log("");
    }
  }, [httpRooms, isHttpError]);

  // Synchroniser la ref avec l'état pour les listeners sockets
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  // 1. Fonction pour demander des rooms au serveur (Socket)
  // Cette fonction sert désormais principalement pour la pagination et la fraîcheur des données
  const fetchRooms = useCallback(
    (nextCursor: string | null = null) => {
      if (!socket || !isConnected) return;

      if (nextCursor) setIsFetchingMore(true);
      // Note: On ne remet pas isLoading à true ici si on a déjà chargé les données via HTTP

      // Émission de l'événement au serveur
      socket.emit("get_rooms", {
        cursor: nextCursor,
        limit: 15, // Taille de la page
      });
      
      // Nettoyage : quitter les rooms précédentes (optionnel selon votre logique serveur)
      return () => {
        for (const roomId of roomsRef.current.map((r) => r.id)) {
          socket.emit("leave_room", roomId);
        }
      };
    },
    [socket, isConnected],
  );

  // 2. Initialisation et écouteurs d'événements Socket
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Listener: Réception de la liste paginée
    const handleRoomsResponse = (response: {
      rooms: RoomData[];
      nextCursor: string | null;
    }) => {
      setRooms((prev) => {
        // STRATÉGIE HYBRIDE :
        // Le HTTP a peut-être déjà chargé ces rooms. On filtre pour éviter les doublons.
        const existingIds = new Set(prev.map((r) => r.id));
        const newRooms = response.rooms.filter((r) => !existingIds.has(r.id));

        // Si la liste actuelle est vide, on prend tout
        if (prev.length === 0) return response.rooms;

        // Cas spécial "saved-" ou première page
        const isFirstPage = response.rooms.some((r) =>
          r.id.startsWith("saved-"),
        );
        return [...prev, ...newRooms];
      });

      setCursor(response.nextCursor);
      setHasMore(!!response.nextCursor);
      
      // On confirme le succès et la fin du chargement
      setStatus("success");
      setIsLoading(false);
      setIsFetchingMore(false);
    };

    // Listener: Mise à jour temps réel
    const handleRoomUpdate = (updatedRoom: RoomData) => {
      setRooms((prev) => {
        const otherRooms = prev.filter((r) => r.id !== updatedRoom.id);
        return [updatedRoom, ...otherRooms]; // Remonte en haut de la liste
      });
    };

    const handleError = () => {
      // On ne met en erreur que si on n'a AUCUNE donnée affichée (ni HTTP ni Socket)
      if (roomsRef.current.length === 0) {
          setStatus("error");
      }
      setIsLoading(false);
      setIsFetchingMore(false);
    };

    socket.on("rooms_list_data", handleRoomsResponse);
    socket.on("room_list_updated", handleRoomUpdate);
    socket.on("new_room_created", handleRoomUpdate);
    socket.on("error_fetching_rooms", handleError);

    fetchRooms(null);

    return () => {
      socket.off("rooms_list_data", handleRoomsResponse);
      socket.off("room_list_updated", handleRoomUpdate);
      socket.off("new_room_created", handleRoomUpdate);
      socket.off("error_fetching_rooms", handleError);
    };
  }, [socket, isConnected]); // fetchRooms est stable via useCallback, pas besoin de l'ajouter

  // --- GESTION DE LA SÉLECTION INITIALE ---
  useEffect(() => {
    if (status === "success" && rooms.length) {
      if (socket && rooms.length) {
        // Rejoindre les rooms pour écouter les messages
        for (const roomId of rooms.map((r) => r.id)) {
          socket.emit("join_room", roomId);
        }
      }
    }
  }, [rooms, status, socket]); // Ajout de socket et suppression de roomsRef pour utiliser rooms directement

  function handleRoomSelect(room: RoomData) {
    onCloseChat();
    onRoomSelect(room.id);
    activeRoom(room);
    setActiveRoomId(room.id);
  }

  // Redirection si nécessaire (logique existante conservée)
  if (status === "success" && !activeRoomId && pathname === "/messages/chat") {
    navigate("/messages");
  }

  // Calculer l'état de chargement global :
  // On affiche le squelette seulement si on charge HTTP ET qu'on a pas encore de données
  const showSkeleton = (isLoading || isHttpLoading) && rooms.length === 0;

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between p-4 text-lg font-bold shadow-sm max-sm:bg-card/50">
        <span>{chats}</span>
        <span
          className="cursor-pointer hover:text-primary max-sm:hidden"
          title={startNewChat}
          onClick={onNewChat}
        >
          <SquarePen />
        </span>
      </div>

      <InfiniteScrollContainer
        className="relative flex max-w-full flex-1 flex-col space-y-5 overflow-y-auto bg-card/30 sm:bg-background/50"
        onBottomReached={() => {
          // On déclenche le chargement via socket seulement si on a un curseur ou qu'on est pas en train de charger
          if (hasMore && !isFetchingMore && !showSkeleton) {
            fetchRooms(cursor); 
          }
        }}
      >
        {/* Loading Initial : Combine HTTP et Socket states */}
        {showSkeleton && <RoomsLoadingSkeleton />}

        {/* Empty State */}
        {status === "success" && !showSkeleton && !rooms.length && (
          <div className="flex w-full flex-1 select-none items-center px-3 py-8 text-center italic text-muted-foreground">
            <div className="my-8 flex w-full flex-col items-center gap-2 text-center text-muted-foreground">
              <MessageSquare size={150} />
              <h2 className="text-xl">
                {noChat.split("[pen]")[0]}
                <SquarePen className="inline" />
                {noChat.split("[pen]")[1]}
              </h2>
            </div>
          </div>
        )}

        {/* Error State */}
        {status === "error" && rooms.length === 0 && (
          <div className="flex w-full flex-1 select-none items-center px-3 py-8 text-center italic text-muted-foreground">
            <div className="my-8 flex w-full select-none flex-col items-center gap-2 text-center text-muted-foreground">
              <Frown size={150} />
              <h2 className="text-xl">{dataError}</h2>
            </div>
          </div>
        )}

        {/* List of Rooms */}
        {rooms.length > 0 && (
          <ul className="">
            {rooms.map((room) => (
              <RoomPreview
                key={room.id}
                room={room}
                active={selectedRoomId === room.id}
                onSelect={() => handleRoomSelect(room)}
              />
            ))}
          </ul>
        )}

        {/* Loading More Spinner (Pagination Socket) */}
        {isFetchingMore && (
          <div className="flex w-full justify-center p-4">
            <Loader2 className="mx-auto animate-spin" />
          </div>
        )}
      </InfiniteScrollContainer>

      <div
        className="fixed bottom-20 right-5 flex aspect-square h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-foreground hover:text-primary sm:absolute sm:bottom-5"
        onClick={onNewChat}
        title={startNewChat}
      >
        <SquarePen />
      </div>
    </div>
  );
}