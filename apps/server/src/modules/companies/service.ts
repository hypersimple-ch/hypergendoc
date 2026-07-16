import type { CreateCompanyInput, Company } from "@hypergendoc/contracts";
import type { AuditWriter } from "../../platform/audit.js";
import { auditActor } from "../../platform/audit.js";
import type { AgentActor, HumanActor } from "../auth/actors.js";
import { AuthorizationError } from "../memberships/service.js";

export interface CompanyRepository {
  list(workspaceId: string): Promise<readonly Company[]>;
  find(workspaceId: string, companyId: string): Promise<Company | undefined>;
  create(workspaceId: string, input: CreateCompanyInput): Promise<Company>;
  update(
    workspaceId: string,
    companyId: string,
    input: Readonly<{ name?: string | undefined }>,
  ): Promise<Company | undefined>;
  archive(workspaceId: string, companyId: string): Promise<Company | undefined>;
}

export function createCompanyService(deps: {
  repository: CompanyRepository;
  audit: AuditWriter;
}) {
  const audit = (actor: HumanActor, event: string, targetId: string) =>
    deps.audit.write({
      workspaceId: actor.workspaceId,
      requestId: actor.requestId,
      event,
      ...auditActor({ type: "human", ...actor }),
      targetType: "company",
      targetId,
      outcome: "success",
    });
  return {
    async list(actor: HumanActor | AgentActor) {
      const companies = await deps.repository.list(actor.workspaceId);
      return "userId" in actor
        ? companies
        : companies.filter((company) =>
            actor.allowedCompanyIds.includes(company.id),
          );
    },
    async get(actor: HumanActor, companyId: string): Promise<Company> {
      const company = await deps.repository.find(actor.workspaceId, companyId);
      if (!company) throw new AuthorizationError("not_found");
      return company;
    },
    async create(
      actor: HumanActor,
      input: CreateCompanyInput,
    ): Promise<Company> {
      const company = await deps.repository.create(actor.workspaceId, input);
      await audit(actor, "company.created", company.id);
      return company;
    },
    async update(
      actor: HumanActor,
      companyId: string,
      input: Readonly<{ name?: string | undefined }>,
    ): Promise<Company> {
      const company = await deps.repository.update(
        actor.workspaceId,
        companyId,
        input,
      );
      if (!company) throw new AuthorizationError("not_found");
      await audit(actor, "company.updated", company.id);
      return company;
    },
    async archive(actor: HumanActor, companyId: string): Promise<Company> {
      if (actor.role !== "owner") throw new AuthorizationError("forbidden");
      const company = await deps.repository.archive(
        actor.workspaceId,
        companyId,
      );
      if (!company) throw new AuthorizationError("not_found");
      await audit(actor, "company.archived", company.id);
      return company;
    },
  };
}
