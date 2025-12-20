import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchWithAuth, isAuthenticated, getUser } from "@/lib/auth";
import { formatDistanceToNow } from "date-fns";
import {
  Heart,
  MessageCircle,
  ThumbsDown,
  Trash2,
  Send,
  BadgeCheck,
  Search,
  X,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Author {
  id: string;
  username: string;
  profilePicture: string | null;
  isVerifiedVendor: boolean;
}

interface SocialPost {
  id: string;
  authorId: string;
  content: string;
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  sharesCount: number;
  originalPostId: string | null;
  quoteText: string | null;
  createdAt: string;
  author: Author;
}

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: string;
  author: Author;
}

function renderContentWithMentions(content: string) {
  const mentionRegex = /@(\w+)/g;
  const parts = content.split(mentionRegex);
  
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return (
        <span key={index} className="text-primary font-medium">
          @{part}
        </span>
      );
    }
    return part;
  });
}

function AuthorAvatar({ author }: { author: Author }) {
  if (author.profilePicture) {
    return (
      <img
        src={author.profilePicture}
        alt={author.username}
        className="w-10 h-10 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center text-primary-foreground font-bold">
      {author.username && author.username.length > 0 ? author.username[0].toUpperCase() : "U"}
    </div>
  );
}

function SmallAuthorAvatar({ author }: { author: Author }) {
  if (author.profilePicture) {
    return (
      <img
        src={author.profilePicture}
        alt={author.username}
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold">
      {author.username && author.username.length > 0 ? author.username[0].toUpperCase() : "U"}
    </div>
  );
}

function PostCard({
  post,
  onLike,
  onUnlike,
  onDislike,
  onUndislike,
  onDelete,
  onComment,
  isLiked,
  isDisliked,
}: {
  post: SocialPost;
  onLike: () => void;
  onUnlike: () => void;
  onDislike: () => void;
  onUndislike: () => void;
  onDelete: () => void;
  onComment: () => void;
  isLiked: boolean;
  isDisliked: boolean;
}) {
  const user = getUser();
  const [, setLocation] = useLocation();
  const isAuthor = user?.id === post.authorId;
  const isAdmin = user?.role === "admin";
  const canDelete = isAuthor || isAdmin;

  return (
    <div
      className="bg-card border border-border rounded-lg p-4 space-y-3"
      data-testid={`post-card-${post.id}`}
    >
      <div className="flex items-start justify-between">
        <button 
          className="flex items-center gap-2 hover:opacity-80 transition-opacity text-left flex-1"
          onClick={() => setLocation(`/profile?id=${post.author.id}`)}
          data-testid={`profile-link-${post.author.id}`}
        >
          <AuthorAvatar author={post.author} />
          <div>
            <div className="flex items-center gap-1">
              <span className="font-medium text-foreground">
                {post.author.username}
              </span>
              {post.author.isVerifiedVendor && (
                <BadgeCheck className="h-4 w-4 text-primary" data-testid={`verified-badge-${post.id}`} />
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
            </span>
          </div>
        </button>
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            data-testid={`delete-post-${post.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {post.originalPostId && post.quoteText && (
        <div className="bg-muted/50 rounded-md p-3 border-l-2 border-primary">
          <p className="text-sm text-muted-foreground italic">
            {renderContentWithMentions(post.quoteText)}
          </p>
        </div>
      )}

      <p className="text-foreground whitespace-pre-wrap">
        {renderContentWithMentions(post.content)}
      </p>

      <div className="flex items-center gap-4 pt-2 border-t border-border">
        <button
          className={`flex items-center gap-1.5 text-sm transition-colors ${
            isLiked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
          }`}
          onClick={isLiked ? onUnlike : onLike}
          disabled={!isAuthenticated()}
          data-testid={`like-btn-${post.id}`}
        >
          <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
          <span>{post.likesCount}</span>
        </button>

        <button
          className={`flex items-center gap-1.5 text-sm transition-colors ${
            isDisliked ? "text-blue-500" : "text-muted-foreground hover:text-blue-500"
          }`}
          onClick={isDisliked ? onUndislike : onDislike}
          disabled={!isAuthenticated()}
          data-testid={`dislike-btn-${post.id}`}
        >
          <ThumbsDown className={`h-4 w-4 ${isDisliked ? "fill-current" : ""}`} />
          <span>{post.dislikesCount}</span>
        </button>

        <button
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={onComment}
          data-testid={`comment-btn-${post.id}`}
        >
          <MessageCircle className="h-4 w-4" />
          <span>{post.commentsCount}</span>
        </button>
      </div>
    </div>
  );
}

function CommentCard({
  comment,
  onDelete,
}: {
  comment: Comment;
  onDelete: () => void;
}) {
  const user = getUser();
  const isAuthor = user?.id === comment.authorId;
  const isAdmin = user?.role === "admin";
  const canDelete = isAuthor || isAdmin;

  return (
    <div className="group flex gap-3 p-3 rounded-lg hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0" data-testid={`comment-${comment.id}`}>
      <SmallAuthorAvatar author={comment.author} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-foreground">
              {comment.author.username}
            </span>
            {comment.author.isVerifiedVendor && (
              <BadgeCheck className="h-4 w-4 text-primary" />
            )}
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
          </div>
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              onClick={onDelete}
              data-testid={`delete-comment-${comment.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <p className="text-sm text-foreground mt-1.5 leading-relaxed">
          {renderContentWithMentions(comment.content)}
        </p>
      </div>
    </div>
  );
}

export default function SocialFeed() {
  const [newPost, setNewPost] = useState("");
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [commentText, setCommentText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: posts, isLoading } = useQuery<SocialPost[]>({
    queryKey: ["socialPosts", activeSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeSearch) {
        params.set("search", activeSearch);
      }
      const res = await fetch(`/api/social/posts?${params.toString()}`);
      return res.json();
    },
  });

  const { data: likedPosts } = useQuery<Record<string, boolean>>({
    queryKey: ["likedPosts"],
    queryFn: async () => {
      if (!isAuthenticated() || !posts) return {};
      const likes: Record<string, boolean> = {};
      for (const post of posts) {
        const res = await fetchWithAuth(`/api/social/posts/${post.id}/liked`);
        const data = await res.json();
        likes[post.id] = data.liked;
      }
      return likes;
    },
    enabled: isAuthenticated() && !!posts,
  });

  const { data: dislikedPosts } = useQuery<Record<string, boolean>>({
    queryKey: ["dislikedPosts"],
    queryFn: async () => {
      if (!isAuthenticated() || !posts) return {};
      const dislikes: Record<string, boolean> = {};
      for (const post of posts) {
        const res = await fetchWithAuth(`/api/social/posts/${post.id}/disliked`);
        const data = await res.json();
        dislikes[post.id] = data.disliked;
      }
      return dislikes;
    },
    enabled: isAuthenticated() && !!posts,
  });

  const { data: comments } = useQuery<Comment[]>({
    queryKey: ["postComments", selectedPost?.id],
    queryFn: async () => {
      if (!selectedPost) return [];
      const res = await fetch(`/api/social/posts/${selectedPost.id}/comments`);
      return res.json();
    },
    enabled: !!selectedPost,
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: { content: string; originalPostId?: string; quoteText?: string }) => {
      const res = await fetchWithAuth("/api/social/posts", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      setNewPost("");
      queryClient.invalidateQueries({ queryKey: ["socialPosts"] });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetchWithAuth(`/api/social/posts/${postId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete post");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["socialPosts"] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetchWithAuth(`/api/social/posts/${postId}/like`, {
        method: "POST",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["socialPosts"] });
      queryClient.invalidateQueries({ queryKey: ["likedPosts"] });
    },
  });

  const unlikeMutation = useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetchWithAuth(`/api/social/posts/${postId}/like`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["socialPosts"] });
      queryClient.invalidateQueries({ queryKey: ["likedPosts"] });
    },
  });

  const dislikeMutation = useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetchWithAuth(`/api/social/posts/${postId}/dislike`, {
        method: "POST",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["socialPosts"] });
      queryClient.invalidateQueries({ queryKey: ["dislikedPosts"] });
    },
  });

  const undislikeMutation = useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetchWithAuth(`/api/social/posts/${postId}/dislike`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["socialPosts"] });
      queryClient.invalidateQueries({ queryKey: ["dislikedPosts"] });
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async ({ postId, content }: { postId: string; content: string }) => {
      const res = await fetchWithAuth(`/api/social/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["postComments", selectedPost?.id] });
      queryClient.invalidateQueries({ queryKey: ["socialPosts"] });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetchWithAuth(`/api/social/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete comment");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["postComments", selectedPost?.id] });
      queryClient.invalidateQueries({ queryKey: ["socialPosts"] });
    },
  });

  const handleCreatePost = () => {
    if (!newPost.trim()) return;
    createPostMutation.mutate({ content: newPost });
  };

  const handleSubmitComment = () => {
    if (!commentText.trim() || !selectedPost) return;
    createCommentMutation.mutate({
      postId: selectedPost.id,
      content: commentText,
    });
  };

  const handleSearch = () => {
    setActiveSearch(searchQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveSearch("");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2" data-testid="search-bar">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by username or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10 pr-10"
            data-testid="search-input"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              data-testid="clear-search-btn"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button onClick={handleSearch} data-testid="search-btn">
          Search
        </Button>
      </div>

      {activeSearch && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Showing results for: "{activeSearch}"</span>
          <button onClick={handleClearSearch} className="text-primary hover:underline">
            Clear
          </button>
        </div>
      )}

      {isAuthenticated() && (
        <div className="bg-card border border-border rounded-lg p-4" data-testid="create-post-form">
          <Textarea
            placeholder="What's on your mind?"
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            maxLength={800}
            className="min-h-[80px] resize-none"
            data-testid="post-input"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">
              {newPost.length}/800
            </span>
            <Button
              onClick={handleCreatePost}
              disabled={!newPost.trim() || createPostMutation.isPending}
              size="sm"
              data-testid="submit-post-btn"
            >
              <Send className="h-4 w-4 mr-1" />
              Post
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : posts && posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isLiked={likedPosts?.[post.id] || false}
              isDisliked={dislikedPosts?.[post.id] || false}
              onLike={() => likeMutation.mutate(post.id)}
              onUnlike={() => unlikeMutation.mutate(post.id)}
              onDislike={() => dislikeMutation.mutate(post.id)}
              onUndislike={() => undislikeMutation.mutate(post.id)}
              onDelete={() => deletePostMutation.mutate(post.id)}
              onComment={() => setSelectedPost(post)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No posts yet</p>
          <p className="text-sm">Be the first to share something!</p>
        </div>
      )}

      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <MessageCircle className="h-5 w-5 text-primary" />
              Comments
            </DialogTitle>
          </DialogHeader>
          
          {selectedPost && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-6 py-4 bg-gradient-to-br from-muted/30 to-muted/10 border-b">
                <div className="flex items-center gap-3 mb-3">
                  <SmallAuthorAvatar author={selectedPost.author} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">
                        {selectedPost.author.username}
                      </span>
                      {selectedPost.author.isVerifiedVendor && (
                        <BadgeCheck className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">Original post</span>
                  </div>
                </div>
                <p className="text-sm leading-relaxed">{renderContentWithMentions(selectedPost.content)}</p>
              </div>

              <ScrollArea className="flex-1 px-3">
                <div className="py-2">
                  {comments && comments.length > 0 ? (
                    <div className="space-y-1">
                      {comments.map((comment) => (
                        <CommentCard
                          key={comment.id}
                          comment={comment}
                          onDelete={() => deleteCommentMutation.mutate(comment.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">No comments yet</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Be the first to share your thoughts</p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {isAuthenticated() && (
                <div className="px-6 py-4 border-t bg-muted/20">
                  <div className="flex gap-3">
                    <Textarea
                      placeholder="Share your thoughts..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      maxLength={500}
                      className="min-h-[80px] resize-none flex-1 bg-background border-muted-foreground/20 focus:border-primary"
                      data-testid="comment-input"
                    />
                    <div className="flex flex-col justify-end gap-2">
                      <span className="text-xs text-muted-foreground text-right">{commentText.length}/500</span>
                      <Button
                        onClick={handleSubmitComment}
                        disabled={!commentText.trim() || createCommentMutation.isPending}
                        size="default"
                        className="gap-2"
                        data-testid="submit-comment-btn"
                      >
                        {createCommentMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Post
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
