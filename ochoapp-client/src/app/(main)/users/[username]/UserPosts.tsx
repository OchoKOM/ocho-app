"use client";

import InfiniteScrollContainer from "@/components/InfiniteScrollContainer";
import Post from "@/components/posts/Post";
import PostsLoadingSkeleton from "@/components/posts/PostsLoadingSkeleton";
import { t } from "@/context/LanguageContext";
import kyInstance from "@/lib/ky";
import { PostsPage } from "@/lib/types";
import { VocabularyKey } from "@/lib/vocabulary";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Frown, Loader2, UserRoundPen } from "lucide-react";

interface UserPostsProps {
  userId: string;
  name: string;
}

export default function UserPosts({ userId, name }: UserPostsProps) {

  const { noPostOnProfile, dataError } = t([
    "noPostOnFollowing",
    "dataError",
  ]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ["post-feed", "user-posts", userId],
    queryFn: ({ pageParam }) =>
      kyInstance
        .get(
          `/api/users/${userId}/posts`,
          pageParam ? { searchParams: { cursor: pageParam } } : {},
        )
        .json<PostsPage>(),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const posts = data?.pages.flatMap((page) => page.posts) || [];

  if (status === "pending") {
    return <PostsLoadingSkeleton />;
  }

  if (status === "success" && !posts.length && !hasNextPage) {
    return (
      <div className="my-8 flex w-full select-none flex-col items-center gap-2 text-center text-muted-foreground">
        <UserRoundPen size={150} />
        <h2 className="mb-9 text-xl">
          {noPostOnProfile.replace("[name]", name)}
        </h2>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="my-8 flex w-full select-none flex-col items-center gap-2 text-center text-muted-foreground">
        <Frown size={150} />
        <h2 className="mb-9 text-xl">{dataError}</h2>
      </div>
    );
  }

  return (
    <InfiniteScrollContainer
      className="space-y-2 pb-4 sm:space-y-5"
      onBottomReached={() => hasNextPage && !isFetching && fetchNextPage()}
    >
      {posts.map((post) => (
        <Post key={post.id} post={post} />
      ))}
      {isFetchingNextPage && <Loader2 className="mx-auto my-3 animate-spin" />}
    </InfiniteScrollContainer>
  );
}
