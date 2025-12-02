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

### MVP Implementation Status (Backend Service)

As of the current MVP, a backend `CommentsService` is implemented with a
minimal write surface for project comments:

- `createComment(projectId, { anchorType, anchorId, body }): Promise<Result<{ commentId: string }, AppError>>`
- `deleteComment(projectId, commentId): Promise<Result<void, AppError>>`

Both operations:

- Build a **membership-aware `PermissionContext`** for the target
  project using `buildProjectPermissionContextForCurrentUser(projectId,
  membershipService)` from `core.permissions`.
- Delegate decisions to `PermissionService.canWithReason`.

`createComment` enforces **two gates**:

1. `PROJECT_READ` on the project resource to represent the MVP
   "underlying resource read" requirement:
   - `canWithReason("PROJECT_READ", { type: "project", id: projectId, projectId })`.
2. `COMMENT_CREATE` on a `comment` resource scoped to the project:
   - `canWithReason("COMMENT_CREATE", { type: "comment", id: "new", projectId })`.

`deleteComment` enforces `COMMENT_DELETE` on the concrete `comment`
row:

- Loads the comment by `id` from the `comments` table.
- Returns `Result` with `AppError { code: "NOT_FOUND", message: "Comment not found" }`
  when no row exists.
- When a row exists, calls `canWithReason("COMMENT_DELETE", { type: "comment", id,
  projectId: row.project_id })`.

For both methods, permission-denied outcomes are represented as
`Result` failures with `AppError` using the established pattern:

- `code: "PERMISSION_DENIED"`
- `message: "Permission denied"`
- `details: { reasonCode, grantSource }` (copied from the
  `PermissionDecision`).

These methods do **not** throw for normal permission outcomes; they use
`Result<T, AppError>` for recoverable failures.

MVP persistence for `feature.comments` uses a minimal `comments` table
in `project.db`:

- `id` (TEXT PRIMARY KEY)
- `project_id` (TEXT NOT NULL)
- `anchor_type` (TEXT NOT NULL)
- `anchor_id` (TEXT NOT NULL)
- `body` (TEXT NOT NULL)
- `created_at` (TEXT NOT NULL)
- `created_by` (TEXT NOT NULL)

Planned future arcs will extend both the DB schema and this module to
cover richer capabilities:

- Threads (`threads` table, thread statuses, per-resource grouping)
- Edit flows (`editedAt`, `editedBy` and history)
- Ownership-aware edit/delete rules (e.g. only authors vs elevated
  roles) encoded either in policies or service logic.
- Reactions, mentions metadata, and notifications/analytics events.

TODO (MVP notes):

- `PROJECT_READ` is used as a coarse-grained "underlying resource read"
  gate for `createComment` in this MVP. Later arcs should refine this to
  feature-level read per anchor type (map/file/sketch/etc.).
- Ownership-aware behavior for edit/delete (e.g. "only author may
  delete unless elevated role") will be specified and implemented in a
  follow-up comments arc.

## Test Matrix
- Resource coupling: for each resource type, verify that only users with matching underlying permissions can view or modify comments.
- Status behavior: ensure resolved/archived states affect UI/query semantics but do not accidentally delete data.
- Event emission: ensure creation/update/delete operations emit well-shaped events suitable for notifications and analytics (even if those consumers are not yet implemented).
- Concurrency: concurrent state changes on threads (e.g., resolving while new comments arrive) must behave deterministically.

### Permissions & Membership Integration (Implementation Notes)

- Comment permissions are expressed in `core.permissions` via actions such as
  `COMMENT_CREATE`, `COMMENT_EDIT`, and `COMMENT_DELETE`, mapped to
  `"comments.create"`, `"comments.edit"`, and `"comments.delete"` on
  `comment` resources.
- All comment APIs MUST delegate permission decisions to
  `core.permissions` using a **membership-aware `PermissionContext`** that
  combines the current user, global permissions, and, when applicable,
  project membership for the resource’s owning project.
- Typical enforcement patterns:
  - Creating a comment requires `COMMENT_CREATE` and the ability to view
    the underlying resource (usually `PROJECT_READ` or equivalent
    feature-level read permission).
  - Editing a comment requires `COMMENT_EDIT` and must respect ownership
    rules (for example, users may edit only their own comments unless a
    higher role grants broader rights via policies).
  - Deleting a comment requires `COMMENT_DELETE`, with policies defining
    whether users can delete only their own comments or any comment in a
    project where they hold sufficient role.
- The calling layer MUST construct the membership-aware
  `PermissionContext` (via `ProjectMembershipService` and the current
  user), and `core.permissions` is responsible for final decisions,
  including when a comment belongs to a project the user is not a member
  of (treated as `RESOURCE_NOT_IN_PROJECT`).
