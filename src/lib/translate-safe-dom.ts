/**
 * Chrome's page translator replaces text nodes in place. React 18 still holds
 * references to the original nodes, so the next reconciliation (route change,
 * Tabs switch, toast unmount, etc.) calls removeChild / insertBefore against a
 * node that is no longer in the expected position and throws NotFoundError,
 * freezing the app until the user reloads.
 *
 * This patch makes those two operations resilient: if the parent/child link no
 * longer matches, we fall back to a best-effort fix rather than throwing. The
 * approach is widely used (originally surfaced by the Facebook + Google
 * Translate teams) and is a no-op when translation is not active.
 *
 * Why: Brazil partner runs Chrome auto-translate; without this the dashboard
 *      freezes on every tab/route switch.
 * How to apply: imported once from src/main.tsx before React renders.
 */

type RemoveChildFn = <T extends Node>(child: T) => T;
type InsertBeforeFn = <T extends Node>(newNode: T, referenceNode: Node | null) => T;

let applied = false;

export function installTranslateSafeDom(): void {
  if (applied || typeof Node === "undefined") return;
  applied = true;

  const originalRemoveChild = Node.prototype.removeChild as RemoveChildFn;
  Node.prototype.removeChild = function patchedRemoveChild<T extends Node>(
    this: Node,
    child: T,
  ): T {
    if (child.parentNode !== this) {
      if (child.parentNode) {
        // The translator re-parented this node; remove from the real parent.
        return originalRemoveChild.call(child.parentNode, child) as T;
      }
      // Already detached — return the child so React's bookkeeping continues.
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  } as typeof Node.prototype.removeChild;

  const originalInsertBefore = Node.prototype.insertBefore as InsertBeforeFn;
  Node.prototype.insertBefore = function patchedInsertBefore<T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // Reference node was moved by the translator; append instead.
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  } as typeof Node.prototype.insertBefore;
}
