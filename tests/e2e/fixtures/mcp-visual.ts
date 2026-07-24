import {
  StyleDefinitionSchema,
  type StyleDefinition,
} from "../../../packages/contracts/src/style.js";

const alpineBoardDefinition = {
  logoObjectId: null,
  bodyFont: "Karla",
  headingFont: "DM Serif Display",
  bodySizePt: 10.5,
  headingScale: 1.45,
  italicStyle: "italic",
  colors: {
    text: "#18362F",
    heading: "#123C42",
    primary: "#176B68",
    accent: "#8A641D",
    muted: "#526A65",
  },
  textStyles: {
    h1: {
      fontFamily: "DM Serif Display",
      fontSizePt: 27,
      fontWeight: 700,
      lineHeight: 1.12,
      color: "#123C42",
    },
    h2: {
      fontFamily: "DM Serif Display",
      fontSizePt: 20,
      fontWeight: 700,
      lineHeight: 1.18,
      color: "#123C42",
    },
    h3: {
      fontFamily: "DM Serif Display",
      fontSizePt: 15,
      fontWeight: 700,
      lineHeight: 1.25,
      color: "#176B68",
    },
    h4: {
      fontFamily: "Karla",
      fontSizePt: 12,
      fontWeight: 700,
      lineHeight: 1.3,
      color: "#123C42",
    },
    h5: {
      fontFamily: "Karla",
      fontSizePt: 10.5,
      fontWeight: 700,
      lineHeight: 1.35,
      color: "#176B68",
    },
    h6: {
      fontFamily: "Karla",
      fontSizePt: 9,
      fontWeight: 700,
      lineHeight: 1.4,
      color: "#526A65",
    },
    caption: {
      fontFamily: "Karla",
      fontSizePt: 8.5,
      fontWeight: 500,
      lineHeight: 1.3,
      color: "#526A65",
    },
    body: {
      fontFamily: "Karla",
      fontSizePt: 10.5,
      fontWeight: 400,
      lineHeight: 1.5,
      color: "#18362F",
    },
  },
  page: {
    size: "A4",
    marginTopMm: 24,
    marginRightMm: 22,
    marginBottomMm: 23,
    marginLeftMm: 22,
  },
  header: {
    enabled: true,
    leftText: "NORTHRIDGE ADVISORY",
    centerText: "Alpine Board",
    rightText: "Delivery brief",
    showPageNumber: false,
  },
  footer: {
    enabled: true,
    leftText: "Confidential",
    centerText: "",
    rightText: "Page",
    showPageNumber: true,
  },
} satisfies StyleDefinition;

const alpineSystemsDefinition = {
  logoObjectId: null,
  bodyFont: "Roboto",
  headingFont: "Roboto Condensed",
  bodySizePt: 10,
  headingScale: 1.35,
  italicStyle: "italic",
  colors: {
    text: "#142B4A",
    heading: "#102A56",
    primary: "#1D4ED8",
    accent: "#087E8B",
    muted: "#4B617A",
  },
  textStyles: {
    h1: {
      fontFamily: "Roboto Condensed",
      fontSizePt: 26,
      fontWeight: 700,
      lineHeight: 1.08,
      color: "#102A56",
    },
    h2: {
      fontFamily: "Roboto Condensed",
      fontSizePt: 19,
      fontWeight: 700,
      lineHeight: 1.15,
      color: "#1D4ED8",
    },
    h3: {
      fontFamily: "Roboto Condensed",
      fontSizePt: 14,
      fontWeight: 700,
      lineHeight: 1.2,
      color: "#102A56",
    },
    h4: {
      fontFamily: "Roboto",
      fontSizePt: 11.5,
      fontWeight: 700,
      lineHeight: 1.3,
      color: "#1D4ED8",
    },
    h5: {
      fontFamily: "Roboto",
      fontSizePt: 10,
      fontWeight: 700,
      lineHeight: 1.35,
      color: "#087E8B",
    },
    h6: {
      fontFamily: "Roboto",
      fontSizePt: 9,
      fontWeight: 700,
      lineHeight: 1.4,
      color: "#4B617A",
    },
    caption: {
      fontFamily: "JetBrains Mono",
      fontSizePt: 8,
      fontWeight: 400,
      lineHeight: 1.3,
      color: "#4B617A",
    },
    body: {
      fontFamily: "Roboto",
      fontSizePt: 10,
      fontWeight: 400,
      lineHeight: 1.48,
      color: "#142B4A",
    },
  },
  page: {
    size: "LETTER",
    marginTopMm: 18,
    marginRightMm: 18,
    marginBottomMm: 18,
    marginLeftMm: 18,
  },
  header: {
    enabled: true,
    leftText: "NORTHRIDGE DELIVERY SYSTEM",
    centerText: "Alpine Systems",
    rightText: "Implementation plan",
    showPageNumber: false,
  },
  footer: {
    enabled: true,
    leftText: "Internal delivery use",
    centerText: "",
    rightText: "Page",
    showPageNumber: true,
  },
} satisfies StyleDefinition;

