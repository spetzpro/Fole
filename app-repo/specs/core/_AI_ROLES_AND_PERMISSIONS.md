# _AI_ROLES_AND_PERMISSIONS.md
**Version:** 1.1.0  
**Last-Updated:** 2025-11-23  
**Status:** Authoritative Specification (SSOT)

This file defines the complete, deterministic permissions model for FOLE.
All AI agents, backend logic, and modules MUST follow this document exactly.

---

# 1. PRINCIPLES

1. **Least Privilege**  
   No implicit powers. A user only has permissions explicitly granted via their role.

2. **Deterministic Enforcement**  
   When checking permissions: same inputs → same result. No heuristics. No guesses.

3. **Deny-By-Default**  
   If a permission is missing, unclear, or unspecified → the result is **DENY**.

4. **One Role Per Project**  
   A user may have multiple system roles, but only one project role per project.

5. **No Guessing (AI Rule)**  
   If an AI agent is unsure whether an action is allowed → it MUST STOP and ask.

6. **System Roles are Immutable**  
   System-level roles cannot be removed or altered.

---

# 2. ROLE CATEGORIES

FOLE defines three categories:

### 2.1 System Roles (Global Scope)
- SysAdmin

### 2.2 Project Roles (Per-Project Scope)
- ProjectOwner  
- ProjectAdmin  
- Custom roles (defined inside a project)

### 2.3 Transient Roles
- Guest (read-only minimal role)

---

# 3. CORE ROLE DEFINITIONS (IMMUTABLE)

## 3.1 SysAdmin (System)
**Scope:** Global  
**Inheritance:** Inherits from ProjectOwner  
**Immutable:** Yes

Capabilities:
- Full authority over **system-wide** operations  
- Manage global configuration  
- Enable/disable modules globally  
- Inspect system status  
- Manage users platform-wide

Limitations:
- SysAdmin **does NOT automatically gain control over projects**  
- For project-scoped actions, SysAdmin is treated like having **no project role**  
- Project access still requires:
  - Being added to a project **OR**
  - Having an explicit override for that project

SysAdmin may execute:
- System-scoped actions unconditionally  
- Project-scoped actions only if granted or member of that project

---

## 3.2 ProjectOwner
**Scope:** Single project  
**Inheritance:** Inherits from ProjectAdmin  
**Immutable:** Yes

Capabilities:
- Full control of the project  
- Assign roles  
- Delete the project  
- Approve templates  
- Change project modules/settings

Cannot:
- Change system configuration  
- Perform system-scoped operations

---

## 3.3 ProjectAdmin
**Scope:** Single project  
**Inheritance:** None  
**Immutable:** Yes

Capabilities:
- Full creation/editing power in the project  
- Manage maps, sketches, files, comments  
- Configure sketch features & tool behavior  
- Create custom project roles

Cannot:
- Delete project  
- Promote/demote ProjectOwner  
- Perform system-scoped operations

---

## 3.4 Custom Role
**Scope:** Project  
**Inheritance:** Must inherit from **ProjectAdmin**  
**Immutable:** No (created and managed by project admins)

Limitations:
- Cannot grant permissions exceeding ProjectOwner  
- Cannot grant system-level powers  
- Cannot violate deny-by-default rules  
- Must follow inheritance tree

---

## 3.5 Guest
**Scope:** Project  
**Inheritance:** None  
**Capabilities:** View-only  
**Cannot:** Modify or delete anything

---

# 4. PERMISSION DOMAINS

Permissions are simple boolean flags: **allow** or **deny**.

## 4.1 Project Structure
- project.view
- project.edit.settings
- project.delete
- project.invite
- project.manage.roles

## 4.2 Maps
- map.create
- map.view
- map.edit
- map.delete
- map.calibrate
- map.import.image
- map.export

## 4.3 Sketches
- sketch.create  
- sketch.view  
- sketch.edit  
- sketch.delete  
- sketch.feature.config  
- sketch.tools.use  
- sketch.tools.configure  

