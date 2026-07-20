"use client";

import type { Company } from "@hypergendoc/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { dashboardApi, type WorkspaceContext } from "../lib/dashboard-api";
import { safeError } from "./dashboard-state";

type ActiveCompanyState = {
  context?: WorkspaceContext | undefined;
  companies: Company[];
  loading: boolean;
  error?: string | undefined;
  reload: () => void;
  activeCompany?: Company | undefined;
  setActiveCompany: (companyId: string | undefined) => void;
  noActiveCompany: boolean;
};

type LoadedCompanies = Pick<ActiveCompanyState, "context" | "companies">;

const ActiveCompanyContext = createContext<ActiveCompanyState | undefined>(
  undefined,
);

export const activeCompanyStorageKey = (workspaceId: string) =>
  `hypergendoc:active-company:${workspaceId}`;

function firstActiveCompany(companies: Company[]) {
  return companies.find((company) => !company.archivedAt);
}

export function ActiveCompanyProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LoadedCompanies>();
  const [activeCompanyId, setActiveCompanyId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const mounted = useRef(false);
  const requestId = useRef(0);

  const persist = useCallback((workspaceId: string, companyId?: string) => {
    if (!mounted.current) return;
    const key = activeCompanyStorageKey(workspaceId);
    if (companyId) localStorage.setItem(key, companyId);
    else localStorage.removeItem(key);
  }, []);

  const reload = useCallback(() => {
    const request = ++requestId.current;
    setLoading(true);
    setError(undefined);
    Promise.all([dashboardApi.context(), dashboardApi.companies()])
      .then(([context, companies]) => {
        if (!mounted.current || request !== requestId.current) return;
        const key = activeCompanyStorageKey(context.id);
        const savedId = localStorage.getItem(key);
        const active = companies.find(
          (company) => !company.archivedAt && company.id === savedId,
        );
        const selected = active ?? firstActiveCompany(companies);
        setData({ context, companies });
        setActiveCompanyId(selected?.id);
        persist(context.id, selected?.id);
      })
      .catch((caught: unknown) => {
        if (!mounted.current || request !== requestId.current) return;
        setError(safeError(caught));
      })
      .finally(() => {
        if (mounted.current && request === requestId.current) setLoading(false);
      });
  }, [persist]);

  useEffect(() => {
    mounted.current = true;
    reload();
    return () => {
      mounted.current = false;
      requestId.current++;
    };
  }, [reload]);

  const setActiveCompany = useCallback(
    (companyId: string | undefined) => {
      const selected = data?.companies.find(
        (company) => company.id === companyId && !company.archivedAt,
      );
      const nextId = selected?.id;
      setActiveCompanyId(nextId);
      if (data?.context) persist(data.context.id, nextId);
    },
    [data, persist],
  );

  const activeCompany = data?.companies.find(
    (company) => company.id === activeCompanyId && !company.archivedAt,
  );
  const value: ActiveCompanyState = {
    context: data?.context,
    companies: data?.companies ?? [],
    loading,
    error,
    reload,
    activeCompany,
    setActiveCompany,
    noActiveCompany: !loading && !error && !activeCompany,
  };

  return (
    <ActiveCompanyContext.Provider value={value}>
      {children}
    </ActiveCompanyContext.Provider>
  );
}

export function useActiveCompany() {
  const value = useContext(ActiveCompanyContext);
  if (!value)
    throw new Error(
      "useActiveCompany must be used within ActiveCompanyProvider.",
    );
  return value;
}