export const alpineBoardStyle = StyleDefinitionSchema.parse(
  alpineBoardDefinition,
);
export const alpineSystemsStyle = StyleDefinitionSchema.parse(
  alpineSystemsDefinition,
);

export const alpineBoardDocument = {
  title: "Alpine Board — Portfolio Delivery Brief",
  format: "markdown",
  body: `# Alpine Board portfolio delivery brief

**Prepared for the Alpine Board** · 18 April 2026 · [Northridge Advisory](https://example.com/northridge)

The portfolio has moved from discovery to delivery with a clear mandate: improve member onboarding without interrupting the service teams who support it every day. This brief turns the board's decisions into an operating plan, rather than a status report. It combines the agreed outcomes, the work already underway, and the choices that need sponsorship in the next steering session.

> “A good delivery plan makes the next decision easier than the last one.” — Programme sponsor

## Decision requested

Approve the staged launch approach and confirm that the service director may release the first cohort once readiness evidence is complete. The recommendation protects the April service commitment while giving delivery teams room to learn from real member behaviour.

1. Confirm the pilot cohort of 240 members.
2. Authorise weekly risk decisions through the delivery forum.
3. Hold the expansion decision until the 30-day evidence review.

---

## Outcomes and measures

### What success looks like

The programme will reduce time-to-first-value, make ownership visible, and leave a usable operating rhythm behind. We will measure **completion**, **confidence**, and **case resolution**, not merely training attendance. The team will publish a short dashboard every Friday so the board can see both progress and unresolved trade-offs.

| Outcome | Current signal | June target | Accountable lead |
| --- | ---: | ---: | --- |
| Member onboarding completed | 62% | 82% | Service director |
| First-week support cases | 18 per 100 | 11 per 100 | Support lead |
| Case ownership confirmed | 71% | 95% | Operations lead |

*Table 1. Board measures are reviewed weekly; targets are intentionally directional during the pilot.*

### Delivery principles

- Start with the member journeys that generate the highest repeat contact.
- Keep local teams in the design review; do not substitute slides for observation.
- Escalate a decision when delay costs more than a reversible experiment.
- Record assumptions beside each metric so later readers can interpret movement honestly.

#### Evidence cadence

Every workstream brings one customer observation, one operational measure, and one decision request to the Friday forum. The cadence is deliberately modest: a dependable review is more valuable than a large monthly pack that arrives too late to change work.

##### Review prompt

Are we seeing a service improvement, or only moving work from one queue to another?

###### Traceability note

The delivery office keeps the decision log with the source material and links it from the [programme workspace](https://example.com/programme-workspace).

## Workplan

### First thirty days

The first month focuses on a single end-to-end journey: invitation, identity check, first task, and support handoff. Product and operations will rehearse the new handoff with live but non-critical cases. Content owners will replace policy language with short instructions tested in the support clinic.

| Week | Deliverable | Evidence | Board attention |
| --- | --- | --- | --- |
| 1 | Journey map and service baseline | Ten observed member calls | Confirm pilot boundary |
| 2 | Prototype and support scripts | Usability review with advisers | Remove policy blockers |
| 3 | Cohort rehearsal | End-to-end timing and exceptions | Accept readiness risks |
| 4 | Controlled launch | Daily completion and case data | Decide expansion pace |

*Table 2. The launch sequence favours observable learning over simultaneous change.*

### Operating controls

The release manager will use the following simple threshold before each cohort. The values are shared in the daily channel and reviewed with support at close of business.

\`\`\`text
release if completion >= 75% and critical cases = 0
pause if unresolved identity failures > 5
escalate if support response exceeds one business day
\`\`\`

A pause is not a failure. It is a deliberate control that gives the team time to inspect the journey, communicate clearly, and resume with confidence. The board should expect a concise explanation of every pause, including what changed before the next release.

## Risks and dependencies

### Active risks

The principal risk is uneven capacity in the identity-verification team. A second risk is that local teams may continue using the former spreadsheet after the new workflow is available. Both risks are manageable if ownership stays explicit and exceptions remain visible.

| Risk | Early warning | Response | Owner |
| --- | --- | --- | --- |
| Verification backlog | Queue exceeds one day | Reassign trained reviewers | Operations lead |
| Duplicate local tracking | Spreadsheet updates continue | Coach team leads and retire template | Change lead |
| Ambiguous member messaging | Repeated clarification calls | Test wording in support clinic | Content lead |

*Table 3. Risks are discussed with owners, not reported as anonymous coloured status.*

### Board support needed

Please reinforce the shared message that the pilot is a learning commitment. Teams need permission to raise an issue early, especially when a locally convenient workaround could weaken the evidence. The next brief will include cohort results, a decision log extract, and a recommendation for the July expansion.`,
} as const;

