"use client";

import FollowButton from "@/components/FollowButton";
import InfiniteScrollContainer from "@/components/InfiniteScrollContainer";
import Post from "@/components/posts/Post";
import PostsLoadingSkeleton from "@/components/posts/PostsLoadingSkeleton";
import OchoLink from "@/components/ui/OchoLink";
import UserAvatar from "@/components/UserAvatar";
import UserTooltip from "@/components/UserTooltip";
import { t } from "@/context/LanguageContext";
import kyInstance from "@/lib/ky";
import { SearchFilter, SearchPage, PostData, UserData } from "@/lib/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Frown, Loader2, SearchX } from "lucide-react";
import { useSession } from "../SessionProvider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useProgress } from "@/context/ProgressContext";
import { VerifiedType } from "@prisma/client";
import Verified from "@/components/Verified";
import { cn } from "@/lib/utils";

interface SearchResultsProps {
  query: string;
  filter?: SearchFilter;
}

export default function SearchResults({
  query,
  filter: initialFilter = "posts",
}: SearchResultsProps) {
  const { startNavigation: navigate } = useProgress();
  const { posts: postsText, noSearchResultFor, tryNewSearch, dataError, users, verifiedUsers, friends, followers, followings } = t(['posts', 'noSearchResultFor', 'tryNewSearch', 'dataError', 'users', 'verifiedUsers', 'friends', 'followers', 'followings']);
  const { user: loggedInUser } = useSession();
  const [filter, setFilter] = useState<SearchFilter>(initialFilter);

  // Mise à jour de l'URL avec le paramètre filter à chaque fois que le filtre change
  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("filter", filter);
    navigate(currentUrl.pathname + currentUrl.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ["post-feed", "search", query, filter],
    queryFn: ({ pageParam }) =>
      kyInstance
        .get("/api/search", {
          searchParams: {
            q: query,
            filter,
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        })
        .json<SearchPage>(),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    gcTime: 0,
  });

  const posts = data?.pages.flatMap((page) => page.posts) || [];

  const jsxState = () => {
    if (status === "pending") {
      return <PostsLoadingSkeleton />;
    }

    if (status === "success" && !posts.length && !hasNextPage) {
      return (
        <div className="my-8 flex w-full flex-col items-center gap-2 text-center text-muted-foreground">
          <SearchX size={150} />
          <h2 className="text-xl">{noSearchResultFor.replace("[q]", query)}</h2>
          <h2 className="text-xl">{tryNewSearch}</h2>
        </div>
      );
    }

    if (status === "error") {
      return (
        <div className="my-8 flex w-full flex-col items-center gap-2 text-center text-muted-foreground">
          <Frown size={150} />
          <h2 className="text-xl">{dataError}</h2>
        </div>
      );
    }
  };

  return (
    <Tabs
      defaultValue={filter}
      onValueChange={(value: string) => setFilter(value as SearchFilter)}
    >
      <TabsList scrollable variant="soft" className="py-4">
        <TabsTrigger value="posts">{postsText}</TabsTrigger>
        <TabsTrigger value="users">{users}</TabsTrigger>
        <TabsTrigger value="verified-users">{verifiedUsers}</TabsTrigger>
        <TabsTrigger value="friend">{friends}</TabsTrigger>
        <TabsTrigger value="followers">{followers}</TabsTrigger>
        <TabsTrigger value="following">{followings}</TabsTrigger>
      </TabsList>

      {/* Onglet Posts */}
      <TabsContent value="posts" className="pb-2">
        {jsxState()}
        <InfiniteScrollContainer
          className="space-y-2 pb-5 sm:space-y-5"
          onBottomReached={() => hasNextPage && !isFetching && fetchNextPage()}
        >
          {posts.map((post) => {
            const postData = post as PostData;
            return <Post key={postData.id} post={postData} />;
          })}
          {isFetchingNextPage && (
            <Loader2 className="mx-auto my-3 animate-spin" />
          )}
        </InfiniteScrollContainer>
      </TabsContent>

      {/* Onglet Users */}
      <TabsContent value="users" className="pb-2">
        {jsxState()}
        <InfiniteScrollContainer
          className="space-y-2 pb-5 sm:space-y-5"
          onBottomReached={() => hasNextPage && !isFetching && fetchNextPage()}
        >
          {posts.map((post) => {
            const user = post as UserData;
            if (user.username) {
              return (
                <UserItem
                  key={user.id}
                  user={user}
                  loggedInUser={loggedInUser}
                />
              );
            }
            return null;
          })}
          {isFetchingNextPage && (
            <Loader2 className="mx-auto my-3 animate-spin" />
          )}
        </InfiniteScrollContainer>
      </TabsContent>

      {/* Onglet Verified Users */}
      <TabsContent value="verified-users" className="pb-2">
        {jsxState()}
        <InfiniteScrollContainer
          className="space-y-2 pb-5 sm:space-y-5"
          onBottomReached={() => hasNextPage && !isFetching && fetchNextPage()}
        >
          {posts.map((post) => {
            const user = post as UserData;
            if (user.username) {
              return (
                <UserItem
                  key={user.id}
                  user={user}
                  loggedInUser={loggedInUser}
                />
              );
            }
            return null;
          })}
          {isFetchingNextPage && (
            <Loader2 className="mx-auto my-3 animate-spin" />
          )}
        </InfiniteScrollContainer>
      </TabsContent>

      {/* Onglet Friends */}
      <TabsContent value="friend" className="pb-2">
        {jsxState()}
        <InfiniteScrollContainer
          className="space-y-2 pb-5 sm:space-y-5"
          onBottomReached={() => hasNextPage && !isFetching && fetchNextPage()}
        >
          {posts.map((post) => {
            const user = post as UserData;
            if (user.username) {
              return (
                <UserItem
                  key={user.id}
                  user={user}
                  loggedInUser={loggedInUser}
                />
              );
            }
            return null;
          })}
          {isFetchingNextPage && (
            <Loader2 className="mx-auto my-3 animate-spin" />
          )}
        </InfiniteScrollContainer>
      </TabsContent>

      {/* Onglet Followers */}
      <TabsContent value="followers" className="pb-2">
        {jsxState()}
        <InfiniteScrollContainer
          className="space-y-2 pb-5 sm:space-y-5"
          onBottomReached={() => hasNextPage && !isFetching && fetchNextPage()}
        >
          {posts.map((post) => {
            const user = post as UserData;
            if (user.username) {
              return (
                <UserItem
                  key={user.id}
                  user={user}
                  loggedInUser={loggedInUser}
                />
              );
            }
            return null;
          })}
          {isFetchingNextPage && (
            <Loader2 className="mx-auto my-3 animate-spin" />
          )}
        </InfiniteScrollContainer>
      </TabsContent>

      {/* Onglet Following */}
      <TabsContent value="following" className="pb-2">
        {jsxState()}
        <InfiniteScrollContainer
          className="space-y-2 pb-5 sm:space-y-5"
          onBottomReached={() => hasNextPage && !isFetching && fetchNextPage()}
        >
          {posts.map((post) => {
            const user = post as UserData;
            if (user.username) {
              return (
                <UserItem
                  key={user.id}
                  user={user}
                  loggedInUser={loggedInUser}
                />
              );
            }
            return null;
          })}
          {isFetchingNextPage && (
            <Loader2 className="mx-auto my-3 animate-spin" />
          )}
        </InfiniteScrollContainer>
      </TabsContent>
    </Tabs>
  );
}

