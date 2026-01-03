import { CommentData } from "@/lib/types";
import Linkify from "../Linkify";
import UserTooltip from "../UserTooltip";
import OchoLink from "@/components/ui/OchoLink";
import UserAvatar from "../UserAvatar";
import Time from "../Time";
import { useSession } from "@/app/(main)/SessionProvider";
import CommentMoreButton from "./CommentMoreButton";
import { cn } from "@/lib/utils";
import LikeButton from "./replies/LikeButton";
import ReplyButton from "./replies/ReplyButton";
import Replies from "./replies/Replies";
import ReplyInput from "./replies/ReplyInput";
import { useState } from "react";
import { t } from "@/context/LanguageContext";
import { Button } from "../ui/button";
import { Heart, MessageSquare } from "lucide-react";
import { VerifiedType } from "@prisma/client";
import Verified from "../Verified";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@radix-ui/react-popover";

interface CommentProps {
  comment: CommentData & { isRepliedByAuthor?: boolean };
  isTarget?: boolean;
}

export default function Comment({ comment, isTarget = false }: CommentProps) {
  const { user } = useSession();
  const [showInput, setShowInput] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [repliesCount, setRepliesCount] = useState(comment._count.firstLevelOf);
  const [authorReplied, setAuthorReplied] = useState(comment.isRepliedByAuthor);
  const [authorLiked, setAuthorLiked] = useState(false);
  const { appUser, author } = t();

  const expiresAt = comment.user.verified?.[0]?.expiresAt;
  const canExpire = !!(expiresAt ? new Date(expiresAt).getTime() : null);

  const expired = canExpire && expiresAt ? new Date() < expiresAt : false;

  const isVerified = !!comment.user.verified[0] && !expired;
  const verifiedType: VerifiedType = isVerified
    ? comment.user.verified[0].type
    : "STANDARD";

  const verifiedCheck = isVerified ? <Verified type={verifiedType} /> : null;

  return (
    <div
      className={cn(
        "group/comment flex flex-shrink-0 flex-col items-end gap-2 bg-background/30 px-2 py-3 transition-all *:flex-shrink-0 sm:rounded-sm",
        isTarget && "p-0",
      )}
    >
      <div
        className={cn(
          "flex w-full gap-3",
          isTarget &&
            "border-s-4 border-solid border-s-primary bg-primary/10 p-2 sm:border-4 sm:border-primary/50",
        )}
      >
        <UserTooltip user={comment.user} verified={verifiedCheck}>
          <span>
            <OchoLink
              href={`/users/${comment.user.username || "-"}`}
              className="max-sm:hidden"
            >
              <UserAvatar userId={comment.user.id} avatarUrl={comment.user.avatarUrl} size={36} />
            </OchoLink>
            <span className="sm:hidden">
              <UserAvatar userId={comment.user.id} avatarUrl={comment.user.avatarUrl} size={36} />
            </span>
          </span>
        </UserTooltip>
        <div className="relative flex-1">
          <div className="flex w-full justify-between">
            <div className="flex-1 items-center gap-1 text-sm text-muted-foreground">
              <UserTooltip user={comment.user} verified={verifiedCheck}>
                <div className="items-center">
                  <span className="inline-flex items-center gap-0.5">
                    <OchoLink
                      href={`/users/${comment.user.username || "-"}`}
                      className="font-medium text-inherit max-sm:hidden"
                    >
                      {comment.user.displayName || appUser}
                    </OchoLink>
                    <span className="font-medium hover:underline sm:hidden">
                      {comment.user.displayName || appUser}
                    </span>
                    {verifiedCheck}
                  </span>
                  {comment.userId === comment.post.userId && (
                    <span className="space-x-1 ps-1 text-primary">
                      <span className="font-bold">•</span>
                      <span>{author}</span>
                    </span>
                  )}
                </div>
              </UserTooltip>
            </div>
            {comment.user.id === user.id && (
              <CommentMoreButton
                comment={comment}
                className="absolute right-0 top-0 transition-opacity group-hover/comment:opacity-100 sm:opacity-0"
              />
            )}
          </div>
          <Linkify postId={comment.postId}>
            <p>{comment.content}</p>
          </Linkify>
          <div className="">
            <span className="text-xs text-muted-foreground">
              <Time time={comment.createdAt} long />
            </span>
          </div>
          <div className="flex w-full items-center gap-4">
            <LikeButton
              comment={comment}
              initialState={{
                likes: comment._count.likes,
                isLikedByUser: comment.likes.some(
                  (like) => like.userId === user.id,
                ),
                isLikedByAuthor: comment.likes.some(
                  (like) => like.userId === comment.post.userId,
                ),
              }}
              onAuthorLikeChange={setAuthorLiked}
            />
            <ReplyButton
              replies={repliesCount}
              onClick={() => setShowInput(true)}
            />
            {authorLiked && (
              <AuthorLikeIcon avatarUrl={comment.post.user.avatarUrl} userId={comment.post.user.id} />
            )}
          </div>
        </div>
      </div>
      {showInput && (
        <ReplyInput
          comment={{
            ...comment,
            firstLevelComment: comment,
          }}
          onClose={() => setShowInput(false)}
          profile
        />
      )}
      <div className="flex w-[calc(100%-3rem)] items-center gap-2">
        {authorReplied && (
          <>
            <AuthorReplyIcon avatarUrl={comment.post.user.avatarUrl} userId={comment.post.user.id} />
            <span className="text-xl font-bold text-primary">•</span>
          </>
        )}
        {!comment.firstLevelCommentId && (
          <ShowRepliesButton
            replies={repliesCount}
            onClick={() => setShowReplies(!showReplies)}
          />
        )}
      </div>
      <Replies
        comment={comment}
        onClose={() => setShowReplies(false)}
        onCountChange={setRepliesCount}
        onAuthorReplyChange={setAuthorReplied}
        hidden={!(showReplies || showInput)}
      />
    </div>
  );
}