export const alpineSystemsDocument = {
  title: "Alpine Systems — Delivery Operating Model",
  format: "html",
  body: `<h1>Alpine Systems delivery operating model</h1>
<p><strong>Implementation guide</strong> for the service platform team · <a href="https://example.com/delivery">delivery workspace</a></p>
<p>This operating model defines how the Alpine Systems team ships reliable service changes while keeping decisions inspectable. It is written for delivery leads, engineers, support managers, and client counterparts who need one shared view of flow. The aim is not to add ceremony; it is to make the handoffs, evidence, and escalation paths clear enough that the team can act without waiting for a weekly meeting.</p>
<blockquote><p>“Make work visible before making it faster.” — Delivery practice</p></blockquote>
<h2>Service objective</h2>
<p>By the end of the implementation window, a new client administrator should be able to configure access, invite a colleague, and understand the first support route in one working session. We will validate that outcome with observed sessions and production telemetry. <em>Speed without comprehension is not a successful launch.</em></p>
<table><caption>Table 1. Delivery objectives and leading indicators</caption><thead><tr><th>Objective</th><th>Leading indicator</th><th>Target</th><th>Owner</th></tr></thead><tbody><tr><td>Predictable setup</td><td>Median configuration time</td><td>Under 35 minutes</td><td>Platform lead</td></tr><tr><td>Useful support</td><td>First-contact resolution</td><td>Above 80%</td><td>Support lead</td></tr><tr><td>Safe release</td><td>Rollback-ready changes</td><td>100%</td><td>Release manager</td></tr></tbody></table>
<hr />
<h2>Delivery system</h2>
<h3>Work intake</h3>
<p>Every request enters the shared queue with a named sponsor, a user outcome, and a measurable acceptance signal. The intake coordinator checks whether the request is a defect, an improvement, or a discovery question. Requests without a decision owner are returned for clarification rather than silently added to the backlog.</p>
<ol><li>Capture the user problem in the request record.</li><li>Confirm the service impact with support and operations.</li><li>Choose the smallest testable slice.</li><li>Schedule the decision point with the accountable sponsor.</li></ol>
<h4>Definition of ready</h4>
<p>A delivery item is ready when the team can describe the affected journey, the intended evidence, and the rollback path. This keeps urgent work from becoming invisible work.</p>
<h5>Technical handoff</h5>
<p>Engineers pair with the support representative before implementation when a change alters member-facing guidance. The representative brings real examples; the engineer explains constraints and observability.</p>
<h6>Record format</h6>
<pre><code>change_id: ALP-204
hypothesis: clearer invitation wording reduces clarification calls
measure: invitation-to-first-login completion
rollback: restore prior template and notify support</code></pre>
<p><code>change_id</code> is included in deployment notes, support updates, and the weekly evidence review.</p>
<h3>Flow controls</h3>
<p>Work in progress is limited so that the team finishes learning before starting another stream. The delivery lead reviews blocked work daily and records the reason in plain language. A blocked item is an operational signal, not an individual performance judgement.</p>
<ul><li>No more than three changes may be in implementation at once.</li><li>Each release has a named observer from support.</li><li>Client-facing copy is reviewed against the live workflow.</li><li>Any rollback is documented before the next release begins.</li></ul>
<table><caption>Table 2. Operating cadences</caption><thead><tr><th>Cadence</th><th>Participants</th><th>Purpose</th><th>Output</th></tr></thead><tbody><tr><td>Daily, 15 minutes</td><td>Delivery and support</td><td>Surface blocked work</td><td>Updated flow board</td></tr><tr><td>Twice weekly</td><td>Product, engineering, operations</td><td>Inspect evidence</td><td>Decision log</td></tr><tr><td>Friday</td><td>Client sponsor and leads</td><td>Review outcomes</td><td>Next-week commitment</td></tr></tbody></table>
<h2>Release and learning loop</h2>
<h3>Controlled release</h3>
<p>Releases begin with a small, representative client group. The group receives a concise notice explaining what changed, where to ask for help, and how feedback will be used. Support watches the first sessions and distinguishes usability questions from operational defects.</p>
<p>The release manager checks the following evidence before expanding: completion rate, critical errors, support response time, and comments from observers. If any signal contradicts the expected outcome, the team pauses expansion and shares the finding with the sponsor the same day.</p>
<table><caption>Table 3. Release decision thresholds</caption><thead><tr><th>Signal</th><th>Continue</th><th>Pause</th><th>Response</th></tr></thead><tbody><tr><td>Completion</td><td>75% or higher</td><td>Below 65%</td><td>Inspect journey recordings</td></tr><tr><td>Critical defects</td><td>None</td><td>One or more</td><td>Rollback or patch</td></tr><tr><td>Support response</td><td>Within one day</td><td>Over one day</td><td>Rebalance coverage</td></tr></tbody></table>
<p>Teams should link the decision record to the <a href="https://example.com/evidence">evidence library</a> so later reviewers can trace why a release continued, paused, or changed direction.</p>
<h3>Closing the implementation</h3>
<p>The engagement closes only when the client team can run the cadence independently. In the final review, the delivery team transfers the queue, decision log, measurement definitions, and support playbook. The client sponsor confirms which measures remain useful after the project and which temporary controls can be retired.</p>
<p>This final handoff is intentionally practical: it gives the client a working system for improvement, not a polished document that becomes obsolete after launch.</p>
<h3>Thirty-day ownership review</h3>
<p>Thirty days after handover, the client sponsor convenes a focused ownership review. Each lead brings one example of a decision made without delivery-team support, one measure that changed operational behaviour, and one control that can now be simplified. The review is successful when responsibility is visible in normal team routines rather than held in a temporary project forum.</p>
<ul><li>Operations owns the service measures and confirms their source each Friday.</li><li>Support maintains the response playbook and samples five resolved cases every month.</li><li>Engineering reviews rollback evidence in the regular release retrospective.</li><li>The client sponsor closes or renews temporary controls with a dated decision.</li></ul>
<p>The delivery lead records any unresolved dependency with a named owner and next decision date. After that record is accepted, the implementation team can step back without leaving hidden coordination work behind.</p>`,
} as const;

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string): number => {
    const channels = [1, 3, 5].map(
      (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
    );
    const [red, green, blue] = channels.map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (lighter! + 0.05) / (darker! + 0.05);
}

export function assertMcpVisualFixtures(): void {
  for (const [name, style] of Object.entries({
    alpineBoardStyle,
    alpineSystemsStyle,
  })) {
    StyleDefinitionSchema.parse(style);
    if (contrastRatio(style.colors.text, "#FFFFFF") < 4.5)
      throw new Error(`${name} body text does not meet WCAG AA on white`);
    if (contrastRatio(style.colors.heading, "#FFFFFF") < 4.5)
      throw new Error(`${name} heading text does not meet WCAG AA on white`);
    for (const [role, textStyle] of Object.entries(style.textStyles ?? {})) {
      if (!textStyle) continue;
      if (contrastRatio(textStyle.color, "#FFFFFF") < 4.5)
        throw new Error(`${name} ${role} text does not meet WCAG AA on white`);
    }
    if (
      !style.header.enabled ||
      !style.footer.enabled ||
      !style.footer.showPageNumber
    )
      throw new Error(
        `${name} must have enabled running header and footer with page number`,
      );
  }

  const required = ["title", "format", "body"] as const;
  for (const document of [alpineBoardDocument, alpineSystemsDocument]) {
    for (const key of required)
      if (!document[key]) throw new Error(`fixture document is missing ${key}`);
    if (document.body.length < 4_000)
      throw new Error(`${document.title} is too short for a visual fixture`);
  }
  if (
    ![1, 2, 3, 4, 5, 6].every((level) =>
      alpineBoardDocument.body.includes(`${"#".repeat(level)} `),
    ) ||
    !alpineBoardDocument.body.includes("> ") ||
    !alpineBoardDocument.body.includes("1. ") ||
    !alpineBoardDocument.body.includes("- ") ||
    !alpineBoardDocument.body.includes("```") ||
    !alpineBoardDocument.body.includes("---") ||
    !alpineBoardDocument.body.includes("*") ||
    !alpineBoardDocument.body.includes("](") ||
    (alpineBoardDocument.body.match(/^\|/gm) ?? []).length < 6
  )
    throw new Error("Alpine Board must retain Markdown visual markers");
  if (
    ![1, 2, 3, 4, 5, 6].every((level) =>
      alpineSystemsDocument.body.includes(`<h${level}>`),
    ) ||
    !alpineSystemsDocument.body.includes("<blockquote") ||
    !alpineSystemsDocument.body.includes("<ol>") ||
    !alpineSystemsDocument.body.includes("<ul>") ||
    !alpineSystemsDocument.body.includes("<pre><code>") ||
    !alpineSystemsDocument.body.includes("<hr") ||
    !alpineSystemsDocument.body.includes("<caption>") ||
    !alpineSystemsDocument.body.includes("<a href=") ||
    (alpineSystemsDocument.body.match(/<table/g) ?? []).length < 2
  )
    throw new Error("Alpine Systems must retain HTML visual markers");
}