interface UserItemProps {
  user: UserData;
  loggedInUser: UserData;
}

export function UserItem({ user, loggedInUser }: UserItemProps) {
  const isUserOnline = user.lastSeen > new Date(Date.now() - 60 * 1000);
  const expiresAt = user.verified?.[0]?.expiresAt;
  const canExpire = !!(expiresAt ? new Date(expiresAt).getTime() : null);

  const expired = canExpire && expiresAt ? new Date() < expiresAt : false;

  const isVerified = !!user.verified[0] && !expired;
  const verifiedType: VerifiedType = isVerified
    ? user.verified[0].type
    : "STANDARD";

  const verifiedCheck = isVerified ? <Verified type={verifiedType} /> : null;
  return (
    <div className="flex items-center justify-between gap-3 sm:rounded-xl bg-card p-3">
      <UserTooltip user={user}>
        <OchoLink
          href={`/users/${user.username}`}
          className="flex items-center gap-3 text-inherit"
        >
          <UserAvatar
            userId={user.id}
            avatarUrl={user.avatarUrl}
            className="flex-none"
            hideBadge={false}
          />
          <div>
            <h3
              className={cn(
                "line-clamp-1 break-all font-semibold hover:underline",
                isVerified && "flex items-center gap-1.5",
              )}
            >
              {user.displayName}
              {verifiedCheck}
            </h3>
            <p className="line-clamp-1 break-all text-muted-foreground">
              @{user.username}
            </p>
          </div>
        </OchoLink>
      </UserTooltip>
      {user.id !== loggedInUser.id && (
        <FollowButton
          userId={user.id}
          initialState={{
            followers: user._count.followers,
            isFollowedByUser: user.followers.some(
              ({ followerId }) => followerId === loggedInUser.id,
            ),
            isFolowing: loggedInUser.followers.some(
              ({ followerId }) => followerId === user.id,
            ),
            isFriend:
              user.followers.some(
                ({ followerId }) => followerId === loggedInUser.id,
              ) &&
              loggedInUser.followers.some(
                ({ followerId }) => followerId === user.id,
              ),
          }}
        />
      )}
    </div>
  );
}