## 4.4 Files / Assets
- file.upload  
- file.view  
- file.delete  
- file.insert.into.map  
- file.insert.into.sketch  

## 4.5 Comments
- comment.create  
- comment.edit  
- comment.delete  
- comment.attach.image  

## 4.6 Admin & Configuration
- module.enable  
- module.configure  
- template.edit  
- template.apply  

## 4.7 Dangerous Operations (require destructive-change.json)
- storage.migrate  
- storage.modify.schema  
- storage.destroy.project  

---

# 5. ROLE INHERITANCE (DETERMINISTIC)

### 5.1 Chain (top → bottom)
- SysAdmin  
- ProjectOwner  
- ProjectAdmin  
- CustomRole  
- Guest  

### 5.2 Inheritance Direction
Higher roles inherit everything from the role **below** them.

### 5.3 Override Rules
- Explicit **deny** always wins  
- If a parent allows but child denies → deny  
- If parent denies but child allows → allow (child explicitly overrides)  

---

# 6. ENFORCEMENT LOGIC (SIMPLE, DETERMINISTIC)

### 6.1 Rules
1. If the permission is system-scoped → SysAdmin is always allowed  
2. For project-scoped actions:
   - If user is NOT a project member  
     → DENY  
3. Use role inheritance to resolve permissions  
4. Explicit deny wins  
5. Missing permission = deny  
6. AI must STOP if:
   - Role undefined  
   - Permission undefined  
   - Context unclear  

---

# 7. PERMISSION CHECK ALGORITHM (AUTHORITATIVE)

This replaces all weight tables, heuristics, and legacy ambiguity.

### Pseudocode

```python
def can(user, permission, projectId):
    # 1. System-scoped operations
    if permission.isSystemScoped():
        if user.hasRole("SysAdmin"):
            return True
        else:
            return False

    # 2. Project membership rule
    if projectId is not None:
        if not user.isMemberOf(projectId):
            return False

    # 3. Resolve project role
    role = user.getProjectRole(projectId)  # may be None

    # If no role → deny
    if role is None:
        return False

    # 4. Check explicit rule on role
    val = role.permission.get(permission)
    if val == "deny":
        return False
    if val == "allow":
        return True

    # 5. Walk inheritance chain downward
    parent = role.inherits
    while parent is not None:
        v = parent.permission.get(permission)
        if v == "deny":
            return False
        if v == "allow":
            return True
        parent = parent.inherits

    # 6. Nothing explicit found → deny
    return False
```

---

# 8. CUSTOM ROLE RULES

Custom roles MUST follow:

- Must inherit from ProjectAdmin  
- May override specific permissions  
- Cannot override system-level invariants  
- Cannot exceed ProjectOwner authority  
- Cannot implicitly allow undefined permissions  

---

# 9. AI-SPECIFIC RULES

AI agents MUST:

- STOP on missing/ambiguous permissions  
- NEVER assume upgrading a user role is allowed  
- NEVER bypass the inheritance chain  
- REQUIRE destructive-change.json for dangerous ops  
- ALWAYS check whether a permission is project-scoped or system-scoped  

---

# 10. MACHINE-READABLE ROLE DEFINITIONS (APPENDIX)

```
{
  "systemRoles": {
    "SysAdmin": {
      "inherits": "ProjectOwner",
      "immutable": true
    }
  },
  "projectRoles": {
    "ProjectOwner": {
      "inherits": "ProjectAdmin",
      "immutable": true
    },
    "ProjectAdmin": {
      "inherits": null,
      "immutable": true
    },
    "CustomRole": {
      "inherits": "ProjectAdmin",
      "immutable": false
    },
    "Guest": {
      "inherits": null,
      "immutable": false
    }
  }
}
```

---

**End of Document**  
This file is the Single Source of Truth (SSOT) for all permission enforcement.
