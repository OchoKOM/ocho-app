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
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");

  // On utilise une ref pour éviter les fermetures (closures) obsolètes dans les listeners socket
  const roomsRef = useRef<RoomData[]>([]);

  // Synchroniser la ref avec l'état
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  // --- LOGIQUE WEBSOCKET ---

  // 1. Fonction pour demander des rooms au serveur
  const fetchRooms = useCallback((nextCursor: string | null = null) => {
    if (!socket || !isConnected) return;

    if (nextCursor) setIsFetchingMore(true);
    else setIsLoading(true);

    // Émission de l'événement au serveur
    socket.emit("get_rooms", {
      cursor: nextCursor,
      limit: 15 // Taille de la page
    });
  }, [socket, isConnected]);

  // 2. Initialisation et écouteurs d'événements
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Listener: Réception de la liste paginée
    const handleRoomsResponse = (response: { rooms: RoomData[], nextCursor: string | null }) => {
      
      setRooms((prev) => {
        // STRATÉGIE : Si le premier élément de la réponse est déjà présent 
        // ou si nous savons que nous sommes sur une page suivante via une ref

        // On utilise une approche basée sur l'unicité des IDs
        const existingIds = new Set(prev.map(r => r.id));
        const newRooms = response.rooms.filter(r => !existingIds.has(r.id));

        // Si la liste actuelle est vide, c'est une initialisation
        if (prev.length === 0) return response.rooms;

        // Sinon, on ajoute à la suite (Pagination)
        // Note : On peut aussi vérifier si response.rooms contient la room "saved-" 
        // pour savoir si c'est la page 1 (car elle est injectée par le serveur sur cursor: null)
        const isFirstPage = response.rooms.some(r => r.id.startsWith('saved-'));

        if (isFirstPage) {
          return response.rooms; // Refresh complet de la page 1
        }

        return [...prev, ...newRooms];
      });

      setCursor(response.nextCursor);
      setHasMore(!!response.nextCursor);
      setStatus("success");
      setIsLoading(false);
      setIsFetchingMore(false);
    };

    // Listener: Mise à jour temps réel (Nouveau message, nouvelle room créée ailleurs, etc.)
    const handleRoomUpdate = (updatedRoom: RoomData) => {
      
      setRooms((prev) => {
        // On retire l'ancienne version de la room (si elle existe)
        const otherRooms = prev.filter((r) => r.id !== updatedRoom.id);
        // On place la room mise à jour tout en haut
        return [...otherRooms, updatedRoom];
      });
    };

    // Listener: Gestion des erreurs
    const handleError = () => {
      setStatus("error");
      setIsLoading(false);
      setIsFetchingMore(false);
    };

    socket.on("rooms_list_data", handleRoomsResponse);
    socket.on("room_list_updated", handleRoomUpdate); // Le serveur doit émettre ceci quand un message arrive
    socket.on("new_room_created", handleRoomUpdate);
    socket.on("error_fetching_rooms", handleError);

    // Charger la première page au montage ou à la reconnexion
    fetchRooms(null);

    return () => {
      socket.off("rooms_list_data", handleRoomsResponse);
      socket.off("room_list_updated", handleRoomUpdate);
      socket.off("new_room_created", handleRoomUpdate);
      socket.off("error_fetching_rooms", handleError);
    };
  }, [socket, isConnected]); // Retirez fetchRooms des dépendances pour éviter boucle infinie si mal géré, ou utilisez useRef

  // --- GESTION DE LA SÉLECTION INITIALE ---
  useEffect(() => {
    if (status === "success" && activeRoomId && rooms.length > 0) {
      const room = rooms.find((r) => r.id === activeRoomId);
      if (room) {
        // Mise à jour silencieuse pour ne pas re-déclencher de navigation inutile
        // Si besoin de logique spécifique ici
      }
    }
  }, [rooms, status, activeRoomId]);

  function handleRoomSelect(room: RoomData) {
    onCloseChat();
    onRoomSelect(room.id);
    activeRoom(room);
    setActiveRoomId(room.id);
  }

  // Redirection si liste vide chargée
  if (status === "success" && !rooms.length) {
    // Attention: ceci peut causer des boucles si mal géré, vérifier pathname
    // onCloseChat(); 
  }

  if (status === "success" && !activeRoomId && pathname === "/messages/chat") {
    navigate("/messages");
  }

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
          if (hasMore && !isFetchingMore && !isLoading) {
            fetchRooms(cursor); // Charger la page suivante
          }
        }}
      >
        {/* Loading Initial */}
        {status === "pending" && isLoading && <RoomsLoadingSkeleton />}

        {/* Empty State */}
        {status === "success" && !rooms.length && (
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
        {status === "error" && (
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

        {/* Loading More Spinner */}
        {isFetchingMore && (
          <div className="flex w-full justify-center p-4">
            <Loader2 className="mx-auto animate-spin" />
          </div>
        )}
      </InfiniteScrollContainer>

      <div
        className="fixed bottom-20 right-5 aspect-square h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-foreground hover:text-primary flex sm:absolute sm:bottom-5"
        onClick={onNewChat}
        title={startNewChat}
      >
        <SquarePen />
      </div>
    </div>
  );
}