export function AuthorReplyIcon({ avatarUrl, userId }: { avatarUrl: string | null; userId: string }) {
  const { repliedByAuthor } = t();
  const text = <p>{repliedByAuthor}</p>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="max-sm:hidden">
          <span className="relative">
            <UserAvatar userId={userId} avatarUrl={avatarUrl} size={32} />
            <MessageSquare
              size={20}
              className="absolute -bottom-1 -right-0.5 fill-primary"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent className="z-50 w-max rounded-sm border-solid border-input bg-background p-2 py-1">
          {text}
        </TooltipContent>
      </Tooltip>
      <Popover>
        <PopoverTrigger className="sm:hidden">
          <span className="relative">
            <UserAvatar userId={userId} avatarUrl={avatarUrl} size={32} />
            <MessageSquare
              size={20}
              className="absolute -bottom-1 -right-0.5 fill-primary"
            />
          </span>
        </PopoverTrigger>
        <PopoverContent className="z-50 rounded-sm border-solid border-input bg-background p-2">
          {text}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
export function AuthorLikeIcon({ avatarUrl, userId }: { avatarUrl: string | null; userId: string }) {
  const likedByAuthor = t("likedByAuthor");
  const text = <p>{likedByAuthor}</p>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="max-sm:hidden">
          <span className="relative border-border">
            <UserAvatar userId={userId} avatarUrl={avatarUrl} size={28} />
            <Heart
              size={20}
              className="absolute -bottom-1 -right-0.5 fill-red-500"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent className="z-50 w-max rounded-sm border-solid border-input bg-background p-2 py-1">
          {text}
        </TooltipContent>
      </Tooltip>
      <Popover>
        <PopoverTrigger className="sm:hidden">
          <span className="relative border-border">
            <UserAvatar userId={userId} avatarUrl={avatarUrl} size={28} />
            <Heart
              size={20}
              className="absolute -bottom-1 -right-0.5 fill-red-500"
            />
          </span>
        </PopoverTrigger>
        <PopoverContent className="z-50 rounded-sm border-solid border-input bg-background p-2 py-1">
          {text}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

export function ShowRepliesButton({
  replies,
  onClick,
}: {
  replies: number;
  onClick: () => void;
}) {
  const { replies: repliesText, reply: replyText } = t(
    ["replies", "reply"],
  );
  if (!replies) {
    return null;
  }
  return (
    <Button
      title={repliesText}
      onClick={onClick}
      className="flex items-center gap-2 bg-accent text-primary hover:text-primary"
      variant="ghost"
    >
      <span className="text-sm font-medium tabular-nums">
        {replies}{" "}
        <span className="">{replies > 1 ? repliesText : replyText}</span>
      </span>
    </Button>
  );
}
