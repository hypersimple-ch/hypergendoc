import Link from "next/link";
import { Status, Table } from "../../components/primitives";
export default function WorkspacePage() {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Workspace overview</p>
          <h1>The document desk.</h1>
          <p>
            Set up companies and their visual systems before agents create
            immutable document versions.
          </p>
        </div>
        <Link className="button button--primary" href="/workspace/companies">
          Add a company
        </Link>
      </section>
      <section className="metric-grid" aria-label="Workspace status">
        <article>
          <span>Companies</span>
          <strong>—</strong>
          <small>Awaiting workspace data</small>
        </article>
        <article>
          <span>Ready documents</span>
          <strong>—</strong>
          <small>Nothing rendered yet</small>
        </article>
        <article>
          <span>MCP credentials</span>
          <strong>—</strong>
          <small>Owner-managed access</small>
        </article>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Recent documents</p>
            <h2>Immutable by design</h2>
          </div>
          <Status>Loading from your workspace</Status>
        </div>
        <Table
          caption="Recent documents"
          columns={["Document", "Company", "Version", "Status"]}
        >
          <tr>
            <td colSpan={4}>
              <div className="empty-state">
                <strong>No documents yet</strong>
                <p>
                  Documents are created by authorized agents and retained as
                  immutable versions.
                </p>
              </div>
            </td>
          </tr>
        </Table>
      </section>
    </>
  );
}
