import { RoomData, UserData } from "@/lib/types";
import { useSession } from "../SessionProvider";
import GroupAvatar from "@/components/GroupAvatar";
import UserAvatar from "@/components/UserAvatar";
import { PropsWithChildren, useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  PlusCircle,
  Settings2,
  ShieldBan,
  ShieldPlusIcon,
  UserCircle2,
  UserRoundPlus,
  X,
} from "lucide-react";
import Linkify from "@/components/Linkify";
import { Button } from "@/components/ui/button";
import Time from "@/components/Time";
import OchoLink from "@/components/ui/OchoLink";
import AddMemberDialog from "@/components/messages/AddMemberDialog";
import { useActiveRoom } from "@/context/ChatContext";
import LeaveGroupDialog from "@/components/messages/LeaveGroupDialog";
import GroupChatSettingsDialog from "@/components/messages/GroupChatSettingsDialog";
import { cn } from "@/lib/utils";
import { t } from "@/context/LanguageContext";
import Verified from "@/components/Verified";
import { MemberType, VerifiedType } from "@prisma/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import kyInstance from "@/lib/ky";
import { Skeleton } from "@/components/ui/skeleton";
import LoadingButton from "@/components/LoadingButton";
import { useAddAdminMutation, useRestoreMemberMutation } from "@/components/messages/mutations";
import { useToast } from "@/components/ui/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import BanDialog from "@/components/messages/BanDialog";
import MessageButton from "@/components/messages/MessageButton";
import RemoveMemberDialog from "@/components/messages/RemoveMemberDialog";

interface ChatHeaderProps {
  roomId: string | null;
  isGroup: boolean;
  onDelete: () => void;
  initialRoom: RoomData;
}

