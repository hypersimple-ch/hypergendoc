"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ConfirmDialog } from "./primitives";

type NavigationAction = () => void;
type UnsavedChangesContextValue = {
  register: (id: string, dirty: boolean) => void;
  requestNavigation: (action: NavigationAction) => void;
};

const noopContext: UnsavedChangesContextValue = {
  register: () => undefined,
  requestNavigation: (action) => action(),
};
const UnsavedChangesContext =
  createContext<UnsavedChangesContextValue>(noopContext);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<NavigationAction>();
  const finalFocusRef = useRef<HTMLElement | null>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirtyIds.size > 0;

  const register = useCallback((id: string, dirty: boolean) => {
    setDirtyIds((current) => {
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next.size === current.size &&
        [...next].every((key) => current.has(key))
        ? current
        : next;
    });
  }, []);

  const requestNavigation = useCallback((action: NavigationAction) => {
    if (!dirtyRef.current) {
      action();
      return;
    }
    finalFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPending(() => action);
  }, []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onPopState = () => {
      if (!dirtyRef.current) return;
      if (!window.confirm("Leave this page and discard unsaved changes?")) {
        window.history.forward();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const value = useMemo(
    () => ({ register, requestNavigation }),
    [register, requestNavigation],
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={Boolean(pending)}
        title="Leave with unsaved changes?"
        description="Your edits have not been saved as an immutable version. Discard them and continue?"
        confirmLabel="Discard and continue"
        finalFocusRef={finalFocusRef}
        onClose={() => setPending(undefined)}
        onConfirm={() => {
          const action = pending;
          setPending(undefined);
          action?.();
        }}
      />
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges(id: string, dirty: boolean) {
  const context = useContext(UnsavedChangesContext);
  useEffect(() => {
    context.register(id, dirty);
    return () => context.register(id, false);
  }, [context, dirty, id]);
  return context.requestNavigation;
}

export function useUnsavedNavigation() {
  return useContext(UnsavedChangesContext).requestNavigation;
}
