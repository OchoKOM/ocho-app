// api/android/utils/dTypes.ts
import { PostData } from "@/lib/types";
import { NotificationType } from "@prisma/client";
import { cache } from "react";

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  verified: VerifiedUser | null;
  createdAt?: number;
  lastSeen?: number;
  followersCount?: number;
  postsCount?: number;
  isFollowing?: boolean;
}

export interface VerifiedUser {
  verified: boolean;
  type: string | null;
  expiresAt: number | null;
}

export interface SignupRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface UserSession {
  user?: User; // Détails de l'utilisateur si l'inscription réussit
  session?: Session;
}

export type DeviceType = 'ANDROID' | 'IOS' | 'WEB' | 'DESKTOP' | 'UNKNOWN';

export interface SignupResponse {
  success: boolean; // Contient une erreur si l'inscription échoue
  message?: string;
  name?: string;
  data?: UserSession; // Détails de la session si applicable
}

export interface LoginResponse {
  success: boolean; // Contient une erreur si la connexion échoue
  message?: string;
  name?: string;
  data?: UserSession;
}

export interface Session {
  id: string;
  userId: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  name?: string;
  error?: string;
  data?: T;
}

export interface Attachment {
  type: string;
  url: string;
}

export interface Post {
  id: string;
  author: User;
  content: string;
  createdAt: number;
  attachments: Attachment[];
  gradient?: number;
  likes: number;
  comments: number;
  isLiked: boolean;
  isBookmarked: boolean;
}

export interface Comment {
  id: string;
  author: User | null;
  content: string;
  createdAt: number;
  likes: number;
  isLiked: boolean;
  isLikedByAuthor: boolean;
  isRepliedByAuthor: boolean;
  postId: string;
  postAuthorId: string;
  replies: number;
}

export interface Reply {
  id: string;
  author: User | null;
  content: string;
  createdAt: number;
  likes: number;
  isLiked: boolean;
  isLikedByAuthor: boolean;
  commentId: string | null;
  commentAuthorId: string | null;
  commentAuthor: User | null;
  firstLevelCommentId: string | null;
  firstLevelCommentAuthorId: string | null;
  postId: string;
  postAuthorId: string;
  replies: number;
}

export interface NotificationsPage {
    notifications: NotificationData[];
    cursor: string | null;
    hasMore: boolean;
}

export interface NotificationData {
    id: string;
    type: NotificationType;
    read: boolean;
    issuer: User;
    recipientId: string;
    post?: Post | null;
    postId?: string | null;
    comment?: Comment | null;
    createdAt: number;
}

export interface PostsPage {
  posts: Post[];
  nextCursor: string | null;
}
export interface PostsIdsPage {
  posts: string[];
  nextCursor: string | null;
}

export interface CommentsPage {
  comments: Comment[];
  nextCursor: string | null;
}
export interface RepliesPage {
  replies: Reply[];
  nextCursor: string | null;
}

export const calculateRelevanceScore = cache(
  (
    post: PostData,
    user: User,
    latestPostId?: string,
  ): number => {
    const userId = user.id;
    const comments = post._count.comments;
    const likes = post._count.likes;
    const bookmarks = post.bookmarks.length;

    const now = new Date();
    const postAgeHours = (now.getTime() - post.createdAt.getTime()) / (1000 * 60 * 60);

    // Calcul de l'engagement
    const engagementScore = likes * 2 + comments * 3 + bookmarks * 1.5;

    // Définir les fourchettes pour le facteur temporel
    let timeFactor = 1; // Par défaut pour les posts récents
    if (postAgeHours > 24 && postAgeHours <= 72) {
      timeFactor = 0.95; // Post récent (1 à 3 jours)
    } else if (postAgeHours > 72 && postAgeHours <= 168) {
      timeFactor = engagementScore > 0 ? 0.9 : 0.8; // Post modérément ancien (3 à 7 jours)
    } else if (postAgeHours > 168) {
      timeFactor = engagementScore > 0 ? 0.85 : 0.6; // Post ancien (> 7 jours)
    }

    // Calcul du score de proximité
    const proximityScore = post.user.followers.some(
      (follower) => follower.followerId === userId,
    )
      ? 5
      : 0;

    // Bonus pour les types de contenu
    const typeFactor =
      post.attachments.length > 0 ? (post.content.length ? 1.5 : 1.25) : 1;

    // Bonus pour les gradients
    const gradientFactor =
      !post.attachments.length && post.content.length < 100 && post.gradient
        ? 1.5
        : 1;

    // Bonus pour le dernier post
    const latestPostBonus = latestPostId && post.id === latestPostId ? 100 : 0;

    // Calcul final
    return (
      engagementScore * timeFactor +
      proximityScore +
      typeFactor +
      gradientFactor +
      latestPostBonus
    );
  },
);