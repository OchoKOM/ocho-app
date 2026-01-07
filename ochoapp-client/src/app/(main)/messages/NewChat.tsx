import {
  ArrowLeft,
  Check,
  Frown,
  Loader2,
  UsersRound,
  XIcon,
} from "lucide-react";
import { useSession } from "../SessionProvider";
import UserAvatar from "@/components/UserAvatar";
import { useInfiniteQuery } from "@tanstack/react-query";
import kyInstance from "@/lib/ky";
import { UserData, UsersPage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import LoadingButton from "@/components/LoadingButton";
import UsersList from "@/components/messages/UsersList";
import { t } from "@/context/LanguageContext";
import { useSocket } from "@/components/providers/SocketProvider";

const fetchUsers =
  (endpoint: string) =>
  ({ pageParam }: { pageParam: string | null }) =>
    kyInstance
      .get(endpoint, pageParam ? { searchParams: { cursor: pageParam } } : {})
      .json<UsersPage>();

interface NewChatProps {
  onClose: () => void;
  onChatStart: (roomId: string) => void;
  className?: string;
}

export default function NewChat({
  onClose,
  onChatStart,
  className,
}: NewChatProps) {
  const { toast } = useToast();
  const { user: loggedinUser } = useSession();
  const [isGroup, setIsgroup] = useState(false);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<UserData[]>([]);
  const { socket } = useSocket(); // Récupérer le socket
  const [isPending, setIsPending] = useState(false); // Gérer l'état de chargement localement

  const {
    newChat,
    newGroup,
    startNewChat,
    you,
    wait,
    create,
    cancel,
    messageYourself,
    friends,
    followers,
    followings,
    suggestions,
    groupNameOptional,
    waitEndOfOperation,
    unableToSendMessage,
    unableToCreateGroup,
    mustSelectGroupUser,
    dataError,
  } = t([
    "newChat",
    "newGroup",
    "startNewChat",
    "you",
    "wait",
    "create",
    "cancel",
    "messageYourself",
    "friends",
    "followers",
    "followings",
    "suggestions",
    "groupNameOptional",
    "waitEndOfOperation",
    "unableToSendMessage",
    "unableToCreateGroup",
    "mustSelectGroupUser",
    "dataError",
  ]);

  const inputRef = useRef<HTMLInputElement>(null);

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setName(e.target.value);
  }

  const activeGroup = () => setIsgroup(true);
  const disableGroup = () => {
    setIsgroup(false);
    setName("");
    setSelectedUsers([]);
  };

  const addUser = (user: UserData) => {
    if (!selectedUsers.find((selected) => selected.id === user.id)) {
      setSelectedUsers([...selectedUsers, user]);
    } else {
      removeUser(user);
    }
  };
  const removeUser = (user: UserData) => {
    setSelectedUsers(
      selectedUsers.filter((selected) => selected.id !== user.id),
    );
  };

  const useUsersQuery = (key: string, endpoint: string) =>
    useInfiniteQuery({
      queryKey: ["new-chat", key],
      queryFn: fetchUsers(endpoint),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: Infinity,
    });

  const friendsQuery = useUsersQuery("friend", "/api/users/friends");
  const followersQuery = useUsersQuery("followers", "/api/users/followers");
  const followingQuery = useUsersQuery("following", "/api/users/following");
  const suggestionsQuery = useUsersQuery(
    "suggestions",
    "/api/users/suggestions",
  );

  const isFetchingAll =
    friendsQuery.isFetching &&
    followersQuery.isFetching &&
    followingQuery.isFetching &&
    suggestionsQuery.isFetching;

  const isErrorAll =
    friendsQuery.isError ||
    followersQuery.isError ||
    followingQuery.isError ||
    suggestionsQuery.isError;

  const handleChatStart = (user: UserData | null = null) => {
    if (isPending) return;
    if (!socket) return;

    setIsPending(true);

    // Définir les callbacks pour la réponse du serveur
    // On utilise .once pour n'écouter qu'une seule fois la réponse
    const handleRoomReady = (room: any) => {
      setIsPending(false);
      onChatStart(room.id);
      setName("");
      setSelectedUsers([]);
      setIsgroup(false);
      onClose();

      // Nettoyage des écouteurs pour éviter les doublons
      socket.off("room_ready", handleRoomReady);
      socket.off("error_message", handleError);
    };

    const handleError = (msg: string) => {
      setIsPending(false);
      toast({ variant: "destructive", description: msg });
      socket.off("room_ready", handleRoomReady);
      socket.off("error_message", handleError);
    };

    socket.on("room_ready", handleRoomReady);
    socket.on("error_message", handleError);

    // Logique d'envoi
    if (user && !isGroup) {
      // Cas 1 : Message Privé (1v1)
      const userId = user.id;

      // Cas spécial : Message à soi-même (Saved Messages)
      if (loggedinUser.id === userId) {
        // Pour l'instant, gardons la logique socket simple,
        // ou appelez onChatStart("saved-" + loggedinUser.id) directement sans socket
        // si c'est géré purement en front comme dans votre GET.
        onChatStart("saved-" + loggedinUser.id);
        onClose();
        return;
      }

      socket.emit("start_chat", {
        targetUserId: userId,
        isGroup: false,
      });
    } else if (isGroup && selectedUsers.length) {
      // Cas 2 : Groupe
      socket.emit("start_chat", {
        name,
        isGroup: true,
        membersIds: selectedUsers.map((u) => u.id),
      });
    }
  };
  return (
    <>
      <div
        className={cn("fixed inset-0 h-full w-full", className)}
        onClick={onClose}
      ></div>
      <div
        className={cn(
          "absolute flex h-fit w-full flex-1 flex-col bg-background shadow-sm max-sm:h-full sm:inset-1 sm:max-h-[90%] sm:max-w-72 sm:rounded-2xl",
          className,
        )}
      >
        <div className="flex items-center bg-card/40 px-2 py-4 text-xl font-bold">
          {isGroup ? (
            <div className="cursor-pointer p-2" onClick={disableGroup}>
              <ArrowLeft />
            </div>
          ) : (
            <div
              className="cursor-pointer p-2 sm:hidden"
              title="Annuler"
              onClick={onClose}
            >
              <ArrowLeft />
            </div>
          )}
          <span className="flex-1">{isGroup ? newGroup : newChat}</span>
          {!isGroup && (
            <div
              className="cursor-pointer max-sm:hidden"
              title="Annuler"
              onClick={onClose}
            >
              <XIcon />
            </div>
          )}
        </div>
        <div className="relative flex w-full flex-1 select-none overflow-y-auto overflow-x-hidden">
          <ul
            className={cn(
              "relative flex min-w-full translate-x-0 flex-col gap-1 transition-all",
              isGroup && "-translate-x-full",
            )}
          >
            <li
              className="cursor-pointer p-3 px-4 hover:bg-primary/5 active:bg-primary/5"
              onClick={activeGroup}
            >
              <div className="flex items-center space-x-2">
                <div className="relative flex aspect-square h-fit min-h-[35px] w-fit min-w-fit items-center justify-center overflow-hidden rounded-full bg-primary">
                  <UsersRound
                    className="absolute flex items-center justify-center rounded-full fill-primary-foreground text-primary-foreground"
                    size={20}
                  />
                </div>
                <p>{newGroup}</p>
              </div>
            </li>
            {isPending && (
              <li className="w-full p-3">
                <LoadingButton loading={isPending} className="w-full">
                  {wait}
                </LoadingButton>
              </li>
            )}
            <li className="h-full w-full overflow-y-auto">
              <ul className="w-full">
                <li
                  className="cursor-pointer p-3 px-4 hover:bg-primary/5 active:bg-primary/5"
                  onClick={() => {
                    onChatStart("saved-" + loggedinUser.id);
                    onClose();
                  }}
                >
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      userId={loggedinUser.id}
                      avatarUrl={loggedinUser.avatarUrl}
                      size={35}
                    />
                    <div>
                      <p>
                        {loggedinUser.displayName} ({you})
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {messageYourself}
                      </p>
                    </div>
                  </div>
                </li>
                {isFetchingAll && (
                  <li className="mx-auto py-5">
                    <Loader2 className="animate-spin" />
                  </li>
                )}
                {isErrorAll && (
                  <li className="flex w-full flex-1 select-none flex-col items-center px-3 py-8 text-center italic text-muted-foreground">
                    <Frown size={100} />
                    <h2 className="text-xl">{dataError}</h2>
                  </li>
                )}
                <UsersList
                  query={friendsQuery}
                  title={friends}
                  onSelect={handleChatStart}
                />
                <UsersList
                  query={followersQuery}
                  title={followers}
                  onSelect={handleChatStart}
                />
                <UsersList
                  query={followingQuery}
                  title={followings}
                  onSelect={handleChatStart}
                />
                <UsersList
                  query={suggestionsQuery}
                  title={suggestions}
                  onSelect={handleChatStart}
                />
              </ul>
            </li>
          </ul>
          <ul
            className={cn(
              "relative flex min-w-full flex-1 translate-x-0 flex-col gap-1 overflow-y-auto transition-all",
              isGroup && "-translate-x-full",
            )}
          >
            <li className="cursor-pointer p-3 px-4">
              <div className="flex items-center space-x-2">
                <div className="relative flex aspect-square h-fit min-h-[35px] w-fit min-w-fit items-center justify-center overflow-hidden rounded-full bg-primary">
                  <UsersRound
                    className="absolute flex items-center justify-center rounded-full fill-primary-foreground text-primary-foreground"
                    size={20}
                  />
                </div>
                <div className="w-full flex-1 border-b-2 border-b-primary py-1">
                  <input
                    placeholder={groupNameOptional}
                    className="b w-full border-none bg-transparent outline-none"
                    ref={inputRef}
                    onChange={handleNameChange}
                  />
                </div>
              </div>
            </li>
            {!!selectedUsers.length && (
              <>
                <li className="sticky top-0 w-full animate-scale gap-2 overflow-x-auto p-3 px-4">
                  <div className="flex min-w-fit flex-nowrap gap-1">
                    {selectedUsers.map((user, index) => (
                      <div
                        className="flex flex-shrink-0 flex-col items-center gap-2"
                        key={index}
                        onClick={() => removeUser(user)}
                      >
                        <div className="relative animate-scale">
                          <UserAvatar
                            userId={user.id}
                            avatarUrl={user.avatarUrl}
                            size={48}
                          />
                          <div className="absolute bottom-0 right-0 flex cursor-pointer items-center justify-center rounded-full bg-muted p-0.5 outline-2 outline-background">
                            <XIcon size={15} />
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {
                            user.displayName
                              .split(" ")[0]
                              .split("-")[0]
                              .split("_")[0]
                          }
                        </span>
                      </div>
                    ))}
                  </div>
                </li>
                <li className="sticky top-0 flex w-full animate-scale gap-2 px-2 max-sm:hidden">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={disableGroup}
                    disabled={isPending}
                  >
                    {cancel}
                  </Button>
                  <LoadingButton
                    loading={isPending}
                    className="flex-1"
                    disabled={isPending}
                    onClick={() => handleChatStart()}
                  >
                    {create}
                  </LoadingButton>
                </li>
              </>
            )}
            {isFetchingAll && (
              <li className="mx-auto py-5">
                <Loader2 className="animate-spin" />
              </li>
            )}
            <li className="flex-1 overflow-y-auto">
              <ul className="flex flex-col gap-1">
                <UsersList
                  query={friendsQuery}
                  title={friends}
                  isGroup
                  selectedUsers={selectedUsers}
                  onSelect={addUser}
                />
                <UsersList
                  query={followersQuery}
                  title={followers}
                  isGroup
                  selectedUsers={selectedUsers}
                  onSelect={addUser}
                />
                <UsersList
                  query={followingQuery}
                  title={followings}
                  isGroup
                  selectedUsers={selectedUsers}
                  onSelect={addUser}
                />
                <UsersList
                  query={suggestionsQuery}
                  title={suggestions}
                  isGroup
                  selectedUsers={selectedUsers}
                  onSelect={addUser}
                />
              </ul>
            </li>
            <button
              className={cn(
                "absolute bottom-7 right-7 aspect-square h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground max-sm:flex sm:hidden",
                (isPending || !selectedUsers.length) &&
                  "bg-primary-foreground text-primary",
              )}
              title={startNewChat}
              onClick={() => handleChatStart()}
              disabled={isPending || !selectedUsers.length}
            >
              {!isPending ? <Check /> : <Loader2 className="animate-spin" />}
            </button>
          </ul>
        </div>
      </div>
    </>
  );
}
