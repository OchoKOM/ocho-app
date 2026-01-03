import Time from "@/components/Time";
import UserAvatar from "@/components/UserAvatar";
import { t } from "@/context/LanguageContext";
import { NotificationData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NotificationType } from "@prisma/client";
import { AtSign, Heart, MessageSquareMore, User2 } from "lucide-react";
import OchoLink from "@/components/ui/OchoLink";

interface NotificationProps {
  notification: NotificationData;
}

export default function Notification({ notification }: NotificationProps) {
  const {
    followedYou,
    likedYourPost,
    likedYourComment,
    taggedYou,
    commented,
    replied,
    commentPrev,
    onYourPost,
    onYourComment,
  } = t(['followedYou', 'likedYourPost', 'likedYourComment', 'taggedYou', 'commented', 'replied', 'commentPrev', 'onYourPost', 'onYourComment']);
  const notificationTypeMap: Record<
    NotificationType,
    {
      message: string;
      icon: JSX.Element;
      href: string;
    }
  > = {
    LIKE: {
      message: likedYourPost,
      icon: (
        <div className="absolute -bottom-0.5 -right-0.5 flex aspect-square items-center justify-center rounded-full bg-foreground p-1">
          <Heart className="size-4 fill-red-500 text-red-500" />
        </div>
      ),
      href: `/posts/${notification.postId}`,
    },
    COMMENT: {
      message: `${commented} ${notification.comment?.content ? `${commentPrev.replace("[c]", notification.comment.content.slice(0, 30))}` : onYourPost}.`,
      icon: (
        <div className="absolute -bottom-0.5 -right-0.5 flex aspect-square items-center justify-center rounded-full bg-foreground p-1">
          <MessageSquareMore className="size-4 fill-primary text-primary" />
        </div>
      ),
      href: `/posts/${notification.postId}${notification.commentId ? `?comment=${notification.commentId}` : ""}`,
    },
    COMMENT_LIKE: {
      message: likedYourComment,
      icon: (
        <div className="absolute -bottom-0.5 -right-0.5 flex aspect-square items-center justify-center rounded-full bg-foreground p-1">
          <Heart className="size-4 fill-red-500 text-red-500" />
        </div>
      ),
      href: `/posts/${notification.postId}?show-comment=true`,
    }, 
    COMMENT_REPLY: {
      message: `${replied} ${notification.comment?.content ? `${commentPrev.replace("[c]", notification.comment.content.slice(0, 30))}` : onYourComment}.`,
      icon: (
        <div className="absolute -bottom-0.5 -right-0.5 flex aspect-square items-center justify-center rounded-full bg-foreground p-1">
          <MessageSquareMore className="size-4 fill-primary text-primary" />
        </div>
      ),
      href: `/posts/${notification.postId}?show-comment=true`,
    },
    FOLLOW: {
      message: followedYou,
      icon: (
        <div className="absolute -bottom-0.5 -right-0.5 flex aspect-square items-center justify-center overflow-hidden rounded-full bg-foreground p-1">
          <User2 className="size-4 rounded-full fill-primary text-primary" />
        </div>
      ),
      href: `/users/${notification.issuer.username}`,
    },
    IDENTIFY: {
      message: taggedYou,
      icon: (
        <div className="absolute -bottom-0.5 -right-0.5 aspect-square max-h-10 max-w-10 rounded-full bg-foreground p-0.5 *:w-full">
          <AtSign className="size-5 text-yellow-500" />
        </div>
      ),
      href: `/posts/${notification.postId}`,
    },
  };

  const { message, icon, href } = notificationTypeMap[notification.type];

  return (
    <OchoLink href={href} className="block text-inherit">
      <article
        className={cn(
          "flex gap-3 bg-card/50 p-5 shadow-sm transition-colors hover:bg-card/70 sm:rounded-2xl sm:bg-card",
          !notification.read && "bg-accent",
        )}
      >
        <div className="flex w-full flex-shrink-0 gap-3">
          <div className="relative h-fit w-fit">
            <UserAvatar userId={notification.issuerId} avatarUrl={notification.issuer.avatarUrl} />
            {icon}
          </div>
          <div className="flex-1 p-1">
            <div className="line-clamp-3 w-full overflow-hidden text-ellipsis">
              <span className="max-w-40 overflow-hidden text-ellipsis font-bold">
                {notification.issuer.displayName}
              </span>{" "}
              {message}
            </div>
            <span className="text-muted-foreground">
              <Time time={notification.createdAt} long={false} relative />
            </span>
          </div>
          {notification.post && (
            <div className="line-clamp-3 text-ellipsis whitespace-pre-line text-muted-foreground"></div>
          )}
        </div>
      </article>
    </OchoLink>
  );
}
