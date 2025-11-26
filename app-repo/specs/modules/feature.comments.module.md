# Module Specification: feature.comments

## Module ID
feature.comments

## Purpose
Provides a generic comment thread system that can attach to any resource type while delegating notifications to other modules or jobs.

## State Shape
```ts
{
  threads: {
    [threadId: string]: {
      projectId: string;
      resourceType: string;
      resourceId: string;
      createdAt: string;
      createdBy: string;
      status: 'open' | 'resolved' | 'archived';
    };
  };
  comments: {
    [commentId: string]: {
      threadId: string;
      authorId: string;
      body: string;
      createdAt: string;
      editedAt?: string;
      editedBy?: string;
      metadata?: {
        mentions?: string[]; // userIds
      };
    };
  };
}
```

## Blocks
- ThreadRegistry: create and manage comment threads for arbitrary resource types.
- CommentService: add, edit, soft-delete comments within a thread.
- CommentQueryService: list threads and comments by resource and project scopes.
- CommentEventsBlock: emit events that other modules (e.g., notifications) can react to.

## Lifecycle
- Thread creation: on first comment for a given (projectId, resourceType, resourceId), a thread is created.
- Comment lifecycle: comments can be created, edited (with tracked metadata), and soft-deleted.
- Thread lifecycle: threads can be resolved or archived, but comments remain for audit unless explicitly purged by admins.
- Migration: schema evolution (e.g., adding reactions or richer metadata) follows standard core.storage migration patterns.

## Dependencies
- core.permissions (derive comment.read/write from the underlying resource’s permissions)
- core.auth (actor identity)
- core.storage (project.db tables for threads and comments)
- lib.jobs (optional for async fan-out to notifications or analytics)
- feature.* modules that define resource types consumed here (map, sketch, files, measure, etc.)

## Error Model
- CommentThreadNotFoundError: threadId is invalid or not visible in the current project context.
- CommentPermissionError: actor cannot read or write comments for the underlying resource.
- CommentValidationError: invalid comment body or metadata (e.g., too long, invalid mentions).
- CommentConflictError: when applying updates with optimistic concurrency control on threads or comment metadata.

## Test Matrix
- Resource coupling: for each resource type, verify that only users with matching underlying permissions can view or modify comments.
- Status behavior: ensure resolved/archived states affect UI/query semantics but do not accidentally delete data.
- Event emission: ensure creation/update/delete operations emit well-shaped events suitable for notifications and analytics (even if those consumers are not yet implemented).
- Concurrency: concurrent state changes on threads (e.g., resolving while new comments arrive) must behave deterministically.