export default function RoomHeader({
  roomId,
  isGroup,
  onDelete,
  initialRoom,
}: ChatHeaderProps) {
  const [active, setActive] = useState(false);
  const [expandMembers, setExpandMembers] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [room, setRoom] = useState<RoomData>(initialRoom);
  const [dialogFocus, setDialogFocus] = useState<"name" | "description" | null>(
    null,
  );

  const {
    group,
    groupChat,
    appUser,
    you,
    online,
    activeText,
    viewProfile,
    created,
    member,
    members: membersText,
    namesAndName,
    namesAndOthers,
    settings,
    addAMember,
    addMembers,
    addDescription,
    noDescription,
    joined,
    seeAllMore,
    hide,
    memberSince,
    thisAccountDeleted,
  } = t(['group', 'groupChat', 'appUser', 'you', 'online', 'activeText', 'viewProfile', 'created', 'member', 'members', 'namesAndName', 'namesAndOthers', 'settings', 'addAMember', 'addMembers', 'addDescription', 'noDescription', 'joined', 'seeAllMore', 'hide', 'memberSince', 'thisAccountDeleted']);
  const queryClient = useQueryClient();
  const queryKey = ["room", "head", roomId];
  const { data, status, error } = useQuery({
    queryKey,
    queryFn: () =>
      kyInstance.get(`/api/rooms/${roomId}/room-header`).json<RoomData>(),
    staleTime: Infinity,
  });

  const { user: loggedUser } = useSession();
  const { activeRoomId } = useActiveRoom();

  useEffect(() => {
    setActive(false);
  }, [activeRoomId]);
  useEffect(() => {
    if (roomId) {
      // Clear the old room data
      setRoom(initialRoom);
      // Revalidate the new room data
      queryClient.invalidateQueries({ queryKey });
    }
  }, [roomId]);

  useEffect(() => {
    setRoom(initialRoom);
  }, []);
  useEffect(() => {
    if (data) {
      setRoom(data);
    }
  }, [data]);
  if (!room) {
    if (status === "pending") {
      return (
        <div className="flex w-full flex-shrink-0 items-center gap-2 px-4 py-3 *:flex-shrink-0 max-sm:bg-card/50">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex w-full flex-col gap-2">
            <Skeleton className="h-3 w-40 max-w-full" />
            <Skeleton className="h-2 w-20 max-w-full" />
          </div>
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex w-full flex-shrink-0 items-center gap-2 px-4 py-3 *:flex-shrink-0">
          <UserAvatar userId={""} avatarUrl={null} size={40} />
          <div className="flex w-full flex-col gap-2">
            {isGroup ? group : "OchoApp User"}
          </div>
        </div>
      );
    }
  }

  const aMember = addAMember.match(/-(.*?)-/)?.[1] || "a member";
  const addAM = addAMember.replace(/-.*?-/, "");

  const isSaved = room.id === `saved-${loggedUser.id}`;

  const emptyUser: UserData = {
    id: "",
    username: "",
    displayName: "",
    avatarUrl: "",
    verified: [],
    bio: null,
    following: [],
    followers: [],
    lastSeen: new Date(0),
    createdAt: new Date(0),
    _count: {
      followers: 0,
      posts: 0
    }
  };

  const otherUser =
    room.members.length === 1 && isSaved
      ? room?.members.filter((member) => member.userId === loggedUser.id)?.[0]
          ?.user || emptyUser
      : room?.members.filter((member) => member.userId !== loggedUser.id)?.[0]
          ?.user || emptyUser;

  const expiresAt = isSaved
    ? otherUser?.verified?.[0]?.expiresAt
    : otherUser?.verified?.[0]?.expiresAt;
  const canExpire = !!(expiresAt ? new Date(expiresAt).getTime() : null);

  const expired = canExpire && expiresAt ? new Date() < expiresAt : false;

  const isVerified =
    (isSaved ? !!otherUser?.verified[0] : !!otherUser?.verified[0]) &&
    !expired &&
    !room.isGroup;
  const verifiedType: VerifiedType | undefined = isVerified
    ? otherUser?.verified[0].type || "STANDARD"
    : undefined;

  const verifiedCheck = isVerified ? (
    <Verified type={verifiedType} prompt={active} />
  ) : null;

  const chatName = !!room?.name?.trim()
    ? room.name
    : (isSaved
        ? loggedUser.displayName + ` (${you})`
        : room?.members.filter((member) => member.userId !== loggedUser.id)?.[0]
            ?.user?.displayName) || (room.isGroup ? groupChat : appUser);
  const weekAgo = new Date(
    new Date(room.createdAt).getTime() - 6 * 24 * 60 * 60 * 1000,
  );
  const isWeekAgo = weekAgo.getTime() >= new Date().getTime();

  const size = active ? 120 : 40;

  // Get loggedinMember from members
  const loggedinMember = room.members.find(
    (member) => member.userId === loggedUser.id,
  );
  // Get admins
  const admins = room.members.filter(
    (member) =>
      member.type === "ADMIN" && member.userId !== loggedinMember?.userId,
  );
  // Get owner
  const owner = [room.members.find((member) => member.type === "OWNER")].filter(
    (member) => member?.userId !== loggedinMember?.userId,
  );
  // Get members
  const members = room.members.filter((member) => member.type !== "ADMIN");

  // Remove logged user from owner admins and members
  const filteredMembers = members.filter(
    (member) => member.userId !== loggedUser.id,
  );

  // Remove admins and owner from filteredMembers
  const filteredMembers2 = filteredMembers.filter(
    (member) => member.type !== "ADMIN",
  );

  const filteredMembers3 = filteredMembers2.filter(
    (member) => member.type !== "OWNER",
  );

  const mergedMembers = [
    loggedinMember,
    ...owner,
    ...admins,
    ...filteredMembers3,
  ];
  const allMembers = mergedMembers
    .filter((member) => member?.type !== "OLD")
    .filter((member) => member?.type !== "BANNED");

  const oldMembers = mergedMembers.filter((member) => member?.type === "OLD");
  const bannedMembers = mergedMembers.filter(
    (member) => member?.type === "BANNED",
  );

  const firstPage = allMembers.slice(0, 10);
  const lastPage = allMembers.slice(10, allMembers.length);

  const now = Date.now();

  const isUserOnline =
    !active &&
    (room.id === `saved-${loggedUser.id}` ||
      (!!otherUser?.lastSeen &&
        new Date(otherUser.lastSeen).getTime() - 40_000 > now));

  const lastSeenTimeStamp = otherUser?.lastSeen
    ? new Date(new Date(otherUser.lastSeen).getTime() - 30_000).getTime()
    : null;

  return (
    <div
      className={cn("z-30", active ? "absolute inset-0 h-full w-full overflow-y-auto bg-card max-sm:bg-background sm:rounded-e-3xl" : "relative flex-1")}
    >
      <div
        className={
          "sticky inset-0 z-10 flex justify-between p-4 " +
          (!active ? "hidden" : "")
        }
      >
        <div
          className="cursor-pointer sm:pointer-events-none sm:opacity-0"
          onClick={() => setActive(false)}
        >
          <ChevronLeft size={35} />
        </div>
        <div
          className="cursor-pointer hover:text-red-500 max-sm:pointer-events-none max-sm:opacity-0"
          onClick={() => setActive(false)}
        >
          <X size={35} />
        </div>
      </div>
      <div
        className={`flex w-full flex-1 flex-col transition-all ${active ? "absolute inset-0 h-fit min-h-full bg-card max-sm:bg-background sm:rounded-e-3xl" : "relative"}`}
      >
        <div
          className={`group/head flex flex-1 items-center gap-2 transition-all ${active ? "cursor-default flex-col p-3" : "cursor-pointer"}`}
          onClick={() => !active && setActive(true)}
        >
          {room.isGroup ? (
            <GroupAvatar
              size={size}
              className="transition-all *:transition-all"
              avatarUrl={room.groupAvatarUrl}
            />
          ) : (
            <UserAvatar
              userId={otherUser?.id || null}
              avatarUrl={otherUser?.avatarUrl}
              size={size}
              className="transition-all *:transition-all"
            />
          )}
          <div className="">
            {room.isGroup &&
            active &&
            (loggedinMember?.type === "ADMIN" ||
              loggedinMember?.type === "OWNER") ? (
              <div
                className={cn(
                  "cursor-pointer text-ellipsis text-xl font-bold sm:hover:text-primary sm:hover:underline",
                  isVerified && "flex items-center gap-1",
                )}
                title="Modifier le nom du groupe"
                onClick={() => {
                  setDialogFocus("name");
                  setShowDialog(true);
                }}
              >
                <span className="flex-1">{chatName}</span>
                {verifiedCheck}
              </div>
            ) : (
              <div
                className={cn(
                  "text-xl font-bold",
                  isVerified &&
                    "flex max-w-full items-center gap-1 *:line-clamp-1 *:text-ellipsis",
                )}
              >
                <span className="flex-1">{chatName}</span>

                {verifiedCheck}
              </div>
            )}
            <div
              className={"text-muted-foreground " + (active ? "hidden" : "")}
            >
              {room.isGroup ? (
                <div>
                  <span className="max-sm:hidden sm:group-hover/head:hidden">{`${allMembers.length} ${allMembers.length > 1 ? membersText.toLowerCase() : member.toLowerCase()}`}</span>
                  <span className="text-ellipsis max-sm:line-clamp-1 sm:hidden sm:group-hover/head:inline">
                    {room.members.length === 1
                      ? room.members[0].user?.displayName.split(" ")[0]
                      : room.members.length > 2
                        ? room.members.length > 6
                          ? namesAndOthers
                              .replace(
                                "[names]",
                                room.members
                                  .filter(
                                    (member) => member.userId !== loggedUser.id,
                                  )
                                  .slice(0, 5)
                                  .map(
                                    (member) =>
                                      member.user?.displayName.split(" ")[0],
                                  )
                                  .join(", "),
                              )
                              .replace("[len]", `${room.members.length - 6}`)
                          : namesAndName
                              .replace(
                                "[names]",
                                room.members
                                  .filter(
                                    (member) => member.userId !== loggedUser.id,
                                  )
                                  .slice(0, room.members.length - 2)
                                  .map(
                                    (member) =>
                                      member.user?.displayName.split(" ")[0],
                                  )
                                  .join(", "),
                              )
                              .replace(
                                "[name]",
                                room.members[
                                  room.members.length - 1
                                ].user?.displayName.split(" ")[0] || appUser,
                              )
                        : room.members[
                            room.members.length - 1
                          ].user?.displayName.split(" ")[0] || appUser}
                  </span>
                </div>
              ) : (
                <span className="">
                  {isUserOnline || otherUser?.id === loggedUser.id ? (
                    online
                  ) : lastSeenTimeStamp && lastSeenTimeStamp < now ? (
                    <>
                      {activeText}{" "}
                      <Time
                        time={new Date(lastSeenTimeStamp + 10_000)}
                        relative
                        long={false}
                      />
                    </>
                  ) : (
                    `@${otherUser?.username || "ochoapp-user"}`
                  )}
                </span>
              )}
            </div>
          </div>
          {active && (
            <div className="text-muted-foreground">
              {room.isGroup ? (
                <span className="">{`${group} • ${allMembers.length} ${allMembers.length > 1 ? membersText.toLowerCase() : member}`}</span>
              ) : (
                <span>
                  <div>@{otherUser?.username || "ochoapp-user"}</div>
                  <div className="text-center">
                    {isUserOnline || otherUser?.id === loggedUser.id
                      ? online
                      : lastSeenTimeStamp &&
                        lastSeenTimeStamp < now && (
                          <>
                            {activeText}{" "}
                            <Time
                              time={new Date(lastSeenTimeStamp + 10_000)}
                              relative
                              long={false}
                            />
                          </>
                        )}
                  </div>
                </span>
              )}
            </div>
          )}
          {active && (
            <div className="flex w-full flex-col items-center gap-3">
              <div className="flex w-full justify-center">
                {room.isGroup ? (
                  <div className="flex w-full justify-center gap-2">
                    {loggedinMember?.type !== "OLD" && (
                      <AddMemberDialog room={room} className="max-w-44 flex-1">
                        <Button
                          variant="outline"
                          className="flex h-fit w-full flex-col gap-2"
                        >
                          <UserRoundPlus size={35} />
                          <span>
                            {addAM}{" "}
                            <span className="max-sm:hidden">{aMember}</span>
                          </span>
                        </Button>
                      </AddMemberDialog>
                    )}
                    {(loggedinMember?.type === "ADMIN" ||
                      loggedinMember?.type === "OWNER") && (
                      <GroupChatSettingsDialog
                        room={room}
                        open={showDialog}
                        onOpenChange={(open) => {
                          setShowDialog(open);
                          open === false && setDialogFocus(null);
                        }}
                        className="max-w-44 flex-1"
                        focus={dialogFocus}
                      >
                        <Button
                          variant="outline"
                          className="flex h-fit w-full flex-col gap-2"
                        >
                          <Settings2 size={35} />
                          <span>{settings}</span>
                        </Button>
                      </GroupChatSettingsDialog>
                    )}
                  </div>
                ) : (
                  <OchoLink
                    href={`/users/${otherUser?.username || "-"}`}
                    className="text-inherit"
                  >
                    <Button variant="outline" className="flex gap-1">
                      <UserCircle2 /> {viewProfile}
                    </Button>
                  </OchoLink>
                )}
              </div>
              <hr className="w-full" />
              <div>
                <Linkify>
                  {room.isGroup ? (
                    <>
                      {room.description ? (
                        <p className="whitespace-pre-line break-words py-2 text-center">
                          {room.description}
                        </p>
                      ) : loggedinMember?.type === "ADMIN" ||
                        loggedinMember?.type === "OWNER" ? (
                        <Button
                          variant="link"
                          className="py-0"
                          title={addDescription}
                          onClick={() => {
                            setDialogFocus("description");
                            setShowDialog(true);
                          }}
                        >
                          {addDescription}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">
                          {noDescription}
                        </span>
                      )}
                    </>
                  ) : (
                    !!otherUser?.bio && (
                      <p className="whitespace-pre-line break-words py-2 text-center">
                        {otherUser.bio}
                      </p>
                    )
                  )}
                </Linkify>
              </div>
              {(!!otherUser?.bio?.trim() || room.isGroup) && (
                <hr className="w-full" />
              )}
              <span className="text-muted-foreground">
                {room.isGroup ? (
                  <span>
                    {created}{" "}
                    <Time time={room.createdAt} relative={!isWeekAgo} long />
                  </span>
                ) : (
                  <span>
                    {otherUser?.id ? (
                      <>
                        {room.isGroup ? joined : memberSince}{" "}
                        {!!otherUser?.createdAt && (
                          <Time time={otherUser.createdAt} long />
                        )}
                      </>
                    ) : (
                      thisAccountDeleted
                    )}
                  </span>
                )}
              </span>
              {room.isGroup && <hr className="w-full" />}
            </div>
          )}
        </div>
        {active && (
          <div className="flex w-full flex-1 flex-col gap-3">
            {room.isGroup && loggedinMember?.type !== "BANNED" && (
              <ul className="flex w-full flex-col py-3">
                <li className="select-none px-4 text-xs font-bold text-muted-foreground">{`${allMembers.length} ${membersText.toLowerCase()}`}</li>
                {loggedinMember?.type !== "OLD" && (
                  <AddMemberDialog room={room}>
                    <li className="cursor-pointer p-4 active:bg-muted/30">
                      <div className="flex items-center space-x-2">
                        <div
                          className={`relative flex aspect-square h-fit min-h-[35px] w-fit min-w-fit items-center justify-center overflow-hidden rounded-full bg-primary`}
                        >
                          <UserRoundPlus
                            className="absolute flex items-center justify-center text-primary-foreground"
                            size={35 - 16}
                          />
                        </div>
                        <p>{addMembers}</p>
                      </div>
                    </li>
                  </AddMemberDialog>
                )}

                {firstPage.map((member, key) => {
                  if (!member?.user) return null;
                  const user: UserData = member.user;
                  return (
                    <GroupUserPopover
                      key={key}
                      user={user}
                      type={member.type}
                      room={room}
                    />
                  );
                })}

                <>
                  {!!lastPage.length &&
                    expandMembers &&
                    lastPage.map((member, key) => {
                      if (!member?.user) return null;
                      const user: UserData = member.user;
                      return (
                        <GroupUserPopover
                          key={key}
                          user={user}
                          type={member.type}
                          room={room}
                        />
                      );
                    })}
                  {loggedinMember?.type !== "OLD" && !!oldMembers.length && (
                    <>
                      <li className="select-none px-4 text-xs font-bold text-muted-foreground">{`Anciens membres (${oldMembers.length})`}</li>
                      {oldMembers.map((member, key) => {
                        if (!member?.user) return null;
                        const user: UserData = member.user;
                        return (
                          <GroupUserPopover
                            key={key}
                            user={user}
                            type={member.type}
                            room={room}
                          />
                        );
                      })}
                    </>
                  )}
                  {(loggedinMember?.type === "ADMIN" ||
                    loggedinMember?.type === "OWNER") &&
                    !!bannedMembers.length && (
                      <>
                        <li className="select-none px-4 text-xs font-bold text-destructive">{`Membres suspendus (${bannedMembers.length})`}</li>
                        {bannedMembers.map((member, key) => {
                          if (!member?.user) return null;
                          const user: UserData = member.user;
                          return (
                            <GroupUserPopover
                              key={key}
                              user={user}
                              type={member.type}
                              room={room}
                            />
                          );
                        })}
                      </>
                    )}
                </>

                {!!lastPage.length && !expandMembers && (
                  <li
                    className="flex cursor-pointer px-4 py-2 text-primary hover:underline max-sm:justify-center"
                    onClick={() => setExpandMembers(true)}
                  >
                    {seeAllMore.replace("[len]", `${lastPage.length}`)}
                  </li>
                )}

                {expandMembers && (
                  <li
                    className="flex cursor-pointer px-4 py-2 text-primary hover:underline max-sm:justify-center"
                    onClick={() => setExpandMembers(false)}
                  >
                    {hide}
                  </li>
                )}
              </ul>
            )}
            {room.isGroup &&
              loggedinMember?.type !== "OLD" &&
              loggedinMember?.type !== "BANNED" && (
                <ul className="flex w-full select-none flex-col py-3">
                  <li className="cursor-pointer p-4 text-red-500 active:bg-muted/30">
                    <LeaveGroupDialog room={room} onDelete={onDelete} />
                  </li>
                </ul>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

interface AdminButtonProps {
  member: string;
  type: MemberType;
  room: RoomData;
}

export function AdminButton({
  member,
  type,
  room,
}: AdminButtonProps) {
  const [currentType, setCurrentType] = useState<string>(type);
  const queryClient = useQueryClient();

  const { user: loggedInUser } = useSession();
  const { makeGroupAdmin, dismissAsAdmin } = t();

  const roomId = room.id;

  const mutation = useAddAdminMutation();

  const members = room.members;

  //  get the loggedin user values in members
  const loggedMember = members.find(
    (member) => member.userId === loggedInUser.id,
  );

  const isAdmin = currentType === "ADMIN";
  const isLoggedAuthorized =
    type !== "OWNER" &&
    (loggedMember?.type === "ADMIN" || loggedMember?.type === "OWNER");

  function handleSubmit() {
    const initialType = currentType;
    mutation.mutate(
      {
        roomId,
        member,
      },
      {
        onSuccess: ({ newRoomMember }) => {
          if (newRoomMember.type !== initialType) {
            setCurrentType(newRoomMember.type);

            const queryKey = ["chat", roomId];

            queryClient.invalidateQueries({ queryKey });
          }
        },
        onError(error) {
          setCurrentType(initialType);
          console.error(error);
        },
      },
    );
  }
  return (
    isLoggedAuthorized && (
      <LoadingButton
        loading={mutation.isPending}
        variant={isAdmin ? "outline" : "default"}
        className={cn(
          "flex w-full justify-center gap-3",
          !isAdmin && "text-primary-foreground",
        )}
        onClick={handleSubmit}
      >
        {isAdmin ? (
          <>
            <ShieldBan size={24} className="fill-primary-foreground" />{" "}
            {dismissAsAdmin}
          </>
        ) : (
          <>
            <ShieldPlusIcon size={24} /> {makeGroupAdmin}
          </>
        )}
      </LoadingButton>
    )
  );
}

interface RestoreMemberButtonProps {
  memberId: string;
  room: RoomData;
  children: React.ReactNode;
}

export function RestoreMemberButton({
  memberId,
  room,
  children,
}: RestoreMemberButtonProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { groupRestoreSuccess } = t()

  const mutation = useRestoreMemberMutation();
  const roomId = room.id;

  const member = room.members.find((member) => member.userId === memberId);

  function handleSubmit() {
    mutation.mutate(
      {
        roomId,
        memberId,
      },
      {
        onSuccess: () => {
          const queryKey = ["chat", roomId];

          queryClient.invalidateQueries({ queryKey });

          toast({
            description: groupRestoreSuccess
            .replace("[name]", member?.user?.displayName || "un utilisateur")
            .replace("[group]", room.name || "ce groupe"),
          });
        },
        onError(error) {
          console.error(error);
        },
      },
    );
  }
  return (
    <LoadingButton
      loading={mutation.isPending}
      className="flex w-full justify-center gap-3"
      onClick={handleSubmit}
    >
      {children}
    </LoadingButton>
  );
}

interface GroupUserPopover extends PropsWithChildren {
  user: UserData;
  type: MemberType;
  room: RoomData;
}

export function GroupUserPopover({
  user,
  type,
  room,
  children,
}: GroupUserPopover) {
  const { user: loggedInUser } = useSession();
  const isMember = type !== "OLD" && type !== "BANNED";
  const member = room.members.find((member) => member.userId === user.id);

  const { groupAdmin, groupOwner, joined, leftSince, profile, you } = t();

  const joinedAt: Date | null = member?.joinedAt ?? null;
  const leftAt: Date | null = member?.leftAt ?? null;

  const members = room.members;

  const expiresAt = member?.user?.verified?.[0]?.expiresAt;
  const canExpire = !!(expiresAt ? new Date(expiresAt).getTime() : null);

  const expired = canExpire && expiresAt ? new Date() < expiresAt : false;

  const isVerified = !!member?.user?.verified?.[0] && !expired;
  const verifiedType: VerifiedType | undefined = isVerified
    ? member?.user?.verified?.[0]?.type
    : undefined;

  const verifiedCheck = isVerified ? (
    <Verified type={verifiedType} prompt={false} />
  ) : null;

  //  get the loggedin user values in members
  const loggedMember = members.find(
    (member) => member.userId === loggedInUser.id,
  );
  const isLoggedAdmin =
    loggedMember?.type === "ADMIN" || loggedMember?.type === "OWNER";
  const isBanned = type === "BANNED";
  const isOld = type === "OLD";

  return (
    <Popover>
      <PopoverTrigger asChild className="cursor-pointer">
        {children ?? (
          <li className="cursor-pointer px-4 py-2 active:bg-muted/30">
            <div className="flex items-center space-x-2">
              <UserAvatar userId={user?.id} avatarUrl={user?.avatarUrl} size={35} />
              <div className="flex-1 select-none">
                <p className={cn(isVerified && "flex items-center gap-1")}>
                  {user.id === loggedInUser?.id ? you : user?.displayName}
                  {verifiedCheck}
                </p>
                <p className="text-sm text-muted-foreground">
                  @{user?.username}
                </p>
              </div>
              {isMember && type !== "MEMBER" && (
                <span className="rounded bg-primary/30 p-[2px] text-xs">
                  {type === "ADMIN" ? groupAdmin : groupOwner}
                </span>
              )}
            </div>
          </li>
        )}
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-3">
          <div className="divide-y-2">
            <div
              className={`flex max-w-80 items-center gap-3 break-words px-1 py-2.5 md:min-w-52`}
            >
              <div className={`flex items-center justify-center gap-2`}>
                <OchoLink href={`/users/${user.username}`}>
                  <UserAvatar userId={user.id} avatarUrl={user.avatarUrl} size={70} />
                </OchoLink>
              </div>
              <OchoLink href={`/users/${user.username}`} className="text-inherit">
                <div
                  className={cn(
                    "text-lg font-semibold hover:underline",
                    isVerified && "flex items-center gap-1",
                  )}
                >
                  {user.displayName}
                  {verifiedCheck}
                </div>
                <div className="text-muted-foreground hover:underline">
                  @{user.username}
                </div>
              </OchoLink>
            </div>
            {user.bio && (
              <Linkify>
                <p className="line-clamp-4 whitespace-pre-line p-2">
                  {user.bio}
                </p>
              </Linkify>
            )}
            {joinedAt && (
              <p className="px-3 text-sm font-semibold text-muted-foreground">
                {joined} <Time time={joinedAt} long />
              </p>
            )}
            {joinedAt && leftAt && leftAt > joinedAt && (
              <p className="px-3 text-sm font-semibold text-muted-foreground">
                {leftSince} <Time time={leftAt} long />
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <OchoLink href={`/users/${user.username}`} className="text-inherit">
              <Button variant="secondary" className="flex w-full gap-1">
                <UserCircle2 /> {profile}
              </Button>
            </OchoLink>
            <MessageButton userId={user.id} />
          </div>
          {user.id !== loggedInUser.id &&
            loggedMember?.type != "MEMBER" &&
            isMember && (
              <>
                {isLoggedAdmin && type !== "OWNER" && (
                  <>
                    <AdminButton
                      type={type}
                      room={room}
                      member={user.id}
                    />
                    <RemoveMemberDialog memberId={user.id} room={room} />
                    <BanDialog memberId={user.id} room={room} />
                  </>
                )}
              </>
            )}
          {!isMember && isLoggedAdmin && (
            <>
              {isBanned && (
                <RestoreMemberButton memberId={user.id} room={room}>
                  <PlusCircle size={24} /> Retirer la suspention
                </RestoreMemberButton>
              )}
              {isOld && (
                <RestoreMemberButton memberId={user.id} room={room}>
                  <PlusCircle size={24} /> Reintegrer
                </RestoreMemberButton>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}