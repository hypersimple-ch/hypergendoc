import type { DocumentFormat } from "@hypergendoc/contracts";

export const STYLE_PREVIEW_DOCUMENT = {
  format: "html",
  body: `<h1>Northstar Growth Report</h1>
<p><strong>Annual strategy review</strong> · Prepared for the leadership team · 21 July 2026</p>
<p>This specimen shows how a complete business report is rendered with the selected style. It combines the full heading hierarchy, long-form body copy, emphasis, structured data, and supporting notes so typography and page composition can be reviewed together.</p>

<h2>Executive summary</h2>
<p>Northstar enters the next planning cycle with a stronger operating base and a clearer view of where disciplined investment can create durable value. Customer retention improved, delivery became more predictable, and the company converted a larger share of qualified opportunities. The next phase is not about adding activity. It is about concentrating resources on the few capabilities that consistently improve customer outcomes.</p>
<blockquote>Clarity compounds when every team can explain the customer problem, the intended outcome, and the evidence that will prove progress.</blockquote>
<p><em>The figures and organizations in this document are illustrative.</em> They exist only to make spacing, hierarchy, color, and pagination visible in the exact PDF renderer.</p>

<h2>Performance at a glance</h2>
<table>
  <caption>Selected operating indicators</caption>
  <thead><tr><th>Indicator</th><th>Current period</th><th>Previous period</th><th>Direction</th></tr></thead>
  <tbody>
    <tr><td>Customer retention</td><td>94%</td><td>89%</td><td>Improving</td></tr>
    <tr><td>Qualified pipeline</td><td>CHF 4.8m</td><td>CHF 3.9m</td><td>Improving</td></tr>
    <tr><td>Delivery predictability</td><td>91%</td><td>82%</td><td>Improving</td></tr>
    <tr><td>Time to first value</td><td>18 days</td><td>27 days</td><td>Faster</td></tr>
  </tbody>
</table>

<h3>Market context</h3>
<p>Three market signals deserve particular attention:</p>
<ul>
  <li><strong>Evidence before expansion.</strong> Customers want an initial result they can validate before committing to a broader program.</li>
  <li><strong>Integration over replacement.</strong> New capabilities must fit existing workflows and reduce coordination cost.</li>
  <li><strong>Trust through transparency.</strong> Clear ownership, security boundaries, and decision records are now part of the product experience.</li>
</ul>

<h4>Customer signals</h4>

<h5>Evidence note</h5>
<p>The report combines product telemetry, delivery reviews, structured interviews, and commercial data. No single source is treated as definitive. A conclusion is considered reliable when at least two independent signals point to the same operational pattern and the responsible team can explain the mechanism behind it.</p>

<h6>Method detail</h6>
<p>Values are reviewed on a rolling twelve-month basis. Qualitative themes are coded by outcome, workflow stage, and frequency. Material assumptions are recorded with the reference identifier <code>NSR-2026-07</code> so future reviews can distinguish changed conditions from changed interpretation.</p>

<hr>
<h2>Strategic priorities</h2>

<h3>1. Build a dependable foundation</h3>
<ol>
  <li>Define service boundaries and publish one accountable owner for each critical workflow.</li>
  <li>Measure failure demand, not only successful throughput, to expose recurring sources of rework.</li>
  <li>Review the highest-impact exceptions every week and convert lessons into product or process changes.</li>
</ol>

<h3>2. Shorten the path to value</h3>
<p>Customers form their strongest impression during the transition from decision to first useful outcome. The company should redesign that transition as a coherent product experience. Every required action must have a purpose, an owner, and a visible status. Optional work should be delayed until the core outcome is secure.</p>
<table>
  <caption>Illustrative ninety-day delivery plan</caption>
  <thead><tr><th>Phase</th><th>Primary outcome</th><th>Evidence</th><th>Owner</th></tr></thead>
  <tbody>
    <tr><td>Days 1–30</td><td>Shared baseline</td><td>Approved success statement</td><td>Program lead</td></tr>
    <tr><td>Days 31–60</td><td>Working core flow</td><td>Observed end-to-end use</td><td>Product lead</td></tr>
    <tr><td>Days 61–90</td><td>Repeatable adoption</td><td>Usage and outcome review</td><td>Customer lead</td></tr>
  </tbody>
</table>

<h3>3. Scale what works</h3>
<p>The operating model should preserve local judgment while standardizing the information required for decisions. Teams may choose different tactics, but they should describe outcomes, risks, dependencies, and evidence in a consistent form. A lightweight reference is available at <a href="https://example.com/operating-model">the operating model guide</a>.</p>

<h2>Financial outlook</h2>
<p>The base case assumes measured growth supported by better retention and a modest improvement in delivery leverage. It does not depend on an abrupt increase in market demand. Investment is concentrated in capabilities that reduce repeated manual work, improve implementation quality, or strengthen the evidence available to commercial teams.</p>
<p>Management should evaluate the plan as a portfolio of staged commitments. Early funding establishes the foundation and validates assumptions. Later funding is released when leading indicators show that customers are adopting the intended workflow and that the organization can support expansion without reducing quality.</p>

<h3>Risks and controls</h3>
<table>
  <caption>Principal execution risks</caption>
  <thead><tr><th>Risk</th><th>Early signal</th><th>Control</th></tr></thead>
  <tbody>
    <tr><td>Priority dilution</td><td>More active initiatives without more completed outcomes</td><td>Quarterly portfolio limits</td></tr>
    <tr><td>Adoption friction</td><td>Longer time to first value</td><td>Journey review at each handover</td></tr>
    <tr><td>Quality erosion</td><td>Higher exception and rework rates</td><td>Weekly reliability review</td></tr>
    <tr><td>Evidence gaps</td><td>Decisions based on isolated anecdotes</td><td>Two-signal validation rule</td></tr>
  </tbody>
</table>

<h2>Recommendations and next steps</h2>
<p>Leadership can begin immediately by selecting one customer journey and applying the proposed operating rhythm end to end. The pilot should be important enough to matter but contained enough to observe clearly. Its purpose is to validate the management system, not to showcase a predetermined success.</p>
<ol>
  <li>Confirm the priority outcome and appoint one accountable executive sponsor.</li>
  <li>Publish the baseline, target, assumptions, and next decision date.</li>
  <li>Run a weekly evidence review focused on changes in customer behavior and delivery performance.</li>
  <li>Conclude after ninety days with a written decision to scale, revise, or stop.</li>
</ol>

<h3>Closing perspective</h3>
<p>Sustainable growth is the result of many clear decisions made with consistent evidence. Northstar has already improved the foundations that matter most: trust, predictability, and time to value. The next opportunity is to turn those gains into a repeatable system that helps every team focus, learn, and deliver with confidence.</p>
<p><strong>End of specimen.</strong> Review the preceding pages to compare heading scale, caption styling, body rhythm, table density, color, margins, and running header or footer behavior.</p>`,
} as const satisfies { format: DocumentFormat; body: string };
